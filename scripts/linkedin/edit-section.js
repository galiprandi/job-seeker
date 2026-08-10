#!/usr/bin/env node
/**
 * edit-section.js — Edit a specific section of the LinkedIn profile via browser automation.
 *
 * Uses the browser wrapper (scripts/browser.js) through lib/browser-helpers.js.
 * All in-page interactions are performed via evalJS (querySelector + dispatchEvent)
 * because playwright-cli is driven through the shell, not Playwright Page objects.
 *
 * Prerequisite: a LinkedIn session must already be open via the browser wrapper:
 *   node scripts/browser.js open "https://www.linkedin.com" --headed
 *
 * Usage:
 *   node scripts/linkedin/edit-section.js --section headline --data '{"headline":"<Headline text>"}'
 *   node scripts/linkedin/edit-section.js --section about --data '{"about":"<About text>"}'
 *   node scripts/linkedin/edit-section.js --section experience --data '{"roles":[{"company":"<Company>","title":"<Title>","description":"<Description>"}]}'
 *   node scripts/linkedin/edit-section.js --section skills --data '{"pin":["<Skill1>","<Skill2>"],"add":["<Skill3>"]}'
 *   node scripts/linkedin/edit-section.js --section open-to-work --data '{"active":true,"titles":["<Role1>","<Role2>"]}'
 *   node scripts/linkedin/edit-section.js --section headline --data '{"headline":"<Headline text>"}' --session default
 *
 * Flags:
 *   --section <name>   Required. One of: headline, about, experience, skills, open-to-work
 *   --data <json>      Required. JSON string with the new content for the section
 *   --session <name>   Optional. Browser session name (default: "default")
 *
 * Exit codes:
 *   0 = success (all changes applied)
 *   1 = invalid args / missing data
 *   2 = browser not running / profile URL missing
 *   3 = one or more changes failed
 */
'use strict';

const {
  ensure,
  goto,
  evalJS,
  evalJSON,
  waitFor,
  waitForSelector,
  dbQuery,
} = require('../../lib/browser-helpers');

// --- CLI arg parsing ---

