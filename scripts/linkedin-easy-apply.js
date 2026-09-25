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
const path = require('path');

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

function press(key) {
  return cli(`press ${key}`);
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

function loadAuthState() {
  try {
    execSync(`node scripts/browser.js load-state`, {
      encoding: 'utf-8',
      timeout: 10000,
      cwd: path.dirname(__dirname), // Use repo root, not scripts/ dir
    });
    console.log('[apply] Auth state loaded from .browser-profile/auth-state.json');
  } catch (e) {
    console.warn('[apply] Failed to load auth state (may be first run):', e.message);
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
      // LinkedIn UI changes frequently: try multiple selectors for title
      const titleEl = c.querySelector('h3, .job-title, .job-card-list__title, strong, [class*="title"]');
      // Company: try h4, then div with company-name class, then any div that looks like a company
      let companyEl = c.querySelector('h4, .company-name, .job-card-container__company-name, [class*="company"]');
      if (!companyEl) {
        // Fallback: find a div whose text is short and not the title or location
        const divs = c.querySelectorAll('div');
        for (const d of divs) {
          const txt = d.textContent.trim();
          if (txt.length > 2 && txt.length < 60 && !txt.includes('remoto') && !txt.includes('Remote')
              && !txt.includes('Solicitud') && !txt.includes('Easy Apply')
              && d.querySelector('strong') === null) {
            companyEl = d;
            break;
          }
        }
      }
      const linkEl = c.querySelector('a[href*="/jobs/view/"]');
      // Easy Apply badge: check text, aria-label, and button class
      const hasEasyApplyText = c.textContent.includes('Easy Apply') || c.textContent.includes('Solicitud sencilla');
      const hasEasyApplyBtn = !!c.querySelector('button[aria-label*="Easy Apply"], button[aria-label*="Solicitud sencilla"], .job-card-container__easy-apply, .jobs-apply-button');
      // Get title from strong element if h3 not found
      let role = '';
      if (titleEl) {
        role = titleEl.textContent.trim();
        // If titleEl is a strong, it might be the same as the role
        if (titleEl.tagName === 'STRONG' && role.length > 100) role = '';
      }
      return {
        role: role,
        company: companyEl ? companyEl.textContent.trim() : '',
        easyApply: hasEasyApplyText || hasEasyApplyBtn,
        url: linkEl ? linkEl.href : '',
      };
    }).filter(j => j.role));
  })()`, { session: SESSION }) || [];
}

function applyToJob(jobRef, userData) {
  // Click Easy Apply button - try eval first (more reliable), then ref-based click
  const evalResult = evalJSON(`(function(){
    // Try multiple selectors for the Easy Apply button
    const btn = document.querySelector('a[href*="openSDUIApplyFlow"]') ||
                document.querySelector('.jobs-apply-button') ||
                document.querySelector('.job-card-container__easy-apply');
    if (btn) { btn.click(); return JSON.stringify({clicked: true}); }
    return JSON.stringify({clicked: false});
  })()`, { session: SESSION });
  if (!evalResult || !evalResult.clicked) {
    // Fallback: ref-based click
    click(jobRef);
  }
  sleep(5000);

  let steps = 0;
  const maxSteps = 15;

  while (steps < maxSteps) {
    steps++;
    const snap = snapshot();

    // Debug: log what we see in each step
    const hasDialog = snap.includes('dialog');
    const hasProgress = snap.match(/Valor actual: (\d+)/);
    const hasNext = snap.includes('Ir al siguiente paso') || snap.includes('Continue to next step');
    const hasReview = snap.includes('Revisar tu solicitud') || snap.includes('Review your application');
    const hasSubmit = snap.includes('Enviar solicitud') || snap.includes('Submit application');
    const hasRadio = snap.includes('- group ');
    const hasText = snap.includes('textbox ');
    const hasCombo = snap.includes('combobox ');
    // Extract field labels for debugging
    const textLabels = [...snap.matchAll(/- textbox "(.+?)(?:\*)?"(?: \[ref=)?/g)].map(m => m[1].trim()).slice(0, 5);
    const comboLabels = [...snap.matchAll(/- combobox "(.+?)(?:\*)?" /g)].map(m => m[1].trim()).slice(0, 5);
    process.stdout.write(`\n[step ${steps} prog=${hasProgress?.[1]||'-'} next=${hasNext} review=${hasReview} submit=${hasSubmit}] `);
    if (textLabels.length) process.stdout.write(`texts=[${textLabels.join('|')}] `);
    if (comboLabels.length) process.stdout.write(`combos=[${comboLabels.join('|')}] `);

    // Check if submitted (English or Spanish)
    if (snap.includes('application was sent to') || snap.includes('Solicitud enviada') || snap.includes('solicitud fue enviada') || snap.includes('se ha enviado tu solicitud') || snap.includes('tu solicitud se ha enviado')) {
      const companyMatch = snap.match(/application was sent to (.+?)!/) || snap.match(/solicitud (?:fue enviada|se ha enviado|enviada) a (.+?)[!.]/i);
      return { status: 'applied', company: companyMatch ? companyMatch[1] : 'Unknown' };
    }

    // Check for captcha
    if (snap.toLowerCase().includes('captcha') || snap.toLowerCase().includes('security check')) {
      return { status: 'captcha', error: 'Captcha detected. Agent must stop and ask user.' };
    }

    // Fill required text fields
    // Regex captures values both with quotes ("value") and without quotes (value)
    const textFields = snap.matchAll(/- textbox "(.+?)(\*)?"(?: \[ref=([a-z][0-9a-z]+)\])?(?:: (?:"([^"]+)"|([^\n]+)))?/g);
    for (const field of textFields) {
      const [, label, required, ref, existingValueQuoted, existingValueUnquoted] = field;
      const existingValue = existingValueQuoted || existingValueUnquoted;
      if (existingValue) continue; // skip if already filled (fields without ref still get eval-filled below)

      const labelLower = label.toLowerCase();
      let value = null;
      if (labelLower.includes('first name') || labelLower.includes('nombre')) value = ANSWERS.first_name;
      else if (labelLower.includes('last name') || labelLower.includes('apellido')) value = ANSWERS.last_name;
      else if (labelLower.includes('python')) value = ANSWERS.python_experience;
      else if (labelLower.includes('javascript') || labelLower.includes('java script')) value = ANSWERS.javascript_experience;
      else if (labelLower.includes('typescript') || labelLower.includes('type script')) value = ANSWERS.typescript_experience;
      else if (labelLower.includes('react')) value = ANSWERS.react_experience;
      else if (labelLower.includes('next.js') || labelLower.includes('nextjs') || labelLower.includes('next js')) value = ANSWERS.nextjs_experience || ANSWERS.react_experience;
      else if (labelLower.includes('node') || labelLower.includes('nodejs') || labelLower.includes('node.js')) value = ANSWERS.nodejs_experience;
      else if (labelLower.includes('software engineering') || labelLower.includes('software development')) value = ANSWERS.years_of_experience;
      else if (labelLower.includes('artificial intelligence') || labelLower.includes('ai)') || labelLower.includes('generative ai') || labelLower.includes('genai') || labelLower.includes('gen ai')) value = ANSWERS.ai_experience || ANSWERS.genai_tools;
      else if (labelLower.includes('openai')) value = ANSWERS.openai_experience;
      else if (labelLower.includes('location') || labelLower.includes('country') || labelLower.includes('city') || labelLower.includes('ciudad') || labelLower.includes('ubicaci') || labelLower.includes('localidad')) value = ANSWERS.location;
      else if (labelLower.includes('phone') || labelLower.includes('mobile') || labelLower.includes('celular') || labelLower.includes('cellulare') || labelLower.includes('telefon') || labelLower.includes('teléfono')) {
        // LinkedIn splits phone: country code goes in a separate combobox, this field wants the local number
        const rawPhone = (userData?.personal?.phone || ANSWERS.phone || '').replace(/\D/g, '');
        value = rawPhone.startsWith('549') ? rawPhone.substring(3) : rawPhone.replace(/^54/, '');
      }
      else if (labelLower.includes('school') || labelLower.includes('escuela') || labelLower.includes('university') || labelLower.includes('universidad')) value = ANSWERS.school_name;
      else if (labelLower.includes('degree') || labelLower.includes('título') || labelLower.includes('titulo')) value = ANSWERS.degree;
      else if (labelLower.includes('field of study') || labelLower.includes('major') || labelLower.includes('carrera')) value = ANSWERS.field_of_study;
      else if (labelLower.includes('company')) value = ANSWERS.current_company;
      else if (labelLower.includes('linkedin')) value = ANSWERS.linkedin_url;
      else if (labelLower.includes('headline') || labelLower.includes('título profesional') || labelLower.includes('titular')) value = ANSWERS.headline || userData?.profile?.headline;
      else if (labelLower.includes('summary') || labelLower.includes('resumen')) value = ANSWERS.summary || userData?.profile?.summary;
      else if (labelLower.includes('salary') && labelLower.includes('cop')) value = ANSWERS.salary_cop;
      else if (labelLower.includes('usd') && (labelLower.includes('salary') || labelLower.includes('salarial') || labelLower.includes('salario'))) value = ANSWERS.salary_usd;
      else if (labelLower.includes('salary') || labelLower.includes('salarial') || labelLower.includes('salario') || labelLower.includes('remuneraci') || labelLower.includes('remuneraç')) value = ANSWERS.salary_usd;
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
      // Generic fallback: "How many years of work experience do you have with X?" (EN/ES/PT)
      else if ((labelLower.includes('years') || labelLower.includes('anos') || labelLower.includes('años') || labelLower.includes('tiempo')) && (labelLower.includes('experience') || labelLower.includes('experiencia') || labelLower.includes('experiência') || labelLower.includes('working') || labelLower.includes('trabajando') || labelLower.includes('estud') || labelLower.includes('tienes') || labelLower.includes('tiene') || labelLower.includes('tens') || labelLower.includes('têm'))) {
        value = ANSWERS.years_of_experience;
      }

      if (value) {
        process.stdout.write(`FILL val="${value}" `);
        // Prefer Playwright fill (real focus + input events that commit React state)
        if (ref) fill(ref, value);
        // Also run eval setter as backup for non-React-controlled fields
        const fillResult = evalJSON(`(function(){
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], input[type="email"], input:not([type]), textarea');
          const labelPart = ${JSON.stringify(label.substring(0, 40))};
          for (const inp of inputs) {
            const ariaLabel = inp.getAttribute('aria-label') || '';
            const placeholder = inp.getAttribute('placeholder') || '';
            if (ariaLabel.includes(labelPart) || placeholder.includes(labelPart) || labelPart.includes(ariaLabel)) {
              nativeSetter.call(inp, ${JSON.stringify(value)});
              inp.dispatchEvent(new Event('input', {bubbles: true}));
              inp.dispatchEvent(new Event('change', {bubbles: true}));
              inp.dispatchEvent(new Event('blur', {bubbles: true}));
              return JSON.stringify({filled: true});
            }
          }
          return JSON.stringify({filled: false});
        })()`, { session: SESSION });
        if (!fillResult || !fillResult.filled) {
          // Field had no snapshot ref and eval found no matching input
          process.stdout.write('[nofill] ');
        }
        // Location-like textboxes are often autocompletes: pick the first suggestion
        if (labelLower.includes('location') || labelLower.includes('city') || labelLower.includes('ciudad') || labelLower.includes('ubicaci')) {
          sleep(1500);
          press('ArrowDown');
          sleep(400);
          press('Enter');
          sleep(800);
        }
        sleep(1500);
      } else {
        process.stdout.write(`SKIP label="${label.substring(0,40)}" `);
      }
    }

    // Select required comboboxes (only if no selection is made)
    const comboMatches = [...snap.matchAll(/- combobox "(.+?)(\*)?" \[ref=([a-z][0-9a-z]+)\][^\n]*:?\n((?:(?!\s*- combobox|\s*- textbox|\s*- group)[^\n]*\n){0,20})/g)];
    for (const combo of comboMatches) {
      const [, label, required, ref, optionsBlock] = combo;
      // Skip non-form comboboxes (LinkedIn UI elements)
      if (label.toLowerCase().includes('seleccionar idioma') || label.toLowerCase().includes('select language')) continue;
      // Skip if a real option is selected (not "Select an option")
      // For autocomplete fields (location/city), a highlighted suggestion can show as [selected]
      // without being a committed selection, so always process them
      const labelLower = label.toLowerCase();
      const isAutocomplete = labelLower.includes('location') || labelLower.includes('city');
      const placeholderRe = /option "(Select an option|Seleccionar[^"]*|Selecionar[^"]*|Elige[^"]*|Choose[^"]*|Bitte[^"]*|Sélectionner[^"]*)"\s*\[selected\]/i;
      const hasRealSelection = optionsBlock.includes('[selected]') && !placeholderRe.test(optionsBlock);
      if (hasRealSelection && !isAutocomplete) continue;

      let optionValue = null;

      if (labelLower.includes('english') || labelLower.includes('inglés') || labelLower.includes('ingles')) {
        const level = ANSWERS.english_level || 'Professional';
        const optMatch = optionsBlock.match(new RegExp(`option "(${level}|Professional|Advanced|Proficient|Native or bilingual|Competencia profesional|Intermedio|Intermedio-alto|Bilingüe|Bilingue)[^"]*"`));
        optionValue = optMatch ? optMatch[1] : level;
      }
      else if (labelLower.includes('spanish')) {
        const level = ANSWERS.spanish_level || 'Proficient';
        const optMatch = optionsBlock.match(new RegExp(`option "(${level}|Proficient|Advanced|Native or bilingual|Profesional)"`));
        optionValue = optMatch ? optMatch[1] : level;
      }
      else if (labelLower.includes('email')) {
        const email = ANSWERS.email || userData?.profile?.email || '';
        if (email) {
          const optMatch = optionsBlock.match(new RegExp(`option "(${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})"`));
          optionValue = optMatch ? optMatch[1] : email;
        }
      }
      else if (labelLower.includes('phone country') || labelLower.includes('country code') || labelLower.includes('prefisso') || labelLower.includes('código') || labelLower.includes('codigo') || labelLower.includes('paese') || labelLower.includes('país') || labelLower.includes('pais')) {
        const optMatch = optionsBlock.match(/option "([^"]*Argentina[^"]*)"/) || optionsBlock.match(/option "([^"]*\+54[^"]*)"/);
        optionValue = optMatch ? optMatch[1] : 'Argentina (+54)';
      }
      else if (labelLower.includes('location') || labelLower.includes('city')) {
        const city = userData?.personal?.city || userData?.profile?.location || '';
        if (city) {
          const optMatch = optionsBlock.match(new RegExp(`option "([^"]*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"`));
          optionValue = optMatch ? optMatch[1] : null;
        }
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
      else if ((labelLower.match(/mes de (from|inicio|desde)/) || (labelLower.match(/\bfrom\b|\bstart\b/) && labelLower.match(/\bmonth\b|\bmes\b/)) || labelLower === 'from') && optionsBlock.match(/January|February|Enero|Febrero|Jan|Feb/)) {
        optionValue = ANSWERS.edu_from_month || null;
      }
      else if ((labelLower.match(/año de (from|inicio|desde)/) || (labelLower.match(/\bfrom\b|\bstart\b/) && labelLower.match(/\byear\b|\baño\b/))) && optionsBlock.match(/\b(19|20)\d{2}\b/)) {
        optionValue = ANSWERS.edu_from_year || null;
      }
      else if ((labelLower.match(/mes de (to|hasta|fin)/) || (labelLower.match(/\bto\b|\bend\b|\bhasta\b/) && labelLower.match(/\bmonth\b|\bmes\b/))) && optionsBlock.match(/January|February|Enero|Febrero|Jan|Feb/)) {
        optionValue = ANSWERS.edu_to_month || null;
      }
      else if ((labelLower.match(/año de (to|hasta|fin)/) || (labelLower.match(/\bto\b|\bend\b|\bhasta\b/) && labelLower.match(/\byear\b|\baño\b/))) && optionsBlock.match(/\b(19|20)\d{2}\b/)) {
        optionValue = ANSWERS.edu_to_year || null;
      }
      // Generic Yes/No combobox questions (EN/ES/PT)
      else if (optionsBlock.match(/option "(Yes|No|Sí|Si|Sim|Não)"/)) {
        // Answer Yes for most questions, No for sponsorship/visa/authorization
        const yesWord = optionsBlock.match(/option "(Yes|Sí|Si|Sim)"/)?.[1] || 'Yes';
        const noWord = optionsBlock.match(/option "(No|Não)"/)?.[1] || 'No';
        let answer = yesWord;
        if (labelLower.includes('sponsorship') || labelLower.includes('visa')) answer = noWord;
        if (labelLower.includes('authorized') && labelLower.includes('work')) answer = noWord;
        if (labelLower.includes('currently located in') || labelLower.includes('based in') || labelLower.includes('residing in') || labelLower.includes('located in') || labelLower.includes('ubicado') || labelLower.includes('resides')) answer = noWord;
        const optMatch = optionsBlock.match(new RegExp(`option "(${answer})"`));
        optionValue = optMatch ? optMatch[1] : answer;
      }

      if (optionValue) {
        process.stdout.write(`COMBO val="${optionValue}" `);
        // Use eval-based selection for React compatibility
        const selResult = evalJSON(`(function(){
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          const selects = document.querySelectorAll('select');
          const labelPart = ${JSON.stringify(label.substring(0, 40))};
          for (const sel of selects) {
            const ariaLabel = sel.getAttribute('aria-label') || '';
            if (ariaLabel.includes(labelPart) || labelPart.includes(ariaLabel)) {
              for (const opt of sel.options) {
                if (opt.text === ${JSON.stringify(optionValue)} || opt.text.trim() === ${JSON.stringify(optionValue)}) {
                  nativeSetter.call(sel, opt.value);
                  sel.dispatchEvent(new Event('change', {bubbles: true}));
                  sel.dispatchEvent(new Event('input', {bubbles: true}));
                  return JSON.stringify({selected: true, value: opt.value});
                }
              }
            }
          }
          return JSON.stringify({selected: false});
        })()`, { session: SESSION });
        if (!selResult || !selResult.selected) {
          // Fallback: ref-based selectOption
          selectOption(ref, optionValue);
        }
        sleep(1000);
      } else if (labelLower.includes('location') || labelLower.includes('city')) {
        // Autocomplete combobox: type and select from suggestions
        process.stdout.write(`COMBO_AUTO label="${label.substring(0,30)}" `);
        const city = userData?.personal?.city || userData?.profile?.location || ANSWERS.location || '';
        // Focus the inner input of the combobox (the ref is often a wrapper div)
        const focusRes = cli(`eval "(el) => { const i = el.tagName === 'INPUT' ? el : el.querySelector('input'); if (i) { i.focus(); i.click(); } return i ? i.tagName + ':' + (i.getAttribute('aria-label') || '') : 'none'; }" ${ref}`);
        process.stdout.write(`[focus ${String(focusRes).substring(0,60)}] `);
        sleep(500);
        // Type real keystrokes so LinkedIn's typeahead search fires
        cli(`type "${city.replace(/"/g, '\\"')}"`);
        sleep(2500);
        const dbg = evalJSON(`(function(){
          const ae = document.activeElement;
          const opts = document.querySelectorAll('[role="option"], [role="listitem"], li[class*="typeahead"]');
          return JSON.stringify({tag: ae && ae.tagName, val: ae && ae.value ? ae.value.substring(0,30) : '', opts: opts.length});
        })()`, { session: SESSION });
        process.stdout.write(`[dbg ${JSON.stringify(dbg)}] `);
        // Try to click the first suggestion (accent-insensitive match); dispatch pointer events because LinkedIn listens to mousedown
        const sugResult = evalJSON(`(function(){
          const norm = s => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
          const cityN = norm(${JSON.stringify(city)});
          const options = document.querySelectorAll('[role="option"], [role="listitem"], li[class*="basic-typeahead"], [id*="typeahead"] li');
          const fire = (el) => {
            ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t =>
              el.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, view:window})));
          };
          for (const opt of options) {
            const text = opt.textContent.trim();
            if (text && norm(text).includes(cityN)) {
              fire(opt);
              return JSON.stringify({clicked: true, text: text.substring(0, 40)});
            }
          }
          if (options.length > 0) {
            fire(options[0]);
            return JSON.stringify({clicked: true, text: options[0].textContent.trim().substring(0, 40)});
          }
          return JSON.stringify({clicked: false});
        })()`, { session: SESSION });
        // If the suggestion list is still open (DOM click didn't commit), use keyboard selection
        const listOpen = evalJSON(`(function(){
          const lb = document.querySelector('[role="listbox"]:not([hidden]), [role="listbox"][aria-expanded="true"], ul[class*="typeahead"]');
          const anyInput = document.activeElement;
          const expanded = anyInput && anyInput.getAttribute && anyInput.getAttribute('aria-expanded') === 'true';
          return JSON.stringify({open: !!(lb || expanded)});
        })()`, { session: SESSION });
        if (!sugResult || !sugResult.clicked || (listOpen && listOpen.open)) {
          press('ArrowDown');
          sleep(500);
          press('Enter');
          sleep(1000);
        }
        // Extra fallback: Tab out to commit whatever was typed
        press('Tab');
        sleep(1000);
      } else {
        // For comboboxes with no matching handler, try eval-based selection
        // This handles Yes/No comboboxes that don't show options in snapshot
        process.stdout.write(`COMBO_EVAL label="${label.substring(0,30)}" `);
        let answer = 'Yes';
        if (labelLower.includes('sponsorship') || labelLower.includes('visa')) answer = 'No';
        if (labelLower.includes('authorized') && labelLower.includes('work')) answer = 'No';
        if (labelLower.includes('citizen') && labelLower.includes('us')) answer = 'No';
        if (labelLower.includes('manufacturing') || labelLower.includes('mes') || labelLower.includes('scada')) answer = 'No';
        if (labelLower.includes('based in') && (labelLower.includes('latin america') || labelLower.includes('latam'))) answer = 'Yes';
        if (labelLower.includes('remote') && labelLower.includes('year')) answer = 'Yes';

        // Try to select via eval
        const selectResult = evalJSON(`(function(){
          const select = document.querySelector('[aria-label="${label.replace(/"/g, '\\"').substring(0, 80)}"]');
          if (select && select.tagName === 'SELECT') {
            for (const opt of select.options) {
              if (opt.text === '${answer}') {
                opt.selected = true;
                select.dispatchEvent(new Event('change', {bubbles: true}));
                return JSON.stringify({selected: true, value: opt.value});
              }
            }
          }
          return JSON.stringify({selected: false});
        })()`, { session: SESSION });
        if (!selectResult || !selectResult.selected) {
          // Fallback: try selectOption with ref
          try { selectOption(ref, answer); } catch(e) {}
        }
        sleep(1000);
      }
    }

    // Click required radio buttons (Yes/No groups)
    // Regex handles both English ("Required") and Spanish ("Obligatorio") required indicators
    const radioGroups = [...snap.matchAll(/- group "(.+?)" \[ref=([a-z][0-9a-z]+)\]:([\s\S]*?)(?=- group |- heading |- paragraph)/g)];
    for (const group of radioGroups) {
      const [, label, groupRef, blockContent] = group;
      const block = group[0];
      // Check if required: look for *, Required, or Obligatorio in label or block
      const isRequired = label.includes('*') || label.includes('Required') || label.includes('Obligatorio')
        || block.includes('Required') || block.includes('Obligatorio');
      if (!isRequired) continue;

      // Check if already has a checked radio
      if (block.includes('[checked]') || block.includes('[active]')) continue;

      const labelLower = label.toLowerCase();

      // Default: click "Yes" for experience/skills questions, "No" for disability/sponsorship
      // Values come from DB form_answers. Fallbacks are generic defaults.
      let targetLabel = 'Yes';
      if (labelLower.includes('disability') || labelLower.includes('discapacid')) targetLabel = ANSWERS.disability || 'No';
      if (labelLower.includes('sponsorship') || labelLower.includes('visa')) targetLabel = ANSWERS.sponsorship || 'No';
      if (labelLower.includes('authorized') && labelLower.includes('work')) targetLabel = ANSWERS.work_authorization_us || 'No';
      if (labelLower.includes('relative') || labelLower.includes('familiar')) targetLabel = ANSWERS.relative_at_company || 'No';
      if (labelLower.includes('accessibility') || labelLower.includes('accesibilidad')) {
        targetLabel = ANSWERS.diversity_accessibility || 'I do not require any accessibility';
      }
      if (labelLower.includes('gender') || labelLower.includes('genero')) targetLabel = ANSWERS.diversity_gender || 'Prefer not to say';
      if (labelLower.includes('ethnic') || labelLower.includes('etnia')) targetLabel = ANSWERS.diversity_ethnicity || 'I do not wish to disclose';
      if (labelLower.includes('consent') || labelLower.includes('future job')) targetLabel = ANSWERS.consent_future_jobs || 'Yes';
      if (labelLower.includes('background check') || labelLower.includes('antecedentes')) targetLabel = ANSWERS.background_check || 'Yes';

      // Find the radio element ref for the target option
      // Try matching radio "Label" first, then generic ref: "Label"
      const radioRegex = new RegExp(`radio "${targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i');
      const radioMatch = block.match(radioRegex);
      if (radioMatch) {
        // Find the ref of the generic element containing this radio
        const refRegex = new RegExp(`- generic \\[ref=([a-z][0-9a-z]+)\\]:\\s*\\n\\s*- radio "${targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i');
        const refMatch = block.match(refRegex);
        if (refMatch) {
          click(refMatch[1]);
          sleep(1000);
        }
      } else {
        // Fallback: find generic label ref
        const targetRegex = new RegExp(`- generic \\[ref=([a-z][0-9a-z]+)\\]: "?${targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?`);
        const targetMatch = block.match(targetRegex);
        if (targetMatch) {
          click(targetMatch[1]);
          sleep(1000);
        }
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

    // Find and click Continue/Review/Submit button (English or Spanish)
    let actionRef = null;
    if (snap.includes('Submit application') || snap.includes('Enviar solicitud') || snap.includes('Presentar solicitud')) {
      actionRef = extractRef(snap, /button "(?:Submit application|Enviar solicitud|Presentar solicitud)" \[ref=([a-z][0-9a-z]+)\]/);
    } else if (snap.includes('Review your application') || snap.includes('Revisar tu solicitud') || snap.includes('Revisa tu solicitud')) {
      actionRef = extractRef(snap, /button "(?:Review your application|Revisar tu solicitud|Revisa tu solicitud)" \[ref=([a-z][0-9a-z]+)\]/);
    } else if (snap.includes('Continue to next step') || snap.includes('Ir al siguiente paso') || snap.includes('Continuar al siguiente paso') || snap.includes('Siguiente')) {
      actionRef = extractRef(snap, /button "(?:Continue to next step|Ir al siguiente paso|Continuar al siguiente paso|Siguiente)" \[ref=([a-z][0-9a-z]+)\]/);
    }

    if (actionRef) {
      process.stdout.write(`actionRef=${actionRef} `);
      click(actionRef);
      sleep(3000);
    } else {
      process.stdout.write('NO ACTION REF ');
      // Try eval-based click as fallback
      const evalClick = evalJSON(`(function(){
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          const text = b.textContent.trim();
          if (text.includes('Revisar') || text.includes('Review') || text.includes('Enviar') || text.includes('Submit') || text.includes('Siguiente') || text.includes('Next')) {
            b.click();
            return JSON.stringify({clicked: true, text: text});
          }
        }
        return JSON.stringify({clicked: false});
      })()`, { session: SESSION });
      process.stdout.write(`evalClick=${JSON.stringify(evalClick)} `);
      sleep(3000);
    }
  }

  return { status: 'timeout', error: 'Max steps reached without submission' };
}

