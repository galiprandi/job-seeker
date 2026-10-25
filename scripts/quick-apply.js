#!/usr/bin/env node
// Quick applier: uses snapshot + ref-based fill/click (works with React)
const { execSync, execFileSync } = require('child_process');
const path = require('path');

const sleep = (ms) => execSync(`sleep ${Math.ceil(ms / 1000)}`);

const WRAPPER = path.resolve(__dirname, '../.agents/skills/browser-automation/scripts/browser.js');

function pw(cmd, timeout = 15000) {
  try {
    return execFileSync('node', [WRAPPER, 'exec', ...cmd.split(' ')], {
      timeout, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: process.cwd(),
    });
  } catch (e) { return e.stdout || e.message; }
}

// agent-browser `snapshot -i` emits `@eN role "name"` lines; parsers below
// expect the playwright-style `- role "name" [ref=eN]` shape.
function normalizeSnap(snap) {
  return snap.split('\n').map(line => {
    const m = line.match(/^(\s*)@([a-z0-9]+)\s+(\w[\w-]*)\s+"([^"]*)"(.*)$/);
    return m ? `${m[1]}- ${m[3]} "${m[4]}" [ref=${m[2]}]${m[5]}` : line;
  }).join('\n');
}

function snapshot() { return normalizeSnap(pw('snapshot -i', 30000)); }

function clickRef(ref) { return pw(`click @${ref}`, 10000); }

function fillRef(ref, value) {
  return pw(`fill @${ref} "${value.replace(/"/g, '\\"')}"`, 10000);
}

function selectRef(ref, value) {
  return pw(`select @${ref} "${value.replace(/"/g, '\\"')}"`, 10000);
}

