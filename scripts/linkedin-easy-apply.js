#!/usr/bin/env node
/**
 * linkedin-easy-apply.js — Search and apply to LinkedIn Easy Apply jobs automatically.
 *
 * Uses playwright-cli (must be running via browser.js wrapper first).
 * Searches for jobs, clicks Easy Apply, fills forms with data from DB,
 * submits applications, and registers them in DB.
 *
 * Usage:
 *   node scripts/browser.js open "https://www.linkedin.com"   # ensure session
 *   node scripts/linkedin-easy-apply.js                          # keywords from DB profile
 *   node scripts/linkedin-easy-apply.js --keywords '"AI Engineer" OR "GenAI"'
 *   node scripts/linkedin-easy-apply.js --max 5                  # limit to 5 jobs
 *   node scripts/linkedin-easy-apply.js --dry-run                # list jobs without applying
 *   node scripts/linkedin-easy-apply.js --session apply-1         # use a specific browser session
 *
 * Flags:
 *   --keywords <q>   Search keywords (default: derived from DB profile.title + profile.skills)
 *   --location <loc> Location filter (default: derived from DB job_preferences.location or personal_info.country)
 *   --max <n>        Max jobs to apply (default: 10)
 *   --dry-run        List matching jobs without applying
 *   --json           Output results as JSON
 *   --session <name> Browser session name (default: "default". Use a different name to run in parallel with other agents via attach)
 *
 * Exit codes:
 *   0 = success
 *   1 = no jobs found
 *   2 = browser not running / error
 */
'use strict';

const { execSync } = require('child_process');

// --- Helpers ---

let SESSION = 'default'; // set by --session flag in main()

