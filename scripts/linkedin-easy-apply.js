#!/usr/bin/env node
/**
 * linkedin-easy-apply.js — Search and apply to LinkedIn Easy Apply jobs automatically.
 *
 * Uses playwright-cli (must be running via browser.js wrapper first).
 * Searches for jobs, clicks Easy Apply, fills forms with data from DB,
 * submits applications, and registers them in DB.
 *
 * Usage:
 *   node .agents/skills/browser-automation/scripts/browser.js open "https://www.linkedin.com"   # ensure session
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
  const userId = parseInt(process.env.USER_ID || '1', 10);
  const row = dbQuery(`SELECT data->'profile' AS profile, data->'personal_info' AS personal, data->'job_preferences' AS prefs, data->'form_answers' AS form_answers FROM users WHERE id = ${userId}`)[0];
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
    const cards = document.querySelectorAll('main .job-card-container, [data-job-id], .jobs-search-results__list-item, li[data-occludable-job-id]');
    if (cards.length === 0) return JSON.stringify([]);
    return JSON.stringify(Array.from(cards).map(c => {
      // LinkedIn UI changes frequently: try multiple selectors for title
      const titleEl = c.querySelector('h3, .job-title, .job-card-list__title, strong, [class*="title"]');
      // Company: try h4, then div with company-name class, then any div that looks like a company
      let companyEl = c.querySelector('h4, .company-name, .job-card-container__company-name, .artdeco-entity-lockup__subtitle, [class*="company"]');
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
      if (!role && linkEl) role = (linkEl.getAttribute('aria-label') || linkEl.innerText.split(String.fromCharCode(10))[0] || '').trim();
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

      const labelLower = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let value = null;
      if (/^(date|fecha|today'?s date|date of application|signature date)$/i.test(labelLower.trim().replace(/\*+$/, ''))) value = new Date().toLocaleDateString('en-US');
      // Start/availability date fields expect a date, not the notice_period number.
      // 'immediate' availability maps to today's date.
      else if ((labelLower.includes('start') || labelLower.includes('available') || labelLower.includes('earliest') || labelLower.includes('join')) && labelLower.includes('date')) value = new Date().toLocaleDateString('en-US');
      else if (labelLower.includes('first name') || labelLower.includes('nombre')) value = ANSWERS.first_name;
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
      else if (labelLower === 'state' || labelLower === 'estado' || labelLower.includes('state/province') || labelLower === 'province' || labelLower === 'provincia') value = userData?.personal?.state || ANSWERS.state || ANSWERS.location;
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
      else if (labelLower.includes('github')) value = ANSWERS.github_url;
      else if (labelLower.includes('preferred name') || labelLower.includes('nombre preferido')) value = ANSWERS.first_name;
      else if (labelLower.includes('headline') || labelLower.includes('título profesional') || labelLower.includes('titular')) value = ANSWERS.headline || userData?.profile?.headline;
      else if (labelLower.includes('summary') || labelLower.includes('resumen')) value = ANSWERS.summary || userData?.profile?.summary;
      else if (labelLower.includes('compens') || labelLower.includes('remuneraci') || labelLower.includes('remuneraç') || labelLower.includes('ctc') || labelLower.includes('lpa') || labelLower.includes('maas') || labelLower.includes('beklent') || labelLower.includes('ucret') || labelLower.includes('pay') || labelLower.includes('sueldo') || labelLower.includes('expectativ') || labelLower.includes('expectation') || (labelLower.includes('rate') && labelLower.includes('usd')) || labelLower.includes('hourly rate') || labelLower.includes('preferred rate') || labelLower.includes('asp salarial') || labelLower.includes('aspiración') || (labelLower.includes('expected') && labelLower.includes('salary'))) value = ANSWERS.salary_usd;
      else if (labelLower.includes('1 to 10') || labelLower.includes('del 1 al 10') || labelLower.includes('from 1 to 10')) value = '7';
      else if (labelLower.includes('salary') && labelLower.includes('cop')) value = ANSWERS.salary_cop || ANSWERS.salary_usd;
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
      else if (labelLower.includes('how many years') || labelLower.includes('quantos anos') || labelLower.includes('cuantos anos') || labelLower.includes('cuántos años') || labelLower.includes('kac yil') || labelLower.includes('kaç yıl') || labelLower.includes('deneyim')) {
        value = ANSWERS.years_of_experience;
      }
      else if ((labelLower.includes('years') || labelLower.includes('anos') || labelLower.includes('años') || labelLower.includes('tiempo')) && (labelLower.includes('experience') || labelLower.includes('experiencia') || labelLower.includes('experiência') || labelLower.includes('working') || labelLower.includes('trabajando') || labelLower.includes('estud') || labelLower.includes('tienes') || labelLower.includes('tiene') || labelLower.includes('tens') || labelLower.includes('têm'))) {
        value = ANSWERS.years_of_experience;
      }

      if (value) {
        process.stdout.write(`FILL val="${value}" `);
        const isLocationText = labelLower.includes('location') || labelLower.includes('city') || labelLower.includes('ciudad') || labelLower.includes('ubicaci') || labelLower.includes('school') || labelLower.includes('escuela') || labelLower.includes('universidad') || labelLower.includes('university') || labelLower.includes('company');
        if (isLocationText) {
          // Typeahead field: focus the real input and type keystrokes (fill() doesn't trigger suggestions)
          if (ref) click(ref);
          else evalJSON(`(function(){ const ins=[...document.querySelectorAll('input[type="text"], input:not([type])')]; const lp=${JSON.stringify(label.substring(0,40).toLowerCase())}; const inp=ins.find(i=>{const al=(i.getAttribute('aria-label')||'').toLowerCase(); return al.includes(lp)||lp.includes(al)&&al.length>5;}); if(inp){inp.focus();inp.click();} return inp?'focused':'nf'; })()`, { session: SESSION });
          sleep(400);
          evalJSON(`(function(){ const ae=document.activeElement; if(ae&&ae.value!==undefined){ae.value='';ae.dispatchEvent(new Event('input',{bubbles:true}));} return 'ok'; })()`, { session: SESSION });
          cli(`type "${String(value).replace(/"/g, '\\"')}"`);
          sleep(2500);
          const dbg = evalJSON(`(function(){ const ae=document.activeElement; const lb=document.querySelectorAll('[role="option"], [role="listbox"] li, li[role="option"], [class*="typeahead"] [class*="selectable"], [class*="typeahead"] li, ul[class*="suggestion"] li, [data-test-single-typeahead-entity-form] li'); return JSON.stringify({tag:ae&&ae.tagName, val:ae&&ae.value, opts:lb.length, opt0:lb[0]&&lb[0].innerText}); })()`, { session: SESSION });
          process.stdout.write(`[dbgL ${JSON.stringify(dbg)}] `);
          // If suggestions rendered, click the first one; else ArrowDown+Enter
          const clickedSug = evalJSON(`(function(){
            const sels = '[role="option"], [role="listbox"] li, li[role="option"], [class*="typeahead"] [class*="selectable"], [class*="typeahead"] li, ul[class*="suggestion"] li';
            const first = document.querySelector(sels);
            if (!first) return JSON.stringify({clicked:false});
            first.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, view:window}));
            first.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, view:window}));
            first.dispatchEvent(new MouseEvent('click', {bubbles:true, view:window}));
            return JSON.stringify({clicked:true, text:first.innerText&&first.innerText.substring(0,60)});
          })()`, { session: SESSION });
          process.stdout.write(`[sug ${JSON.stringify(clickedSug)}] `);
          sleep(800);
        } else if (ref) {
          // Prefer Playwright fill (real focus + input events that commit React state)
          fill(ref, value);
        }
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
      const labelLower = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const isAutocomplete = labelLower.includes('location') || labelLower.includes('city');
      const placeholderRe = /option "(|Select an option|Selecc[^"]*|Selec[^"]*|Elige[^"]*|Choose[^"]*|Bitte[^"]*|Sélectionner[^"]*)"[^\n]*\[selected\]/i;
      const hasRealSelection = optionsBlock.includes('[selected]') && !placeholderRe.test(optionsBlock);
      const isCountryCode = !labelLower.includes('postal') && !labelLower.includes('zip') && (labelLower.includes('phone country') || labelLower.includes('country code') || labelLower.includes('prefisso') || labelLower.includes('código') || labelLower.includes('codigo') || labelLower.includes('paese') || labelLower.includes('país') || labelLower.includes('pais'));
      // Country code: never trust the preselection (LinkedIn defaults to Andorra etc.) — never skip, always enforce Argentina below
      const hasRealSelectionEff = isCountryCode ? false : hasRealSelection;
      let forcedValue = null;
      if (hasRealSelectionEff && !isAutocomplete) {
        // A previously committed demographic affirmative (e.g. "Yes, I have a
        // disability", "protected veteran") must be corrected to the decline option.
        const selOpt = optionsBlock.match(/option "([^"]+)"[^\n]*\[selected\]/)?.[1];
        const declineOpt = optionsBlock.match(/option "([^"]*(do not wish|don't wish|i do not have|don't have|no disability|not a veteran|not disabled|decline|prefer not|prefiero no|no deseo|ninguna)[^"]*)"/i)?.[1];
        if (selOpt && declineOpt && /yes, i have|i have a disability|protected veteran|american indian|alaska native/i.test(selOpt)) {
          process.stdout.write(`[combo-fix "${selOpt.substring(0,40)}" -> "${declineOpt.substring(0,40)}"] `);
          forcedValue = declineOpt;
        } else {
          process.stdout.write(`[combo-skip "${label.substring(0,30)}" sel="${(selOpt||'').substring(0,40)}"] `);
          continue;
        }
      }

      let optionValue = null;

      if (forcedValue) {
        optionValue = forcedValue;
      }
      else if (labelLower.includes('english') || labelLower.includes('inglés') || labelLower.includes('ingles')) {
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
      // Education degree combo: map to the user's real degree (never invent a higher one)
      else if (labelLower.includes('degree') || labelLower.includes('titulo') || labelLower.includes('título') || labelLower.includes('education level') || labelLower.includes('nivel de estudios') || labelLower.includes('nivel educativo')) {
        const deg = (ANSWERS.degree || '').toLowerCase();
        let m = null;
        if (deg.match(/bachiller|secund|high school|secondary/)) {
          m = optionsBlock.match(/option "([^"]*(bachiller|secundar|high school|secondary|diploma)[^"]*)"/i);
        } else if (deg.match(/terciar|technical|técnic|tecnic|associate/)) {
          m = optionsBlock.match(/option "([^"]*(terciar|technical|técnic|tecnic|associate|diploma)[^"]*)"/i);
        } else if (deg.match(/universit|bachelor|licenciat|grado|college/)) {
          m = optionsBlock.match(/option "([^"]*(universit|bachelor|licenciat|grado|college|degree)[^"]*)"/i);
        }
        optionValue = m ? m[1] : null;
      }
      // Field of study combo: pick the user's real field if listed
      else if (labelLower.includes('field of study') || labelLower.includes('area de estudio') || labelLower.includes('área de estudio') || labelLower.includes('disciplina')) {
        const fos = (ANSWERS.field_of_study || '').toLowerCase();
        const m = fos ? optionsBlock.match(new RegExp(`option "([^"]*${fos.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"`, 'i')) : null;
        optionValue = m ? m[1] : null;
      }
      // Country / country of residence combos
      else if (labelLower === 'country' || labelLower === 'pais' || labelLower === 'país' || labelLower.includes('country of residence') || labelLower.includes('pais de residencia') || labelLower.includes('país de residencia')) {
        const country = userData?.personal?.country || 'Argentina';
        const m = optionsBlock.match(new RegExp(`option "([^"]*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"`, 'i'));
        optionValue = m ? m[1] : null;
      }
      // Demographic/diversity combos (US EEO-style, voluntary): prefer decline /
      // neutral options. User answers live in form_answers.diversity_* if set.
      else if (labelLower.includes('gender') || labelLower.includes('genero') || labelLower.includes('género') || labelLower.includes('race') || labelLower.includes('ethnic') || labelLower.includes('veteran') || labelLower.includes('disability') || labelLower.includes('lgbtq') || labelLower.includes('sexual orientation')) {
        let m = null;
        if (labelLower.includes('gender') || labelLower.includes('genero') || labelLower.includes('género')) m = ANSWERS.diversity_gender && optionsBlock.match(new RegExp(`option "([^"]*${ANSWERS.diversity_gender}[^"]*)"`, 'i'));
        if (labelLower.includes('veteran')) m = m || optionsBlock.match(/option "([^"]*(not a veteran|no soy veterano)[^"]*)"/i);
        optionValue = m ? m[1] : (optionsBlock.match(/option "([^"]*(do not wish|don't wish|decline|prefiero no|no deseo|i do not wish)[^"]*)"/i)?.[1] || null);
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
        // For comboboxes with no matching handler, try eval-based selection.
        // Pick the best candidate from the visible options when available.
        process.stdout.write(`COMBO_EVAL label="${label.substring(0,30)}" `);
        const opts = [...optionsBlock.matchAll(/option "([^"]+)"/g)].map(m => m[1]);
        const nonPlaceholder = opts.filter(o => !/select|selecc|selec|elige|choose|bitte|sélectionner/i.test(o));
        let answer = 'Yes';
        if (labelLower.includes('sponsorship') || labelLower.includes('visa')) answer = 'No';
        if (labelLower.includes('authorized') && labelLower.includes('work')) answer = 'No';
        if (labelLower.includes('citizen') && labelLower.includes('us')) answer = 'No';
        if (labelLower.includes('manufacturing') || labelLower.includes('mes') || labelLower.includes('scada')) answer = 'No';
        if (labelLower.includes('based in') && (labelLower.includes('latin america') || labelLower.includes('latam'))) answer = 'Yes';
        if (labelLower.includes('remote') && labelLower.includes('year')) answer = 'Yes';
        if (labelLower.includes('hear about') || labelLower.includes('how did you hear') || labelLower.includes('cómo supiste') || labelLower.includes('como te enteraste')) {
          answer = opts.find(o => /linkedin/i.test(o)) || 'LinkedIn';
        }
        if (labelLower.includes('government official')) answer = 'No';
        if (labelLower.includes('privacy') || labelLower.includes('receipt') || labelLower.includes('acknowledge') || labelLower.includes('understand that') || labelLower.includes('confirm')) {
          answer = opts.find(o => /yes|i have read|i acknowledge|i understand|confirm/i.test(o)) || 'Yes';
        }
        if (labelLower.includes('use ai') || labelLower.includes('ai tools')) {
          answer = opts.find(o => /regularly|daily|frequent|everyday|productiv/i.test(o)) || (nonPlaceholder[0] || 'Yes');
        }
        // Demographic/medical option lists under generic labels ("Please check one of the
        // boxes below"): never pick an affirmative disability/veteran/declared answer.
        // Prefer explicit decline / negative options over inventing data (Gold Rule 5c).
        const decline = opts.find(o => /do not wish|don't wish|i do not have|don't have|no disability|not a veteran|not disabled|decline|prefer not|prefiero no|no deseo|ninguna/i.test(o));
        if (decline) answer = decline;
        // Long option lists (degree/field-of-study catalogs, industry lists) mean the
        // combo needs a real answer — never pick an arbitrary option from a big list.
        if (opts.length > 6 && !opts.includes(answer)) {
          const other = opts.find(o => /^(other|otro|otra)$/i.test(o.trim()));
          if (other) { answer = other; }
          else { process.stdout.write(`[combo-skip-long "${label.substring(0,30)}"] `); continue; }
        }
        // If no options visible in snapshot, try the computed answer; else prefer it if it exists in options
        if (opts.length && !opts.includes(answer)) {
          answer = nonPlaceholder[0] || answer;
        }
        // Final guard: if the picked option asserts a demographic/medical fact and no
        // decline option exists, leave the combo empty rather than fabricate.
        if (/disability|disabled|veteran|hispanic|latino|female|male|gender|genero|ethnic|etnia|raza/i.test(answer) && !decline) {
          process.stdout.write(`[combo-skip-risky "${answer.substring(0,40)}"] `);
          continue;
        }

        const selectResult = evalJSON(`(function(){
          const labelPart = ${JSON.stringify(label.replace(/"/g, '\\"').substring(0, 80))};
          const selects = document.querySelectorAll('select');
          for (const select of selects) {
            const al = select.getAttribute('aria-label') || '';
            if (!(al.includes(labelPart) || labelPart.includes(al) && al.length > 5)) continue;
            for (const opt of select.options) {
              if (opt.text.trim() === ${JSON.stringify(answer)}) {
                opt.selected = true;
                select.dispatchEvent(new Event('change', {bubbles: true}));
                return JSON.stringify({selected: true, value: opt.value});
              }
            }
            // Fallback: first non-placeholder option — only for short (yes/no-ish) lists;
            // never invent a pick from long catalogs (degree/field-of-study/industry).
            const nonPh = [...select.options].filter(o => !/select|selecc|selec|elige|choose/i.test(o.text));
            if (nonPh.length <= 6) {
              const opt = nonPh[0];
              if (opt) {
                opt.selected = true;
                select.dispatchEvent(new Event('change', {bubbles: true}));
                return JSON.stringify({selected: true, value: opt.value, fallback: opt.text});
              }
            }
          }
          return JSON.stringify({selected: false});
        })()`, { session: SESSION });
        if (!selectResult || !selectResult.selected) {
          try { selectOption(ref, answer); } catch(e) {}
        }
        sleep(1000);
      }
    }

    // Unlabeled From/To month+year comboboxes (education/experience editors render
    // them without aria-labels). Context comes from the nearest "From"/"To" text.
    const dateRes = evalJSON(`(function(){
      const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre','january','february','march','april','may','june','july','august','september','october','november','december'];
      const vals = {
        from_month: ${JSON.stringify(ANSWERS.edu_from_month || '')}, from_year: ${JSON.stringify(ANSWERS.edu_from_year || '')},
        to_month: ${JSON.stringify(ANSWERS.edu_to_month || '')}, to_year: ${JSON.stringify(ANSWERS.edu_to_year || '')},
      };
      const filled = [];
      document.querySelectorAll('select').forEach(sel => {
        if (sel.getAttribute('aria-label')) return;               // labeled combos handled above
        if (sel.selectedIndex > 0 && sel.value) return;           // already selected
        const optTexts = [...sel.options].map(o => o.text.trim().toLowerCase());
        const isMonth = optTexts.some(o => MONTHS.includes(o));
        const isYear = optTexts.filter(o => /^(19|20)\\d{2}$/.test(o)).length > 3;
        if (!isMonth && !isYear) return;
        // Walk up to find the From/To context of this select's group
        let ctx = null, el = sel;
        for (let i = 0; i < 8 && el; i++) {
          el = el.parentElement;
          if (!el) break;
          const t = (el.innerText || '').toLowerCase();
          if (/\\bfrom\\b|desde/.test(t) && t.length < 400) { ctx = 'from'; break; }
          if (/\\bto\\b|\\bhasta\\b|\\bend\\b/.test(t) && t.length < 400) { ctx = 'to'; break; }
        }
        if (!ctx) return;
        const want = vals[ctx + '_' + (isMonth ? 'month' : 'year')];
        if (!want) return;
        const opt = [...sel.options].find(o => o.text.trim().toLowerCase() === want.toLowerCase() || o.value === want);
        if (!opt) return;
        const ns = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        ns.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', {bubbles: true}));
        sel.dispatchEvent(new Event('input', {bubbles: true}));
        filled.push(ctx + ':' + opt.text.trim());
      });
      return JSON.stringify(filled);
    })()`, { session: SESSION });
    if (dateRes && dateRes.length) process.stdout.write(`[dates ${JSON.stringify(dateRes)}] `);

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

      const labelLower = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

    // DOM fallback: required radiogroups not visible in snapshot (e.g. custom fieldsets)
    const radioResult = evalJSON(`(function(){
      const answered = [];
      const groups = document.querySelectorAll('fieldset, [role="radiogroup"], [data-test-form-builder-radio-button-form-component]');
      for (const g of groups) {
        const radios = g.querySelectorAll('input[type="radio"]');
        if (!radios.length) continue;
        if (g.querySelector('input[type="radio"]:checked')) continue;
        const legend = (g.querySelector('legend')?.textContent || g.getAttribute('aria-label') || g.closest('.fb-form-element')?.querySelector('label,legend')?.textContent || '').trim().toLowerCase();
        const labels = [...radios].map(r => (r.closest('label')?.textContent || r.value || '').trim());
        let pick = labels.findIndex(l => /^yes|sí$|si$|sim$/i.test(l));
        if (/sponsor|visa|authorized|citizen|clearance|disab|relative|government|residen|work in (the )?(us|usa|canada|eu|uk)|authorized to work/i.test(legend)) {
          const noIdx = labels.findIndex(l => /^no|não|non$/i.test(l));
          if (noIdx >= 0) pick = noIdx;
        }
        if (pick < 0) pick = 0;
        const r = radios[pick];
        r.click();
        r.dispatchEvent(new Event('change', {bubbles:true}));
        answered.push({legend: legend.substring(0,50), picked: labels[pick]});
      }
      return JSON.stringify(answered);
    })()`, { session: SESSION });
    const radioArr = Array.isArray(radioResult) ? radioResult : (() => { try { return JSON.parse(radioResult || '[]'); } catch { return []; } })();
    if (radioArr.length) {
      process.stdout.write(`[radios ${JSON.stringify(radioArr)}] `);
      sleep(1000);
    }

    // DOM fallback: required selects still empty (snapshot may show placeholder as [selected])
    const selRes = evalJSON(`(function(){
      const done = [];
      document.querySelectorAll('select').forEach(s => {
        if (s.value && s.selectedOptions[0] && s.selectedOptions[0].text.trim() !== '') return;
        const wrapper = s.closest('.fb-form-element, .jobs-easy-apply-form-section__element, [class*="form-element"]') || s.parentElement;
        const label = ((wrapper && (wrapper.querySelector('label,legend')?.textContent || '')) || s.getAttribute('aria-label') || '').trim().toLowerCase();
        const opts = [...s.options].filter(o => o.value !== '' && !/selec|elig|choos|select/i.test(o.text));
        if (!opts.length) return;
        let pick = null;
        const noQ = /sponsor|visa|authorized|autoriz|citizen|clearance|disab|relative|government|residen|indigenous|autochton|travail|canada|french|anglais/i.test(label);
        if (noQ) pick = opts.find(o => /^(no|não|non)$/i.test(o.text.trim())) || null;
        if (!pick && /english|anglais|ingl/i.test(label)) pick = opts.find(o => /professional|advanced|proficien|fluent|interm/i.test(o.text));
        if (!pick && /salary|salarial|attentes/i.test(label)) pick = opts[Math.min(1, opts.length - 1)];
        if (!pick) pick = opts.find(o => /linkedin|yes|sí|si$/i.test(o.text.trim())) || opts[0];
        pick.selected = true;
        s.dispatchEvent(new Event('change', {bubbles: true}));
        s.dispatchEvent(new Event('input', {bubbles: true}));
        done.push({label: label.substring(0,40), val: pick.text.trim().substring(0,40)});
      });
      return JSON.stringify(done);
    })()`, { session: SESSION });
    const selArr = (() => { try { return JSON.parse(selRes || '[]'); } catch { return []; } })();
    if (selArr.length) {
      process.stdout.write(`[selects ${JSON.stringify(selArr)}] `);
      sleep(1000);
    }

    // Check required checkboxes and click them
    const checkboxMatches = [...snap.matchAll(/- generic \[ref=([a-z][0-9a-z]+)\]:\s*\n\s*- checkbox "(.+?)"/g)];
    for (const cb of checkboxMatches) {
      const [block, ref, label] = cb;
      if (block.includes('[checked]')) continue;
      click(ref);
      sleep(1000);
    }
    // Direct checkboxes (no generic wrapper): `- checkbox "label" [ref=x]`.
    // Only consent/terms-type labels — never opt into marketing/disability/etc.
    const directCbs = [...snap.matchAll(/- checkbox "([^"]+)"(?:\s+\[[^\]]*\])*\s+\[ref=([a-z][0-9a-z]+)\](?:\s+\[[^\]]*\])*/g)];
    for (const cb of directCbs) {
      const [line, label, ref] = cb;
      if (line.includes('[checked]')) continue;
      if (!/consent|terms|conditions|privacy|agree|accept|acepto|términos|terminos|condiciones|privacidad|consentimiento|consiento/i.test(label)) continue;
      click(ref);
      sleep(1000);
    }

    // Find and click Continue/Review/Submit button (English or Spanish)
    // Attr-tolerant: snapshot may render `button "Siguiente" [active] [ref=...]`.
    // Scope to the dialog region first: pages can contain non-dialog buttons with
    // the same label (carousels, pagination) that hijack the first regex match.
    const dialogIdx = snap.indexOf('- dialog [');
    const dialogSnap = dialogIdx >= 0 ? snap.slice(dialogIdx) : snap;
    const refTail = '(?:\\s+\\[[^\\]]*\\])*\\s+\\[ref=([a-z][0-9a-z]+)\\]';
    let actionRef = null;
    const findBtn = (labelRe) => {
      const re = new RegExp('button "' + labelRe + '"' + refTail);
      return extractRef(dialogSnap, re) || extractRef(snap, re);
    };
    // Detect on the DIALOG only — page-level text (e.g. carousel "Siguiente") must
    // not select the branch, and LinkedIn also renders a bare "Revisar" button.
    if (dialogSnap.match(/button "(?:Submit application|Enviar solicitud|Presentar solicitud)"/)) {
      actionRef = findBtn('(?:Submit application|Enviar solicitud|Presentar solicitud)');
    } else if (dialogSnap.match(/button "(?:Review(?: your application)?|Revisar(?: tu solicitud)?|Revisa tu solicitud)"/)) {
      actionRef = findBtn('(?:Review(?: your application)?|Revisar(?: tu solicitud)?|Revisa tu solicitud)');
    } else if (dialogSnap.match(/button "(?:Continue to next step|Ir al siguiente paso|Continuar al siguiente paso|Siguiente)"/)) {
      actionRef = findBtn('(?:Continue to next step|Ir al siguiente paso|Continuar al siguiente paso|Siguiente)');
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
        let disabledFound = null;
        for (const b of btns) {
          const text = b.textContent.trim();
          if (text.includes('Revisar') || text.includes('Review') || text.includes('Enviar') || text.includes('Submit') || text.includes('Siguiente') || text.includes('Next')) {
            if (b.disabled || b.getAttribute('aria-disabled') === 'true' || b.getAttribute('disabled') !== null) {
              disabledFound = disabledFound || text;
              continue;
            }
            b.click();
            return JSON.stringify({clicked: true, text: text});
          }
        }
        return JSON.stringify({clicked: false, disabledBtn: disabledFound});
      })()`, { session: SESSION });
      // If the button is disabled, surface the validation error(s) blocking it
      if (evalClick && evalClick.disabledBtn) {
        const errs = evalJSON(`(function(){
          const msgs = [...document.querySelectorAll('[role="alert"], .fb-form-element__error-text, [class*="error-message"], [class*="error-text"], [aria-live]')]
            .map(e => e.textContent.trim()).filter(t => t.length > 2 && t.length < 200);
          return JSON.stringify(msgs.slice(0, 5));
        })()`, { session: SESSION });
        process.stdout.write(`[errs ${JSON.stringify(errs)}] `);
      }
      process.stdout.write(`evalClick=${JSON.stringify(evalClick)} `);
      // Diagnostic: dump required-but-empty or invalid fields (helps see what blocks Next/Review)
      const blockers = evalJSON(`(function(){
        const out = [];
        document.querySelectorAll('[aria-invalid="true"], .artdeco-text-input--error, select[required]:not([value]), input[required]').forEach(el => {
          out.push({tag: el.tagName, label: (el.getAttribute('aria-label')||el.id||'').substring(0,50), val: el.value});
        });
        document.querySelectorAll('input, select, textarea').forEach(el => {
          if (el.required && !el.value) out.push({req: true, label: (el.getAttribute('aria-label')||'').substring(0,50)});
        });
        document.querySelectorAll('fieldset, [role="radiogroup"]').forEach(g => {
          if (!g.querySelector('input:checked')) out.push({radio: (g.getAttribute('aria-label')||g.querySelector('legend')?.textContent||'').substring(0,60)});
        });
        return JSON.stringify(out.slice(0,8));
      })()`, { session: SESSION });
      const blockerArr = Array.isArray(blockers) ? blockers : (() => { try { return JSON.parse(blockers || '[]'); } catch { return []; } })();
      if (blockerArr.length) {
        process.stdout.write(`[blocked ${JSON.stringify(blockerArr)}] `);
      }
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

  return parts.length > 0 ? parts.join(' OR ') : '';
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
  let jobUrl = null; // direct single-job mode
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
    else if (args[i] === '--job-url' && args[i + 1]) { jobUrl = args[i + 1]; i++; }
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

  // Direct single-job mode: skip search entirely
  if (jobUrl) {
    const results = [];
    const job = { role: '', company: '', url: jobUrl };
    process.stdout.write(`Applying to ${jobUrl}... `);
    goto(job.url);
    sleep(3000);

    // Resolve role/company from the page for DB
    const meta = evalJSON(`(function(){
      const t = document.querySelector('h1, .top-card-layout__title, [class*="job-title"]')?.textContent.trim() || '';
      const c = document.querySelector('[class*="topcard__org"], [class*="company-name"], .top-card-layout__second-subline, [data-tracking-control-name*="company"]')?.textContent.trim() || '';
      return JSON.stringify({role: t.substring(0,120), company: c.substring(0,80)});
    })()`, { session: SESSION });
    const metaObj = (() => { try { return JSON.parse(meta || '{}'); } catch { return meta && typeof meta === 'object' ? meta : {}; } })();
    if (metaObj.role) job.role = metaObj.role;
    if (metaObj.company) job.company = metaObj.company;
    if (!job.role) job.role = 'LinkedIn job';
    if (!job.company) job.company = 'LinkedIn';

    const jobSnap = snapshot();
    if (jobSnap.includes('Solicitud enviada') || jobSnap.includes('Application sent') || jobSnap.includes('application was sent')) {
      console.log('ALREADY APPLIED - SKIPPING');
      results.push({ ...job, status: 'already_applied' });
    } else {
      const patterns = [
        /(?:button|link) "Solicitud sencilla[^"]*" \[ref=([a-z][0-9a-z]+)\]/,
        /(?:button|link) "Easy Apply[^"]*" \[ref=([a-z][0-9a-z]+)\]/,
      ];
      let easyApplyRef = null;
      for (const p of patterns) {
        easyApplyRef = extractRef(jobSnap, p);
        if (easyApplyRef) break;
      }
      if (!easyApplyRef) {
        console.log('NO EASY APPLY BUTTON');
        results.push({ ...job, status: 'no_button' });
      } else {
        const result = applyToJob(easyApplyRef, userData);
        results.push({ ...job, ...result });
        if (result.status === 'applied') {
          console.log('APPLIED');
          const safeCompany = job.company.replace(/'/g, "''");
          const safeRole = job.role.replace(/'/g, "''");
          const safeUrl = job.url.replace(/'/g, "''");
          dbWrite(`INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (${process.env.USER_ID || 1}, 'linkedin', '${safeCompany}', '${safeRole}', '${safeUrl}', 'applied', NOW(), '{"source": "linkedin_easy_apply", "match": "direct_url"}')`);
        } else {
          console.log(`FAILED: ${result.error || result.status}`);
        }
      }
    }
    if (jsonOutput) console.log(JSON.stringify(results, null, 2));
    else console.log(`\nDone: ${results[0]?.status}`);
    return;
  }

  goto(searchUrl);

  // Wait for job cards to load (in-page polling, not shell sleep)
  waitFor('document.querySelectorAll("main .job-card-container, [data-job-id], .jobs-search-results__list-item, li[data-occludable-job-id]").length > 0', { timeout: 10000, session: SESSION });

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
      const cleanRole = job.role.split('\n')[0].trim().replace(/ with verification$/i, '');
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
    const escapedRole = job.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('\\n')[0].trim().replace(/ with verification$/i, '').slice(0, 60);
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
        dbWrite(`INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (${process.env.USER_ID || 1}, 'linkedin', '${safeCompany}', '${safeRole}', '${safeUrl}', 'applied', NOW(), '{"source": "linkedin_easy_apply", "match": "title_pass"}')`);
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