// --- Title filtering ---
// Easy Apply search results are noisy: LinkedIn returns non-tech roles
// (attorney, sales, tutors, support) even for tech keyword searches.
// A job is only applied if its title matches a tech role AND does not
// match the blocklist. The blocklist is extended with job_preferences.avoid
// from DB (user-specific, Gold Rule 9).

const TECH_TITLE_RE = /\b(developer|desarrollador|desenvolvedor|d[ée]veloppeur|engineer|ingeniero|engenheiro|ing[ée]nieur|software|programador|frontend|front[- ]?end|backend|back[- ]?end|full[- ]?stack|fullstack|devops|sre|site reliability|data (scientist|engineer|analyst)|machine learning|\bml\b|\bai\b|artificial intelligence|\bllm\b|genai|cloud|architect|arquitecto|\bqa\b|sdet|test automation|security engineer|platform engineer|mobile|ios|android|react|angular|vue|svelte|node\.?js|python|java(?!script)|golang|rust|ruby|php|typescript|javascript|tech lead|technical lead|engineering manager|cto|product manager|data engineer|analytics|blockchain|web3|firmware|embedded)\b/i;

const BLOCK_TITLE_RE = /\b(attorney|lawyer|paralegal|legal|abogado|sales|account executive|tutor|teacher|tefl|tesol|esl|profesor|docente|customer support|customer service|customer success|soporte|recruiter|talent acquisition|marketing|seo|copywriter|content writer|social media|community manager|nurse|medical|doctor|physician|pharmacist|dentist|driver|warehouse|receptionist|assistant|asistente|real estate|insurance(?! tech)|accountant|contador|finance|finanzas|\bhr\b|human resources|recursos humanos|chef|cleaner|technician|mechanic|electrician|plumber|retail|cashier|barista|translator|interpreter|traductor|surveyor|logistics|supply chain|procurement|consultor funcional|functional consultant)\b/i;