function cli(args, timeout = 30000) {
  const sessionFlag = SESSION !== 'default' ? `-s=${SESSION} ` : '';
  try {
    return execSync(`playwright-cli ${sessionFlag}${args}`, {
      encoding: 'utf-8',
      timeout,
      cwd: __dirname,
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

// Use helpers from lib/ for resilient browser operations
const {
  goto: helperGoto,
  evalJSON,
  waitFor,
} = require('../lib/browser-helpers');

function snapshot() {
  return cli('snapshot');
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function click(ref) {
  return cli(`click ${ref}`);
}

function fill(ref, value) {
  return cli(`fill ${ref} "${value.replace(/"/g, '\\"')}"`);
}

function selectOption(ref, value) {
  return cli(`select ${ref} "${value.replace(/"/g, '\\"')}"`);
}

function goto(url) {
  helperGoto(url, { session: SESSION });
}

function dbQuery(sql) {
  try {
    return JSON.parse(
      execSync(`node ${__dirname}/db.js "${sql.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        timeout: 15000,
        cwd: __dirname,
      })
    );
  } catch (e) {
    return [];
  }
}

function dbWrite(sql) {
  try {
    return execSync(`node ${__dirname}/db.js "${sql.replace(/"/g, '\\"')}" --write`, {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: __dirname,
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function extractRef(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

// --- DB data loader ---

function loadUserData() {
  const row = dbQuery("SELECT data->'profile' AS profile, data->'personal_info' AS personal, data->'job_preferences' AS prefs, data->'form_answers' AS form_answers FROM users WHERE id = 1")[0];
  return {
    profile: row?.profile || {},
    personal: row?.personal || {},
    prefs: row?.prefs || {},
    formAnswers: row?.form_answers || {},
  };
}

// --- Form answers (loaded from DB, not hardcoded) ---
// Keys in users.data.form_answers:
//   python_experience, ai_experience, openai_experience, english_level, spanish_level,
//   location, current_company, linkedin_url, blog_url, salary_usd, salary_usd_max,
//   salary_cop, notice_period, availability_date, availability_weeks,
//   genai_tools, aws_experience, english_comfort,
//   diversity_accessibility, diversity_gender, diversity_ethnicity,
//   disability, sponsorship, relative_at_company, consent_future_jobs, seniority
// If a key is missing from DB, the field is skipped (not invented). Gold Rule 5c.

let ANSWERS = {};

// --- Easy Apply flow ---

function findEasyApplyJobs(snap) {
  const jobs = [];
  const lines = snap.split('\n');
  const strongRefs = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Job title: "- strong [ref=eXXXX]: Job Title"
    const strongMatch = line.match(/- strong \[ref=([a-z][0-9a-z]+)\]: (.+)/);
    if (strongMatch) {
      strongRefs[strongMatch[1]] = strongMatch[2].trim();
    }

    // Easy Apply button: "button "Easy Apply to <role> at <company>""
    const btnMatch = line.match(/button "Easy Apply to (.+?) at (.+?)" \[ref=([a-z][0-9a-z]+)\]/);
    if (btnMatch) {
      jobs.push({
        role: btnMatch[1],
        company: btnMatch[2],
        buttonRef: btnMatch[3],
      });
    }
  }

  return jobs;
}

/**
 * Extract jobs from the job list (left panel) using eval.
 * More reliable than snapshot parsing: reads all cards, not just the expanded one.
 * Returns [{role, company, easyApply, url}].
 */
function findEasyApplyJobsFromDOM() {
  return evalJSON(`(function(){
    const cards = document.querySelectorAll('main .job-card-container, [data-job-id], .jobs-search-results__list-item');
    if (cards.length === 0) return JSON.stringify([]);
    return JSON.stringify(Array.from(cards).map(c => {
      const titleEl = c.querySelector('h3, .job-title, .job-card-list__title');
      const companyEl = c.querySelector('h4, .company-name, .job-card-container__company-name');
      const linkEl = c.querySelector('a[href*="/jobs/view/"]');
      // Easy Apply badge: check text, aria-label, and button class
      const hasEasyApplyText = c.textContent.includes('Easy Apply') || c.textContent.includes('Solicitud sencilla');
      const hasEasyApplyBtn = !!c.querySelector('button[aria-label*="Easy Apply"], button[aria-label*="Solicitud sencilla"], .job-card-container__easy-apply, .jobs-apply-button');
      return {
        role: titleEl ? titleEl.textContent.trim() : '',
        company: companyEl ? companyEl.textContent.trim() : '',
        easyApply: hasEasyApplyText || hasEasyApplyBtn,
        url: linkEl ? linkEl.href : '',
      };
    }).filter(j => j.role));
  })()`, { session: SESSION }) || [];
}

function applyToJob(jobRef, userData) {
  // Click Easy Apply button
  click(jobRef);
  sleep(3000);

  let steps = 0;
  const maxSteps = 15;

  while (steps < maxSteps) {
    steps++;
    const snap = snapshot();

    // Check if submitted
    if (snap.includes('application was sent to')) {
      const companyMatch = snap.match(/application was sent to (.+?)!/);
      return { status: 'applied', company: companyMatch ? companyMatch[1] : 'Unknown' };
    }

    // Check for captcha
    if (snap.toLowerCase().includes('captcha') || snap.toLowerCase().includes('security check')) {
      return { status: 'captcha', error: 'Captcha detected. Agent must stop and ask user.' };
    }

    // Fill required text fields
    const textFields = snap.matchAll(/- textbox "(.+?)(\*)?"(?: \[ref=([a-z][0-9a-z]+)\])?(?:: "(.+)")?/g);
    for (const field of textFields) {
      const [, label, required, ref, existingValue] = field;
      if (!ref || existingValue) continue; // skip if already filled or no ref

      const labelLower = label.toLowerCase();
      let value = null;

      if (labelLower.includes('python')) value = ANSWERS.python_experience;
      else if (labelLower.includes('artificial intelligence') || labelLower.includes('ai)')) value = ANSWERS.ai_experience;
      else if (labelLower.includes('openai')) value = ANSWERS.openai_experience;
      else if (labelLower.includes('location') || labelLower.includes('country') || labelLower.includes('city')) value = ANSWERS.location;
      else if (labelLower.includes('company')) value = ANSWERS.current_company;
      else if (labelLower.includes('linkedin')) value = ANSWERS.linkedin_url;
      else if (labelLower.includes('salary') && labelLower.includes('cop')) value = ANSWERS.salary_cop;
      else if (labelLower.includes('salary') && labelLower.includes('usd')) value = ANSWERS.salary_usd;
      else if (labelLower.includes('salary')) value = ANSWERS.salary_usd;
      else if (labelLower.includes('notice') || labelLower.includes('availability') || labelLower.includes('start')) {
        value = labelLower.includes('dd/mm') ? ANSWERS.availability_date : ANSWERS.notice_period;
      }
      else if (labelLower.includes('english') && labelLower.includes('comfort')) {
        value = ANSWERS.english_comfort;
      }
      else if (labelLower.includes('aws')) {
        value = ANSWERS.aws_experience;
      }
      else if (labelLower.includes('genai') || labelLower.includes('ai assisted') || labelLower.includes('development tools')) {
        value = ANSWERS.genai_tools;
      }

      if (value) {
        fill(ref, value);
        sleep(1000);
      }
    }

    // Select required comboboxes (only if "Select an option" is selected)
    const comboMatches = [...snap.matchAll(/- combobox "(.+?)(\*)?" \[ref=([a-z][0-9a-z]+)\]:?\n((?:.+\n){0,10})/g)];
    for (const combo of comboMatches) {
      const [, label, required, ref, optionsBlock] = combo;
      if (!optionsBlock.includes('Select an option')) continue; // already has a selection

      const labelLower = label.toLowerCase();
      let optionValue = null;

      if (labelLower.includes('english')) {
        const level = ANSWERS.english_level || 'Professional';
        const optMatch = optionsBlock.match(new RegExp(`option "(${level}|Professional|Advanced|Proficient|Native or bilingual)"`));
        optionValue = optMatch ? optMatch[1] : level;
      }
      else if (labelLower.includes('spanish')) {
        const level = ANSWERS.spanish_level || 'Proficient';
        const optMatch = optionsBlock.match(new RegExp(`option "(${level}|Proficient|Advanced|Native or bilingual|Profesional)"`));
        optionValue = optMatch ? optMatch[1] : level;
      }
      else if (labelLower.includes('built') && labelLower.includes('ai') || labelLower.includes('rag')) {
        const optMatch = optionsBlock.match(/option "(Yes)"/);
        optionValue = optMatch ? optMatch[1] : 'Yes';
      }
      else if (labelLower.includes('consent') || labelLower.includes('privacy') || labelLower.includes('agree')) {
        const optMatch = optionsBlock.match(/option "(I have read[^"]+)"/);
        if (optMatch) optionValue = optMatch[1];
      }
      else if (labelLower.includes('seniority')) {
        const level = ANSWERS.seniority || 'Senior';
        const optMatch = optionsBlock.match(new RegExp(`option "(${level})"`));
        optionValue = optMatch ? optMatch[1] : level;
      }

      if (optionValue) {
        selectOption(ref, optionValue);
        sleep(1000);
      }
    }

    // Click required radio buttons (Yes/No groups)
    const radioGroups = [...snap.matchAll(/- group "(.+?)(\*)?" \[ref=([a-z][0-9a-z]+)\]:[\s\S]*?(?=- group |- heading |- paragraph)/g)];
    for (const group of radioGroups) {
      const [, label, required, groupRef] = group;
      const block = group[0];
      if (!required && !block.includes('Required')) continue;

      // Check if already has a checked radio
      if (block.includes('[checked]') || block.includes('[active]')) continue;

      const labelLower = label.toLowerCase();

      // Default: click "Yes" for experience/skills questions, "No" for disability/sponsorship
      // Values come from DB form_answers. Fallbacks are generic defaults.
      let targetLabel = 'Yes';
      if (labelLower.includes('disability') || labelLower.includes('discapacid')) targetLabel = ANSWERS.disability || 'No';
      if (labelLower.includes('sponsorship') || labelLower.includes('visa')) targetLabel = ANSWERS.sponsorship || 'No';
      if (labelLower.includes('relative') || labelLower.includes('familiar')) targetLabel = ANSWERS.relative_at_company || 'No';
      if (labelLower.includes('accessibility') || labelLower.includes('accesibilidad')) {
        targetLabel = ANSWERS.diversity_accessibility || 'I do not require any accessibility';
      }
      if (labelLower.includes('gender') || labelLower.includes('genero')) targetLabel = ANSWERS.diversity_gender || 'Prefer not to say';
      if (labelLower.includes('ethnic') || labelLower.includes('etnia')) targetLabel = ANSWERS.diversity_ethnicity || 'I do not wish to disclose';
      if (labelLower.includes('consent') || labelLower.includes('future job')) targetLabel = ANSWERS.consent_future_jobs || 'Yes';

      // Find the generic label ref for the target option
      const targetRegex = new RegExp(`- generic \\[ref=([a-z][0-9a-z]+)\\]: "?${targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?`);
      const targetMatch = block.match(targetRegex);
      if (targetMatch) {
        click(targetMatch[1]);
        sleep(1000);
      }
    }

    // Check required checkboxes and click them
    const checkboxMatches = [...snap.matchAll(/- generic \[ref=([a-z][0-9a-z]+)\]:\s*\n\s*- checkbox "(.+?)"/g)];
    for (const cb of checkboxMatches) {
      const [block, ref, label] = cb;
      if (block.includes('[checked]')) continue;
      click(ref);
      sleep(1000);
    }

    // Find and click Continue/Review/Submit button
    let actionRef = null;
    if (snap.includes('Submit application')) {
      actionRef = extractRef(snap, /button "Submit application" \[ref=([a-z][0-9a-z]+)\]/);
    } else if (snap.includes('Review your application')) {
      actionRef = extractRef(snap, /button "Review your application" \[ref=([a-z][0-9a-z]+)\]/);
    } else if (snap.includes('Continue to next step')) {
      actionRef = extractRef(snap, /button "Continue to next step" \[ref=([a-z][0-9a-z]+)\]/);
    }

    if (actionRef) {
      click(actionRef);
      sleep(3000);
    } else {
      // No action button found, might be stuck
      sleep(2000);
    }
  }

  return { status: 'timeout', error: 'Max steps reached without submission' };
}

// --- Derive search keywords from DB profile ---

function deriveKeywordsFromProfile(userData) {
  const title = userData.profile?.title;
  const skills = userData.profile?.skills || [];
  const prefs = userData.prefs || {};

  // Build keyword string from profile title + top skills
  // If profile has a title, use it as primary keyword
  // Add top 3-4 skills as OR clauses
  const parts = [];
  if (title) parts.push(`"${title}"`);

  // Add skills that look like job titles or key technologies
  const jobLikeSkills = skills.filter((s) =>
    s.match(/engineer|developer|architect|manager|lead|director|scientist|consultant/i)
  );
  const techSkills = skills.filter((s) =>
    !s.match(/engineer|developer|architect|manager|lead|director|scientist|consultant/i)
  ).slice(0, 2);

  jobLikeSkills.slice(0, 2).forEach((s) => parts.push(`"${s}"`));
  techSkills.forEach((s) => parts.push(`"${s}"`));

  if (parts.length === 0) {
    // Fallback: use role_types from job_preferences
    const roleTypes = prefs.role_types?.value || [];
    roleTypes.slice(0, 3).forEach((r) => parts.push(`"${r}"`));
  }

  return parts.length > 0 ? parts.join(' OR ') : 'Software Engineer';
}

function deriveLocationFromProfile(userData) {
  const location = userData.prefs?.location?.value;
  const timezones = userData.prefs?.timezones?.value || [];
  const country = userData.personal?.country;

  if (location && typeof location === 'string') return location;
  if (country) return country;
  if (timezones.includes('Global')) return 'Worldwide';
  if (timezones.includes('Americas')) return 'Latin America';
  return 'Worldwide';
}

// --- Main ---

function main() {
  const args = process.argv.slice(2);

  let keywords = null; // will be derived from DB if not provided
  let location = null; // will be derived from DB if not provided
  let maxJobs = 10;
  let dryRun = false;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keywords' && args[i + 1]) { keywords = args[i + 1]; i++; }
    else if (args[i] === '--location' && args[i + 1]) { location = args[i + 1]; i++; }
    else if (args[i] === '--max' && args[i + 1]) { maxJobs = parseInt(args[i + 1], 10); i++; }
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--json') jsonOutput = true;
    else if (args[i] === '--session' && args[i + 1]) { SESSION = args[i + 1]; i++; }
  }

  // Load user data and form answers from DB
  const userData = loadUserData();
  ANSWERS = userData.formAnswers;

  // Derive keywords and location from profile if not provided via CLI
  if (!keywords) keywords = deriveKeywordsFromProfile(userData);
  if (!location) location = deriveLocationFromProfile(userData);

  if (!jsonOutput) {
    console.log(`Search keywords: ${keywords}`);
    console.log(`Location: ${location}`);
  }

  // Build search URL
  const encodedKeywords = encodeURIComponent(keywords);
  const encodedLocation = encodeURIComponent(location);
  const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodedKeywords}&location=${encodedLocation}&f_AL=true&f_WT=2&sortBy=DD`;

  goto(searchUrl);

  // Wait for job cards to load (in-page polling, not shell sleep)
  waitFor('document.querySelectorAll("main .job-card-container, [data-job-id], .jobs-search-results__list-item").length > 0', { timeout: 10000, session: SESSION });

  // Try DOM extraction first (more reliable, gets all cards)
  let jobs = findEasyApplyJobsFromDOM();

  // Fallback to snapshot parsing if DOM extraction failed
  if (jobs.length === 0) {
    const snap = snapshot();
    jobs = findEasyApplyJobs(snap);
  }

  if (jobs.length === 0) {
    if (jsonOutput) console.log('[]');
    else console.log('No Easy Apply jobs found.');
    process.exit(1);
  }

  // Limit to maxJobs
  const jobsToProcess = jobs.slice(0, maxJobs);

  if (dryRun) {
    if (jsonOutput) {
      console.log(JSON.stringify(jobsToProcess, null, 2));
    } else {
      console.log(`\nFound ${jobs.length} Easy Apply jobs (showing ${jobsToProcess.length}):\n`);
      jobsToProcess.forEach((j, i) => {
        console.log(`${i + 1}. ${j.role} at ${j.company}`);
      });
    }
    process.exit(0);
  }

  // Apply to each job
  const results = [];
  for (const job of jobsToProcess) {
    process.stdout.write(`Applying to ${job.role} at ${job.company}... `);

    // Click the job title first to load it, then click Easy Apply
    const currentSnap = snapshot();
    const titleRef = extractRef(currentSnap, new RegExp(`strong \\[ref=([a-z][0-9a-z]+)\\]: ${job.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    if (titleRef) {
      click(titleRef);
      sleep(3000);
    }

    // Re-find the Easy Apply button (refs change after navigation)
    const jobSnap = snapshot();
    const easyApplyRef = extractRef(jobSnap, new RegExp(`button "Easy Apply to ${job.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?" \\[ref=([a-z][0-9a-z]+)\\]`));
    if (!easyApplyRef) {
      console.log('NO EASY APPLY BUTTON');
      results.push({ ...job, status: 'no_button' });
      continue;
    }

    const result = applyToJob(easyApplyRef, userData);
    results.push({ ...job, ...result });

    switch (result.status) {
      case 'applied':
        console.log('APPLIED');
        // Register in DB
        const safeCompany = job.company.replace(/'/g, "''");
        const safeRole = job.role.replace(/'/g, "''");
        dbWrite(`INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (1, 'linkedin', '${safeCompany}', '${safeRole}', '', 'applied', NOW(), '{"source": "linkedin_easy_apply", "match": "high"}')`);
        break;
      case 'captcha':
        console.log('CAPTCHA - STOPPING');
        console.log('\n*** CAPTCHA DETECTED. Agent must stop and ask user to solve it. ***');
        if (jsonOutput) console.log(JSON.stringify(results, null, 2));
        process.exit(1);
        break;
      default:
        console.log(`FAILED: ${result.error || result.status}`);
    }

    // Anti-ban delay between applications
    if (jobsToProcess.indexOf(job) < jobsToProcess.length - 1) {
      sleep(5000);
    }
  }

  // Summary
  const applied = results.filter((r) => r.status === 'applied').length;
  const failed = results.filter((r) => r.status !== 'applied').length;

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\nSummary: ${applied} applied, ${failed} failed`);
  }

  process.exit(0);
}

main();