function parseArgs(argv) {
  const args = { session: 'default' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--section') args.section = argv[++i];
    else if (a === '--data') args.data = argv[++i];
    else if (a === '--session') args.session = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const VALID_SECTIONS = ['headline', 'about', 'experience', 'skills', 'open-to-work'];

function usage() {
  console.error(`Usage: node scripts/linkedin/edit-section.js --section <name> --data <json> [--session <name>]

Sections: ${VALID_SECTIONS.join(', ')}

Examples (placeholders only, real data comes from DB at runtime):
  --section headline    --data '{"headline":"<Headline text>"}'
  --section about       --data '{"about":"<About text>"}'
  --section experience  --data '{"roles":[{"company":"<Company>","title":"<Title>","description":"<Description>"}]}'
  --section skills      --data '{"pin":["<Skill1>","<Skill2>"],"add":["<Skill3>"]}'
  --section open-to-work --data '{"active":true,"titles":["<Role1>","<Role2>"]}'`);
}

// --- DB / profile URL ---

/**
 * Read the user's LinkedIn profile URL from DB and extract the vanity name.
 * Returns { url, vanity } or null.
 */
function loadProfileUrl() {
  const rows = dbQuery("SELECT data->'linkedin_profile' AS url FROM users WHERE id = 1");
  const url = rows[0]?.url;
  if (!url || typeof url !== 'string') return null;
  // Extract vanity from URLs like https://www.linkedin.com/in/<vanity> or .../in/<vanity>/
  const match = url.match(/\/in\/([^/?#]+)/);
  if (!match) return null;
  return { url, vanity: match[1] };
}

// --- Section -> edit URL ---

function editUrlForSection(section, vanity) {
  const base = `https://www.linkedin.com/in/${vanity}/edit/details`;
  switch (section) {
    case 'headline':
    case 'about':
      return `${base}/`;
    case 'experience':
      return `${base}/experiences/`;
    case 'skills':
      return `${base}/skills/`;
    case 'open-to-work':
      return `${base}/recruiteroptin/`;
    default:
      return null;
  }
}

// --- Generic in-page interaction primitives (via evalJS) ---

/**
 * Click the first element matching a selector by dispatching mouse events.
 * Mirrors clickWithEvents() from scripts/lib/playwright-helpers.js but runs
 * entirely inside the page via eval.
 */
function clickSelector(selector, opts = {}) {
  const code = `(function(){
    const el = document.querySelector('${selector}');
    if (!el) return 'not_found';
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    return 'clicked';
  })()`;
  return evalJS(code, opts) === 'clicked';
}

/**
 * Click the first element matching a selector whose aria-label contains text.
 */
function clickByAriaLabel(selector, labelFragment, opts = {}) {
  const frag = labelFragment.replace(/'/g, "\\'");
  const code = `(function(){
    const els = document.querySelectorAll('${selector}');
    for (const el of els) {
      const label = el.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes('${frag.toLowerCase()}')) {
        const o = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent('mousedown', o));
        el.dispatchEvent(new MouseEvent('click', o));
        el.dispatchEvent(new MouseEvent('mouseup', o));
        return 'clicked';
      }
    }
    return 'not_found';
  })()`;
  return evalJS(code, opts) === 'clicked';
}

/**
 * Fill a text input/textarea by setting .value and dispatching InputEvent.
 */
function fillInput(selector, text, opts = {}) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const code = `(function(){
    const el = document.querySelector('${selector}');
    if (!el) return 'not_found';
    el.focus();
    el.value = '${escaped}';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: '${escaped}' }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    return 'filled';
  })()`;
  return evalJS(code, opts) === 'filled';
}

/**
 * Fill a contenteditable element by setting textContent and dispatching InputEvent.
 * Mirrors fillContenteditable() from scripts/lib/playwright-helpers.js.
 */
function fillContenteditable(selector, text, opts = {}) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const code = `(function(){
    const el = document.querySelector('${selector}');
    if (!el) return 'not_found';
    el.focus();
    el.textContent = '${escaped}';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: '${escaped}' }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    return 'filled';
  })()`;
  return evalJS(code, opts) === 'filled';
}

/**
 * Click a save/submit button. Tries several known LinkedIn selectors.
 */
function clickSave(opts = {}) {
  const saveSelectors = [
    'button[type="submit"]',
    'button[aria-label*="Save"]',
    'button[aria-label*="Guardar"]',
    'button.artdeco-button--primary',
  ];
  for (const sel of saveSelectors) {
    if (clickSelector(sel, opts)) return true;
    if (clickByAriaLabel(sel, 'Save', opts)) return true;
  }
  return false;
}

/**
 * Read the current text of an element matching a selector.
 */
function readText(selector, opts = {}) {
  const code = `(function(){
    const el = document.querySelector('${selector}');
    return el ? el.textContent.trim() : null;
  })()`;
  return evalJS(code, opts);
}

/**
 * Read the current value of an input matching a selector.
 */
function readValue(selector, opts = {}) {
  const code = `(function(){
    const el = document.querySelector('${selector}');
    return el ? el.value : null;
  })()`;
  return evalJS(code, opts);
}

// --- Section handlers ---

/**
 * Headline: find the pencil/edit button for the headline, click it, fill the
 * input, and save.
 *
 * data: { headline: "<new headline text>" }
 */
function editHeadline(data, opts) {
  const results = [];
  const newText = data.headline;
  if (!newText || typeof newText !== 'string') {
    return [{ ok: false, error: 'data.headline is required and must be a string' }];
  }

  // The edit details page lists sections; the headline has an edit (pencil) button.
  // Try aria-label based edit buttons first, then generic pencil icons.
  const editClicked =
    clickByAriaLabel('button', 'Edit headline', opts) ||
    clickByAriaLabel('button', 'Editar titular', opts) ||
    clickByAriaLabel('button[aria-label*="Edit"]', 'headline', opts) ||
    clickSelector('button[aria-label*="Edit headline"]', opts);

  if (!editClicked) {
    results.push({ ok: false, error: 'could not find headline edit button' });
    return results;
  }

  // Wait for the edit form / input to appear.
  waitForSelector('input[type="text"], textarea', { timeout: 8000, ...opts });

  // The headline input is typically a text input inside the edit panel.
  const filled = fillInput('input[type="text"]', newText, opts) ||
    fillInput('textarea', newText, opts);
  if (!filled) {
    results.push({ ok: false, error: 'could not find headline input field' });
    return results;
  }

  // Verify the value was set.
  const current = readValue('input[type="text"]', opts) || readValue('textarea', opts);

  const saved = clickSave(opts);
  results.push({
    ok: saved,
    field: 'headline',
    previous: null,
    current,
    expected: newText,
    error: saved ? null : 'could not click save button',
  });
  return results;
}

/**
 * About: find the pencil/edit button for the about section, click it, fill the
 * contenteditable editor, and save.
 *
 * data: { about: "<new about text>" }
 */
function editAbout(data, opts) {
  const results = [];
  const newText = data.about;
  if (!newText || typeof newText !== 'string') {
    return [{ ok: false, error: 'data.about is required and must be a string' }];
  }

  const editClicked =
    clickByAriaLabel('button', 'Edit about', opts) ||
    clickByAriaLabel('button', 'Editar Acerca de', opts) ||
    clickByAriaLabel('button[aria-label*="Edit"]', 'about', opts) ||
    clickSelector('button[aria-label*="Edit about"]', opts);

  if (!editClicked) {
    results.push({ ok: false, error: 'could not find about edit button' });
    return results;
  }

  // Wait for the contenteditable editor to appear.
  waitForSelector('[contenteditable="true"]', { timeout: 8000, ...opts });

  const filled = fillContenteditable('[contenteditable="true"]', newText, opts);
  if (!filled) {
    results.push({ ok: false, error: 'could not find about contenteditable editor' });
    return results;
  }

  const current = readText('[contenteditable="true"]', opts);

  const saved = clickSave(opts);
  results.push({
    ok: saved,
    field: 'about',
    current,
    expected: newText,
    error: saved ? null : 'could not click save button',
  });
  return results;
}

/**
 * Experience: for each role in data.roles, find the matching role entry by
 * company + title, click its edit button, update the description, and save.
 *
 * data: { roles: [{ company, title, description }] }
 */
function editExperience(data, opts) {
  const results = [];
  const roles = Array.isArray(data.roles) ? data.roles : [];
  if (roles.length === 0) {
    return [{ ok: false, error: 'data.roles is required and must be a non-empty array' }];
  }

  for (const role of roles) {
    const { company, title, description } = role;
    if (!description) {
      results.push({ ok: false, company, title, error: 'role.description is required' });
      continue;
    }

    // Build a matcher that finds the experience entry containing both the
    // company and title text, then clicks its edit button.
    const companyEsc = (company || '').replace(/'/g, "\\'");
    const titleEsc = (title || '').replace(/'/g, "\\'");
    const descEsc = description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const code = `(function(){
      const sections = document.querySelectorAll('[data-view-name="profile-component"], .pv-profile-section, section');
      for (const section of sections) {
        const text = section.textContent || '';
        if (text.includes('${companyEsc}') && text.includes('${titleEsc}')) {
          const editBtn = section.querySelector('button[aria-label*="Edit"], button[aria-label*="edit"]');
          if (editBtn) {
            const o = { bubbles: true, cancelable: true, view: window };
            editBtn.dispatchEvent(new MouseEvent('mousedown', o));
            editBtn.dispatchEvent(new MouseEvent('click', o));
            editBtn.dispatchEvent(new MouseEvent('mouseup', o));
            return 'clicked';
          }
        }
      }
      return 'not_found';
    })()`;

    const clicked = evalJS(code, opts) === 'clicked';
    if (!clicked) {
      results.push({ ok: false, company, title, error: 'could not find experience edit button for this role' });
      continue;
    }

    // Wait for the edit form to appear (description is a contenteditable or textarea).
    waitForSelector('[contenteditable="true"], textarea', { timeout: 8000, ...opts });

    // The description field is usually a contenteditable editor; fall back to textarea.
    const filled = fillContenteditable('[contenteditable="true"]', description, opts) ||
      fillInput('textarea', description, opts);
    if (!filled) {
      results.push({ ok: false, company, title, error: 'could not find description field for this role' });
      continue;
    }

    const saved = clickSave(opts);
    results.push({
      ok: saved,
      company,
      title,
      field: 'description',
      expected: description,
      error: saved ? null : 'could not click save button',
    });
  }
  return results;
}

/**
 * Skills: pin specified skills (reorder) and add new skills if specified.
 *
 * data: { pin: ["<Skill1>", ...], add: ["<Skill3>", ...] }
 *
 * Pinning uses LinkedIn's pin UI (a button on each skill entry). Adding uses
 * the "Add skill" flow and a search input.
 */
function editSkills(data, opts) {
  const results = [];
  const pin = Array.isArray(data.pin) ? data.pin : [];
  const add = Array.isArray(data.add) ? data.add : [];

  if (pin.length === 0 && add.length === 0) {
    return [{ ok: false, error: 'data.pin and/or data.add must be non-empty arrays' }];
  }

  // --- Pin skills ---
  for (const skillName of pin) {
    const nameEsc = skillName.replace(/'/g, "\\'");
    const code = `(function(){
      const items = document.querySelectorAll('[data-view-name="skill"], .pv-skill-category-entity, li');
      for (const item of items) {
        const text = (item.textContent || '').trim();
        if (text.includes('${nameEsc}')) {
          const pinBtn = item.querySelector('button[aria-label*="Pin"], button[aria-label*="Fijar"]');
          if (pinBtn) {
            const o = { bubbles: true, cancelable: true, view: window };
            pinBtn.dispatchEvent(new MouseEvent('mousedown', o));
            pinBtn.dispatchEvent(new MouseEvent('click', o));
            pinBtn.dispatchEvent(new MouseEvent('mouseup', o));
            return 'pinned';
          }
          return 'no_pin_button';
        }
      }
      return 'not_found';
    })()`;
    const result = evalJS(code, opts);
    results.push({
      ok: result === 'pinned',
      skill: skillName,
      action: 'pin',
      error: result === 'pinned' ? null : `pin failed: ${result}`,
    });
  }

  // --- Add skills ---
  for (const skillName of add) {
    // Click the "Add skill" button.
    const addClicked =
      clickByAriaLabel('button', 'Add skill', opts) ||
      clickByAriaLabel('button', 'Agregar competencia', opts) ||
      clickSelector('button[aria-label*="Add skill"]', opts);
    if (!addClicked) {
      results.push({ ok: false, skill: skillName, action: 'add', error: 'could not find Add skill button' });
      continue;
    }

    // Wait for the skill search input to appear.
    waitForSelector('input[type="text"]', { timeout: 8000, ...opts });

    const filled = fillInput('input[type="text"]', skillName, opts);
    if (!filled) {
      results.push({ ok: false, skill: skillName, action: 'add', error: 'could not fill skill search input' });
      continue;
    }

    // Wait for the dropdown results to render, then click the first match.
    const nameEsc = skillName.replace(/'/g, "\\'");
    const selectCode = `(function(){
      const opts = document.querySelectorAll('div[role="option"], li[role="option"], .basic-typeahead__selectable');
      for (const opt of opts) {
        if ((opt.textContent || '').includes('${nameEsc}')) {
          const o = { bubbles: true, cancelable: true, view: window };
          opt.dispatchEvent(new MouseEvent('mousedown', o));
          opt.dispatchEvent(new MouseEvent('click', o));
          opt.dispatchEvent(new MouseEvent('mouseup', o));
          return 'selected';
        }
      }
      return 'not_found';
    })()`;
    // Poll for the option to appear (LinkedIn loads results asynchronously).
    const selected = waitFor(`(function(){
      const opts = document.querySelectorAll('div[role="option"], li[role="option"], .basic-typeahead__selectable');
      for (const opt of opts) {
        if ((opt.textContent || '').includes('${nameEsc}')) {
          const o = { bubbles: true, cancelable: true, view: window };
          opt.dispatchEvent(new MouseEvent('mousedown', o));
          opt.dispatchEvent(new MouseEvent('click', o));
          opt.dispatchEvent(new MouseEvent('mouseup', o));
          return true;
        }
      }
      return false;
    })()`, { timeout: 8000, ...opts });

    if (!selected) {
      results.push({ ok: false, skill: skillName, action: 'add', error: 'could not select skill from dropdown' });
      continue;
    }

    const saved = clickSave(opts);
    results.push({
      ok: saved,
      skill: skillName,
      action: 'add',
      error: saved ? null : 'could not click save button',
    });
  }
  return results;
}

/**
 * Open-to-work: activate the open-to-work signal if not active, and set role titles.
 *
 * data: { active: true, titles: ["<Role1>", "<Role2>"] }
 */
function editOpenToWork(data, opts) {
  const results = [];
  const titles = Array.isArray(data.titles) ? data.titles : [];

  if (titles.length === 0) {
    return [{ ok: false, error: 'data.titles is required and must be a non-empty array' }];
  }

  // Check if open-to-work is already active by looking for an active indicator.
  const isActiveCode = `(function(){
    const text = document.body.innerText || '';
    if (text.includes('Open to work') || text.includes('Disponible para trabajar')) {
      // Look for an active/toggle state indicator.
      const toggle = document.querySelector('input[type="checkbox"][checked], button[aria-pressed="true"]');
      return toggle ? 'active' : 'inactive';
    }
    return 'inactive';
  })()`;
  const state = evalJS(isActiveCode, opts);

  // If not active, click the activate/toggle button.
  if (state !== 'active' && data.active !== false) {
    const activated =
      clickByAriaLabel('button', 'Open to work', opts) ||
      clickByAriaLabel('button', 'Disponible para trabajar', opts) ||
      clickSelector('input[type="checkbox"]', opts);
    if (!activated) {
      results.push({ ok: false, field: 'active', error: 'could not activate open-to-work signal' });
      return results;
    }
    results.push({ ok: true, field: 'active', action: 'activated' });
  } else {
    results.push({ ok: true, field: 'active', action: 'already_active' });
  }

  // Set role titles. LinkedIn uses a multi-select / typeahead for job titles.
  for (const title of titles) {
    // Click the "Add" button for job titles if present.
    clickByAriaLabel('button', 'Add job title', opts) ||
      clickByAriaLabel('button', 'Agregar cargo', opts);

    waitForSelector('input[type="text"]', { timeout: 8000, ...opts });

    const filled = fillInput('input[type="text"]', title, opts);
    if (!filled) {
      results.push({ ok: false, field: 'title', title, error: 'could not fill title input' });
      continue;
    }

    // Select the matching option from the dropdown.
    const titleEsc = title.replace(/'/g, "\\'");
    const selected = waitFor(`(function(){
      const opts = document.querySelectorAll('div[role="option"], li[role="option"], .basic-typeahead__selectable');
      for (const opt of opts) {
        if ((opt.textContent || '').includes('${titleEsc}')) {
          const o = { bubbles: true, cancelable: true, view: window };
          opt.dispatchEvent(new MouseEvent('mousedown', o));
          opt.dispatchEvent(new MouseEvent('click', o));
          opt.dispatchEvent(new MouseEvent('mouseup', o));
          return true;
        }
      }
      return false;
    })()`, { timeout: 8000, ...opts });

    if (!selected) {
      results.push({ ok: false, field: 'title', title, error: 'could not select title from dropdown' });
      continue;
    }
    results.push({ ok: true, field: 'title', title });
  }

  // Save the open-to-work settings.
  const saved = clickSave(opts);
  if (!saved) {
    results.push({ ok: false, field: 'save', error: 'could not click save button' });
  }
  return results;
}

// --- Main ---

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!args.section || !VALID_SECTIONS.includes(args.section)) {
    console.error(`Error: --section is required and must be one of: ${VALID_SECTIONS.join(', ')}`);
    usage();
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(args.data);
  } catch (e) {
    console.error(`Error: --data must be valid JSON: ${e.message}`);
    process.exit(1);
  }

  const opts = { session: args.session };

  // Ensure the browser session is alive.
  if (!ensure(opts)) {
    console.error('Error: browser session is not running. Open it first with:');
    console.error('  node scripts/browser.js open "https://www.linkedin.com" --headed');
    process.exit(2);
  }

  // Load the profile URL / vanity from DB.
  const profile = loadProfileUrl();
  if (!profile) {
    console.error('Error: could not load linkedin_profile URL from DB (users.data.linkedin_profile for id=1).');
    process.exit(2);
  }

  const editUrl = editUrlForSection(args.section, profile.vanity);
  if (!editUrl) {
    console.error(`Error: no edit URL mapping for section "${args.section}"`);
    process.exit(1);
  }

  // Navigate to the edit page.
  goto(editUrl, opts);
  // Wait for the edit details page to render.
  waitForSelector('button, [contenteditable], input', { timeout: 15000, ...opts });

  // Dispatch to the section handler.
  let results;
  switch (args.section) {
    case 'headline':
      results = editHeadline(data, opts);
      break;
    case 'about':
      results = editAbout(data, opts);
      break;
    case 'experience':
      results = editExperience(data, opts);
      break;
    case 'skills':
      results = editSkills(data, opts);
      break;
    case 'open-to-work':
      results = editOpenToWork(data, opts);
      break;
    default:
      console.error(`Error: unsupported section "${args.section}"`);
      process.exit(1);
  }

  // Report results.
  const allOk = results.every((r) => r.ok);
  for (const r of results) {
    const status = r.ok ? 'SUCCESS' : 'FAILURE';
    const detail = JSON.stringify(r);
    console.log(`[${status}] ${detail}`);
  }

  process.exit(allOk ? 0 : 3);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  loadProfileUrl,
  editUrlForSection,
  editHeadline,
  editAbout,
  editExperience,
  editSkills,
  editOpenToWork,
};