function evalJS(code, timeout = 15000) {
  const escaped = code.replace(/'/g, "'\\''");
  const out = pw(`eval '${escaped}'`, timeout);
  const m = out.match(/### Result\n(.+)/);
  if (m) {
    try { return JSON.parse(m[1].replace(/^"|"$/g, '').replace(/\\"/g, '"')); }
    catch(e) { return m[1]; }
  }
  return null;
}

function goto(url) {
  execSync(`node scripts/browser.js goto "${url}"`, { encoding: 'utf-8', cwd: process.cwd() });
  sleep(3000);
}

function getAppliedUrls() {
  const out = execSync(`node scripts/db.js "SELECT url FROM applications WHERE user_id = 1"`, {
    encoding: 'utf-8', cwd: process.cwd(),
  });
  try { return new Set(JSON.parse(out).map(r => r.url)); }
  catch(e) { return new Set(); }
}

function registerApp(company, role, url) {
  const sc = company.replace(/'/g, "''").substring(0, 100);
  const sr = role.replace(/'/g, "''").substring(0, 200);
  const su = url.replace(/'/g, "''");
  execSync(`node scripts/db.js "INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (1, 'linkedin', '${sc}', '${sr}', '${su}', 'applied', NOW(), '{\\"source\\": \\"linkedin_easy_apply\\"}'::jsonb)" --write`, {
    encoding: 'utf-8', cwd: process.cwd(),
  });
  console.log(`  -> DB: registered ${company}`);
}

function extractRef(snap, regex) {
  const m = snap.match(regex);
  return m ? m[1] : null;
}

// Fill text fields from snapshot
function fillTextFields(snap) {
  // Match: textbox "label*" [ref=xxx] or textbox "label*" [ref=xxx]: "existing"
  const fields = [...snap.matchAll(/- textbox "(.+?)(\*)?" \[ref=([a-z0-9]+)\](?:: (?:"([^"]+)"|([^\n]+)))?/g)];
  let filled = 0;
  for (const f of fields) {
    const [, label, req, ref, existingQ, existingU] = f;
    const existing = existingQ || existingU;
    if (existing) continue; // already has value

    const ll = label.toLowerCase();
    let value = null;

    if (ll.includes('first name') || ll.includes('nombre') || ll.includes('vorname')) value = 'Santiago';
    else if (ll.includes('last name') || ll.includes('apellido') || ll.includes('nachname')) value = 'Aliprandi';
    else if (ll.includes('mobile phone') || ll.includes('phone number') || ll.includes('handynummer')) value = '3815658239';
    else if (ll.includes('linkedin')) value = 'https://www.linkedin.com/in/saliprandi/';
    else if (ll.includes('website') || ll.includes('github')) value = 'https://github.com/saliprandi';
    else if (ll.includes('years') && (ll.includes('experience') || ll.includes('working') || ll.includes('retail') || ll.includes('erfahrung'))) value = '1';
    else if (ll.includes('salary') || ll.includes('gehalt')) value = 'Flexible';
    else if (ll.includes('buscar') || ll.includes('search') || ll.includes('suche')) continue; // search bar

    if (value) {
      try { fillRef(ref, value); filled++; } catch(e) {}
    }
  }
  return filled;
}

// Select comboboxes from snapshot
function selectCombos(snap) {
  // Match combobox with its options block (up to 20 lines) OR empty combobox (no options)
  const combos = [...snap.matchAll(/- combobox "(.+?)(\*)?" \[ref=([a-z0-9]+)\]:?\n((?:.+\n){0,20})/g)];
  let selected = 0;
  for (const c of combos) {
    const [, label, req, ref, optionsBlock] = c;
    const ll = label.toLowerCase();

    // Skip UI comboboxes (language selectors in any locale)
    if (ll.includes('seleccionar idioma') || ll.includes('select language') || ll.includes('sprache auswählen') || ll.includes('sprache wählen')) continue;

    // Skip if already has real selection (any option selected that's not the placeholder)
    // Placeholders: "Select an option", "Option auswählen", "Seleccionar una opción", etc.
    const hasPlaceholder = optionsBlock.match(/option "(Select an option|Option auswählen|Seleccionar[^"]*)"\s*\[selected\]/);
    const hasAnySelected = optionsBlock.includes('[selected]');
    if (hasAnySelected && !hasPlaceholder) continue;

    // Handle Location autocomplete comboboxes (empty, no options until typed)
    if ((ll.includes('location') || ll.includes('city') || ll.includes('standort')) && !optionsBlock.includes('option ')) {
      try {
        fillRef(ref, 'San Miguel de Tucumán');
        sleep(2000);
        evalJS(`(function(){
          const options = document.querySelectorAll('[role="option"], [role="listitem"]');
          for (const opt of options) {
            const text = opt.textContent.trim();
            if (text.includes('San Miguel de Tucumán')) {
              opt.click();
              return JSON.stringify({clicked: true});
            }
          }
          if (options.length > 0) {
            options[0].click();
            return JSON.stringify({clicked: true});
          }
          return JSON.stringify({clicked: false});
        })()`);
        sleep(1000);
        selected++;
      } catch(e) {}
      continue;
    }

    // Skip if no options (not a location autocomplete, just empty)
    if (!optionsBlock.includes('option ')) continue;

    let targetOption = null;

    // Yes/No questions (English, Spanish, German)
    if (optionsBlock.match(/option "(Yes|No|Ja|Nein|Sí|No)"/)) {
      targetOption = 'Yes';
      if (ll.includes('sponsorship') || ll.includes('visa') || ll.includes('bürgschaft') || ll.includes('visum')) targetOption = 'No';
      if (ll.includes('authorized') && ll.includes('work')) targetOption = 'No';
      if (ll.includes('befugt') && ll.includes('arbeiten')) targetOption = 'No';
      if (ll.includes('citizen') && ll.includes('us')) targetOption = 'No';
      if (ll.includes('manufacturing') || ll.includes('mes') || ll.includes('scada')) targetOption = 'No';
      if (ll.includes('based in') && (ll.includes('latin') || ll.includes('latam'))) targetOption = 'Yes';
      if (ll.includes('remote') && ll.includes('year')) targetOption = 'Yes';
      // Convert Yes/No to German if needed
      if (optionsBlock.includes('Ja') && !optionsBlock.includes('Yes')) {
        targetOption = targetOption === 'Yes' ? 'Ja' : 'Nein';
      }
    }
    // Language level questions (English/Spanish/German labels)
    else if (ll.includes('english') || ll.includes('englisch')) {
      const m = optionsBlock.match(/option "(Professional|Advanced|Proficient|Native or bilingual|Verhandlungssicher|Gut|Muttersprache oder zweisprachig)"/);
      targetOption = m ? m[1] : (optionsBlock.includes('Verhandlungssicher') ? 'Verhandlungssicher' : 'Professional');
    }
    else if (ll.includes('spanish') || ll.includes('spanisch')) {
      const m = optionsBlock.match(/option "(Native or bilingual|Proficient|Advanced|Profesional|Muttersprache oder zweisprachig)"/);
      targetOption = m ? m[1] : 'Proficient';
    }
    else if (ll.includes('deutsch') || ll.includes('german')) {
      // German level - user doesn't speak German
      const m = optionsBlock.match(/option "(Gar nicht|None|No)"/);
      targetOption = m ? m[1] : 'Gar nicht';
    }

    if (targetOption) {
      try { selectRef(ref, targetOption); selected++; } catch(e) {}
    }
  }
  return selected;
}

// Click required radio buttons from snapshot
function clickRadios(snap) {
  // Match groups with their content
  const groups = [...snap.matchAll(/- group "(.+?)" \[ref=[a-z0-9]+\]:([\s\S]*?)(?=- group |- heading |- paragraph|- generic \[ref=f[0-9a-f]+e1[0-9]{3}\]:\n              - paragraph)/g)];
  let clicked = 0;
  for (const g of groups) {
    const [, label, block] = g;
    const ll = label.toLowerCase();

    // Check if required
    if (!label.includes('*') && !label.includes('Required') && !label.includes('Obligatorio') && !block.includes('Obligatorio')) continue;

    // Check if already checked
    if (block.includes('[checked]') || block.includes('[active]')) continue;

    let target = 'Yes';
    if (ll.includes('sponsorship') || ll.includes('visa') || ll.includes('bürgschaft') || ll.includes('visum')) target = 'No';
    if (ll.includes('authorized') && ll.includes('work')) target = 'No';
    if (ll.includes('befugt') && ll.includes('arbeiten')) target = 'No';
    if (ll.includes('citizen') && ll.includes('us')) target = 'No';
    if (ll.includes('disability') || ll.includes('discapacid')) target = 'No';
    if (ll.includes('background')) target = 'Yes';
    if (ll.includes('remote')) target = 'Yes';
    if (ll.includes('based in') && (ll.includes('latin') || ll.includes('latam'))) target = 'Yes';
    if (ll.includes('gender') || ll.includes('genero')) target = 'I prefer not to specify';
    if (ll.includes('race') || ll.includes('ethnic')) target = 'I prefer not to specify';
    if (ll.includes('führerschein') || ll.includes('driver')) target = 'No';
    if (ll.includes('abschluss') || ll.includes('bachelor') || ll.includes('degree')) target = 'No';

    // Convert to German if options are Ja/Nein
    if (block.includes('Ja') && !block.includes('Yes')) {
      target = target === 'Yes' ? 'Ja' : 'Nein';
    }

    // Find the generic ref for the target option
    const targetRegex = new RegExp(`- generic \\[ref=([a-z0-9]+)\\]: "?${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?`);
    const targetMatch = block.match(targetRegex);
    if (targetMatch) {
      try { clickRef(targetMatch[1]); clicked++; sleep(500); } catch(e) {}
    }
  }
  return clicked;
}

// Find and click the action button (Submit > Review > Next)
function clickActionButton(snap) {
  // Priority: Submit > Review > Next
  let ref = extractRef(snap, /button "(?:Enviar solicitud|Submit application|Presentar solicitud)" \[ref=([a-z0-9]+)\]/);
  if (!ref) ref = extractRef(snap, /button "(?:Revisar tu solicitud|Revisa tu solicitud|Review your application)" \[ref=([a-z0-9]+)\]/);
  if (!ref) ref = extractRef(snap, /button "(?:Ir al siguiente paso|Continuar al siguiente paso|Continue to next step)" \[ref=([a-z0-9]+)\]/);
  if (!ref) {
    // Try "Siguiente" button (generic next)
    ref = extractRef(snap, /button "(?:Siguiente|Next)" \[ref=([a-z0-9]+)\]/);
  }
  if (ref) {
    clickRef(ref);
    return true;
  }
  return false;
}

// Red flag keywords that indicate a misleading travel/hospitality/MLM listing
const MISLEADING_KEYWORDS = [
  'travel agent', 'travel agency', 'become a travel agent',
  'evolution travel', 'archer travel', 'hb travels',
  'vacation packages', 'cruise packages', 'tour packages',
  'travel perks', 'travel industry operates',
  'commission-based travel', 'commission based travel',
  'hosting travel agent', 'remote travel agent',
  'travel and tourism', 'travel coordinator',
  'hospitality coordinator', 'marketing & hospitality',
  'independent travel agent', 'travel business opportunity',
  'start your travel', 'launch your travel',
  'travel advisor', 'travel consultant',
];

// Validate the job description for misleading travel/hospitality/MLM listings
function validateJobDescription(url) {
  const jdText = evalJS(`(function(){
    const sel = document.querySelector('.jobs-description__content, .jobs-description__container, [class*="jobs-description"]');
    if (sel) return JSON.stringify(sel.innerText.substring(0, 5000));
    // Fallback: grab the main content area
    const main = document.querySelector('main, [class*="job-view"]');
    if (main) return JSON.stringify(main.innerText.substring(0, 5000));
    return JSON.stringify('');
  })()`, 15000);
  if (!jdText || typeof jdText !== 'string') return { valid: true };
  const lower = jdText.toLowerCase();
  for (const kw of MISLEADING_KEYWORDS) {
    if (lower.includes(kw)) return { valid: false, keyword: kw };
  }
  return { valid: true };
}

// Apply to a single job
function applyToJob(url) {
  goto(url);

  let snap = snapshot();

  // Check if already applied
  if (snap.includes('Solicitud enviada') || snap.includes('Application sent') || snap.includes('Ya has solicitado')) {
    return { status: 'already_applied' };
  }

  // Validate JD for misleading listings before applying
  const validation = validateJobDescription(url);
  if (!validation.valid) return { status: 'misleading', keyword: validation.keyword };

  // Click Easy Apply via eval (search by text, href, and class)
  const clickResult = evalJS(`(function(){
    // Try href selector
    let btn = document.querySelector('a[href*="openSDUIApplyFlow"]');
    if (btn) { btn.click(); return JSON.stringify({clicked: true, method: 'href'}); }
    // Try class selector
    btn = document.querySelector('.jobs-apply-button');
    if (btn) { btn.click(); return JSON.stringify({clicked: true, method: 'class'}); }
    btn = document.querySelector('.job-card-container__easy-apply');
    if (btn) { btn.click(); return JSON.stringify({clicked: true, method: 'container'}); }
    // Try by text content (Spanish/English)
    const allBtns = document.querySelectorAll('button, a');
    for (const b of allBtns) {
      const t = b.textContent.trim();
      if (t === 'Solicitud sencilla' || t === 'Easy Apply' || t.startsWith('Solicitud sencilla') || t.startsWith('Easy Apply')) {
        b.click();
        return JSON.stringify({clicked: true, method: 'text', text: t.substring(0, 30)});
      }
    }
    return JSON.stringify({clicked: false});
  })()`);
  if (!clickResult || !clickResult.clicked) return { status: 'no_easy_apply' };
  sleep(4000);

  // Loop through steps
  let maxSteps = 20;
  let lastProgress = -1;
  let stuckCount = 0;

  while (maxSteps-- > 0) {
    snap = snapshot();

    // Check submitted
    if (snap.includes('Solicitud enviada') || snap.includes('application was sent to') || snap.includes('Application sent')) {
      const companyMatch = snap.match(/Solicitar empleo en (.+?)"/) || snap.match(/solicitud (?:fue enviada|se ha enviado) a (.+?)[!.]/i);
      const company = companyMatch ? companyMatch[1].trim() : 'Unknown';
      return { status: 'applied', company };
    }

    // Check captcha
    if (snap.toLowerCase().includes('captcha') || snap.toLowerCase().includes('security check')) {
      return { status: 'captcha' };
    }

    // Get progress
    const progMatch = snap.match(/Valor actual: (\d+)/);
    const progress = progMatch ? parseInt(progMatch[1]) : -1;

    if (progress === lastProgress) {
      stuckCount++;
      if (stuckCount > 5) return { status: 'stuck', progress };
    } else {
      stuckCount = 0;
      lastProgress = progress;
    }

    // Fill fields
    fillTextFields(snap);
    sleep(500);
    selectCombos(snap);
    sleep(500);
    clickRadios(snap);
    sleep(500);

    // Click action button
    const clicked = clickActionButton(snap);
    sleep(3000);

    if (!clicked) {
      // Try eval-based click as fallback
      evalJS(`(function(){
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          const t = b.textContent.trim();
          if (t.includes('Revisar') || t.includes('Review') || t.includes('Enviar') || t.includes('Submit') || t.includes('Siguiente') || t.includes('Next')) {
            b.click();
            return JSON.stringify({clicked: true});
          }
        }
        return JSON.stringify({clicked: false});
      })()`);
      sleep(3000);
    }
  }

  return { status: 'timeout' };
}

// Main
const keywords = process.argv.includes('--keywords')
  ? process.argv[process.argv.indexOf('--keywords') + 1]
  : '"Software Engineer" OR "Prompt engineering" OR "Agent workflows" OR "OpenAI API"';
const maxJobs = process.argv.includes('--max')
  ? parseInt(process.argv[process.argv.indexOf('--max') + 1])
  : 15;

const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=Worldwide&f_AL=true&f_WT=2&f_E=2%2C3%2C4&sortBy=DD`;

console.log(`\n=== Quick Apply ===`);
console.log(`Keywords: ${keywords}`);
console.log(`Max: ${maxJobs}\n`);

const appliedUrls = getAppliedUrls();
console.log(`In DB: ${appliedUrls.size}\n`);

// Get job URLs from search page (with pagination)
const jobIds = new Set();
for (let page = 0; page < 3; page++) {
  const url = page === 0 ? searchUrl : searchUrl + `&start=${page * 25}`;
  goto(url);
  const snap = snapshot();
  for (const m of snap.matchAll(/\/jobs\/view\/(\d+)\//g)) jobIds.add(m[1]);
  console.log(`  Page ${page + 1}: ${jobIds.size} total jobs`);
}
const jobUrls = [...jobIds].map(id => `https://www.linkedin.com/jobs/view/${id}/`);
console.log(`Found ${jobUrls.length} jobs\n`);

let applied = 0, skipped = 0, failed = 0, misleading = 0;
let captchaHit = false;

for (const jobUrl of jobUrls) {
  if (applied >= maxJobs) break;
  if (appliedUrls.has(jobUrl)) { skipped++; continue; }

  console.log(`\n[${applied + skipped + failed + misleading + 1}] ${jobUrl}`);
  const result = applyToJob(jobUrl);

  if (result.status === 'applied') {
    console.log(`  APPLIED: ${result.company}`);
    registerApp(result.company, 'Software Engineer', jobUrl);
    appliedUrls.add(jobUrl);
    applied++;
    sleep(5000);
  } else if (result.status === 'already_applied') {
    console.log(`  Already applied`);
    skipped++;
  } else if (result.status === 'misleading') {
    console.log(`  SKIPPED: misleading ("${result.keyword}")`);
    misleading++;
  } else if (result.status === 'captcha') {
    console.log(`  CAPTCHA - STOPPING`);
    captchaHit = true;
    break;
  } else {
    console.log(`  FAILED: ${result.status}`);
    failed++;
  }
  sleep(2000);
}

console.log(`\n=== ${applied} applied, ${skipped} skipped, ${failed} failed, ${misleading} misleading ===`);
if (captchaHit) console.log('STOPPED: captcha');