/**
 * Returns { pass: boolean, reason: string } for a job title.
 * Pass requires: title matches a tech role AND does not hit the blocklist.
 */
function checkJobTitle(job, userData) {
  const title = job.role || '';
  const userAvoid = userData.prefs?.avoid || [];
  const avoidRe = userAvoid.length
    ? new RegExp(userAvoid.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
    : null;

  if (BLOCK_TITLE_RE.test(title)) {
    return { pass: false, reason: 'non_tech_title' };
  }
  if (avoidRe && avoidRe.test(title)) {
    return { pass: false, reason: 'user_avoid' };
  }
  if (!TECH_TITLE_RE.test(title)) {
    return { pass: false, reason: 'no_tech_keyword' };
  }
  return { pass: true, reason: 'title_ok' };
}

// --- Derive search keywords from DB profile ---

function deriveKeywordsFromProfile(userData) {
  const title = userData.profile?.title || userData.profile?.role;
  const rawSkills = userData.profile?.skills || [];
  const skills = Array.isArray(rawSkills)
    ? rawSkills
    : Object.values(rawSkills).flat();
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
  const timezones = userData.prefs?.timezones?.value
    || userData.prefs?.strong_preferences?.timezones
    || [];
  const country = userData.personal?.country;

  // Remote-first: if must_have is 100% remote, search worldwide
  const remoteMust = userData.prefs?.must_haves?.remote;
  if (remoteMust && typeof remoteMust === 'string' && /remote/i.test(remoteMust)) {
    return 'Worldwide';
  }

  if (location && typeof location === 'string') return location;
  if (timezones.includes('Global') || timezones.includes('any')) return 'Worldwide';
  if (timezones.includes('Americas') || timezones.includes('Latin America')) return 'Latin America';
  if (country) return country;
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
  // f_AL=true → Easy Apply filter
  // f_WT=2 → Remote filter
  // f_E → Experience level: 1=Internship, 2=Entry, 3=Associate, 4=Mid-Senior, 5=Director
  // For junior-mid profiles, include Entry + Associate + Mid-Senior (2,3,4)
  const seniority = userData.prefs?.strong_preferences?.seniority || '';
  let expFilter = '';
  if (seniority.includes('junior') || seniority.includes('entry')) {
    expFilter = '&f_E=2%2C3%2C4'; // Entry + Associate + Mid-Senior
  }
  const encodedKeywords = encodeURIComponent(keywords);
  const encodedLocation = encodeURIComponent(location);
  const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodedKeywords}&location=${encodedLocation}&f_AL=true&f_WT=2${expFilter}&sortBy=DD`;

  // Load auth state to maintain LinkedIn session
  // Skipped: state-load hangs in current playwright-cli version.
  // Session is already active via browser.js open, so auth state is not needed.
  // loadAuthState();

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

  // Title filter: only tech roles, drop blocklisted / off-target titles
  const skipped = [];
  const matching = [];
  for (const j of jobs) {
    const check = checkJobTitle(j, userData);
    if (check.pass) matching.push(j);
    else skipped.push({ ...j, status: 'skipped', reason: check.reason });
  }
  if (!jsonOutput && skipped.length) {
    console.log(`\nFiltered out ${skipped.length} off-target jobs:`);
    skipped.forEach((j) => console.log(`  - ${j.role} at ${j.company} [${j.reason}]`));
  }

  // Limit to maxJobs
  const jobsToProcess = matching.slice(0, maxJobs);

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

    // Navigate directly to the job URL (more reliable than clicking title in search results)
    if (job.url) {
      goto(job.url);
      sleep(3000);
    } else {
      // Fallback: try clicking the job title
      const currentSnap = snapshot();
      const cleanRole = job.role.split('\n')[0].trim();
      const titleRef = extractRef(currentSnap, new RegExp(`strong \\[ref=([a-z][0-9a-z]+)\\]: ${cleanRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      if (titleRef) {
        click(titleRef);
        sleep(3000);
      }
    }

    // Check if already applied (Spanish: "Solicitud enviada", English: "Application sent")
    const preSnap = snapshot();
    if (preSnap.includes('Solicitud enviada') || preSnap.includes('Application sent') || preSnap.includes('application was sent')) {
      console.log('ALREADY APPLIED - SKIPPING');
      results.push({ ...job, status: 'already_applied' });
      continue;
    }

    // Re-find the Easy Apply button (refs change after navigation)
    // Try multiple patterns: English/ Spanish, button/ link
    const jobSnap = snapshot();
    const escapedRole = job.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('\\n')[0].trim();
    const patterns = [
      new RegExp(`button "Easy Apply to ${escapedRole}.*?" \\[ref=([a-z][0-9a-z]+)\\]`),
      new RegExp(`link "Easy Apply to ${escapedRole}.*?" \\[ref=([a-z][0-9a-z]+)\\]`),
      new RegExp(`(?:button|link) "Solicitud sencilla[^"]*" \\[ref=([a-z][0-9a-z]+)\\]`),
      new RegExp(`(?:button|link) "Easy Apply[^"]*" \\[ref=([a-z][0-9a-z]+)\\]`),
    ];
    let easyApplyRef = null;
    for (const p of patterns) {
      easyApplyRef = extractRef(jobSnap, p);
      if (easyApplyRef) break;
    }
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
        const safeUrl = (job.url || '').replace(/'/g, "''");
        dbWrite(`INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (1, 'linkedin', '${safeCompany}', '${safeRole}', '${safeUrl}', 'applied', NOW(), '{"source": "linkedin_easy_apply", "match": "title_pass"}')`);
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
    console.log(`\nSummary: ${applied} applied, ${failed} failed, ${skipped.length} filtered off-target`);
  }

  process.exit(0);
}

main();
