#!/usr/bin/env node
/**
 * profile-snapshot.js — Extract the current LinkedIn profile state via browser automation.
 *
 * Uses the browser wrapper (scripts/browser.js) and lib/browser-helpers.js to
 * evaluate JS on the current page. The LinkedIn profile URL is read from the DB
 * (users.data.linkedin_profile), never hardcoded.
 *
 * Usage:
 *   node scripts/linkedin/profile-snapshot.js                       # human-readable
 *   node scripts/linkedin/profile-snapshot.js --json                # JSON to stdout
 *   node scripts/linkedin/profile-snapshot.js --session <name>      # use a named session
 *
 * Requires a logged-in LinkedIn session in the work browser. If the session is
 * not active, the script exits with a message telling the user to log in.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const {
  ensure,
  goto,
  evalJSON,
  openBrowser,
} = require('../../lib/browser-helpers');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// --- DB access (read-only) ---

/**
 * Run a read-only SQL query via scripts/db.js and parse the JSON output.
 * @param {string} sql
 * @returns {any|null}
 */
function dbQuery(sql) {
  try {
    const escaped = sql.replace(/"/g, '\\"');
    const out = execSync(`node scripts/db.js "${escaped}"`, {
      encoding: 'utf8',
      timeout: 15000,
      cwd: REPO_ROOT,
    });
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

/**
 * Fetch the user's LinkedIn profile URL from the DB.
 * Stored in users.data.linkedin_profile (Gold Rule 9: never hardcoded).
 * @returns {string|null}
 */
function getProfileUrl() {
  const rows = dbQuery("SELECT data->'linkedin_profile' AS url FROM users WHERE id = 1");
  if (!rows || !rows.length) return null;
  const url = rows[0].url;
  // db.js returns JSON values as strings; strip outer quotes if present.
  if (typeof url === 'string') return url.replace(/^"|"$/g, '');
  return url || null;
}

// --- profile extraction (runs in the page via eval) ---

// A single self-contained eval that extracts every section at once. Returning
// one JSON object minimizes browser round-trips and keeps the snapshot atomic.
const EXTRACT_CODE = `(function () {
  function txt(el) {
    return el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  }

  // Find a top-level profile section by its anchor id (e.g. #about, #experience).
  function sectionById(id) {
    // The anchor lives in a <div id="..."> wrapper in modern LinkedIn markup.
    var anchor = document.getElementById(id);
    if (!anchor) return null;
    // Walk up to the nearest section-like container.
    var node = anchor;
    for (var i = 0; i < 8 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      if (node.tagName === 'SECTION' || node.getAttribute('data-view-name')) return node;
    }
    return anchor.parentElement || anchor;
  }

  // --- Headline ---
  var headline = '';
  var h1 = document.querySelector('h1');
  if (h1) headline = txt(h1);
  if (!headline) {
    var hl = document.querySelector('.text-body-medium, [data-generated-suggestion-target]');
    if (hl) headline = txt(hl);
  }

  // --- About ---
  var about = '';
  var aboutSection = sectionById('about');
  if (aboutSection) {
    var aboutEl = aboutSection.querySelector('.display-text, .inline-show-more-text, [class*="show-more-text"], p');
    if (aboutEl) about = txt(aboutEl);
  }

  // --- Experience ---
  var experience = [];
  var expSection = sectionById('experience');
  if (expSection) {
    var expNodes = expSection.querySelectorAll('.pvs-entity__path-node, [data-view-name="profile-component-experience"] .pvs-entity, li.pvs-entity, .artdeco-list__item');
    if (!expNodes.length) expNodes = expSection.querySelectorAll('[class*="pvs-entity"]');
    expNodes.forEach(function (node) {
      var titleEl = node.querySelector('h3, [class*="title"] span, .t-14 span');
      var companyEl = node.querySelector('h4, [class*="company"] span, .t-14 .t-normal');
      var periodEl = node.querySelector('.t-14.t-normal, [class*="date-range"], span[class*="t-14"]');
      var descEl = node.querySelector('.pvs-entity__description, [class*="show-more-text"], p');
      var title = txt(titleEl);
      var company = txt(companyEl);
      var period = txt(periodEl);
      var description = txt(descEl);
      if (title || company) {
        experience.push({ title: title, company: company, period: period, description: description });
      }
    });
  }

  // --- Education ---
  var education = [];
  var eduSection = sectionById('education');
  if (eduSection) {
    var eduNodes = eduSection.querySelectorAll('.pvs-entity__path-node, li.pvs-entity, .artdeco-list__item, [class*="pvs-entity"]');
    eduNodes.forEach(function (node) {
      var schoolEl = node.querySelector('h3, [class*="school"] span, .t-14 span');
      var degreeEl = node.querySelector('h4, [class*="degree"] span, .t-14 .t-normal');
      var periodEl = node.querySelector('.t-14.t-normal, [class*="date-range"], span[class*="t-14"]');
      var school = txt(schoolEl);
      var degree = txt(degreeEl);
      var period = txt(periodEl);
      if (school || degree) {
        education.push({ school: school, degree: degree, period: period });
      }
    });
  }

  // --- Skills ---
  var skills = [];
  var pinnedSkills = [];
  var skillsSection = sectionById('skills');
  if (skillsSection) {
    var skillNodes = skillsSection.querySelectorAll('.pvs-entity__path-node, li.pvs-entity, .artdeco-list__item, [class*="pvs-entity"]');
    skillNodes.forEach(function (node) {
      var nameEl = node.querySelector('h3, [class*="skill"] span, .t-14 span, span[dir="ltr"]');
      var name = txt(nameEl);
      if (!name) return;
      var isPinned = /pinned|top skill/i.test(node.className + ' ' + (node.getAttribute('aria-label') || ''));
      skills.push(name);
      if (isPinned || pinnedSkills.length < 3) pinnedSkills.push(name);
    });
  }

  // --- Open to work ---
  var openToWork = false;
  var openToWorkRoles = [];
  var otwIndicator = document.querySelector('.open-to-work, [class*="open-to-work"]');
  if (otwIndicator) openToWork = true;
  var otwSection = sectionById('open-to-work');
  if (otwSection) {
    openToWork = true;
    var roleNodes = otwSection.querySelectorAll('[class*="job-title"], .t-14 span, li');
    roleNodes.forEach(function (node) {
      var r = txt(node);
      if (r && r.length < 120) openToWorkRoles.push(r);
    });
  }

  // --- Languages ---
  var languages = [];
  var langSection = sectionById('languages');
  if (langSection) {
    var langNodes = langSection.querySelectorAll('.pvs-entity__path-node, li.pvs-entity, .artdeco-list__item, [class*="pvs-entity"]');
    langNodes.forEach(function (node) {
      var nameEl = node.querySelector('h3, [class*="language"] span, .t-24 span, span[dir="ltr"]');
      var levelEl = node.querySelector('h4, .t-14, [class*="proficiency"] span');
      var language = txt(nameEl);
      var level = txt(levelEl);
      if (language) languages.push({ language: language, level: level });
    });
  }

  // --- Certifications ---
  var certifications = [];
  var certSection = sectionById('certifications');
  if (!certSection) certSection = sectionById('licenses_and_certifications');
  if (certSection) {
    var certNodes = certSection.querySelectorAll('.pvs-entity__path-node, li.pvs-entity, .artdeco-list__item, [class*="pvs-entity"]');
    certNodes.forEach(function (node) {
      var nameEl = node.querySelector('h3, [class*="title"] span, .t-14 span');
      var issuerEl = node.querySelector('h4, [class*="issuer"] span, .t-14 .t-normal');
      var dateEl = node.querySelector('.t-14.t-normal, [class*="date"], span[class*="t-14"]');
      var name = txt(nameEl);
      var issuer = txt(issuerEl);
      var date = txt(dateEl);
      if (name) certifications.push({ name: name, issuer: issuer, date: date });
    });
  }

  return JSON.stringify({
    url: location.href,
    headline: headline,
    about: about,
    experience: experience,
    education: education,
    skills: skills,
    pinnedSkills: pinnedSkills,
    openToWork: openToWork,
    openToWorkRoles: openToWorkRoles,
    languages: languages,
    certifications: certifications,
    extractedAt: new Date().toISOString(),
  });
})()`;

/**
 * Extract the full LinkedIn profile snapshot from the current page.
 * @param {object} opts - { session, tab }
 * @returns {object|null}
 */
function extractSnapshot(opts) {
  return evalJSON(EXTRACT_CODE, opts);
}

// --- output formatting ---

function humanReadable(snap) {
  const lines = [];
  lines.push(`LinkedIn Profile Snapshot — ${snap.extractedAt}`);
  lines.push(`URL: ${snap.url}`);
  lines.push('');
  lines.push(`Headline: ${snap.headline || '(not found)'}`);
  lines.push('');
  lines.push('About:');
  lines.push(snap.about ? snap.about : '(not found)');
  lines.push('');
  lines.push(`Experience (${snap.experience.length}):`);
  if (snap.experience.length === 0) {
    lines.push('  (none found)');
  } else {
    snap.experience.forEach((r, i) => {
      lines.push(`  ${i + 1}. ${r.title}${r.company ? ' — ' + r.company : ''}`);
      if (r.period) lines.push(`     Period: ${r.period}`);
      if (r.description) lines.push(`     ${r.description.slice(0, 200)}`);
    });
  }
  lines.push('');
  lines.push(`Education (${snap.education.length}):`);
  if (snap.education.length === 0) {
    lines.push('  (none found)');
  } else {
    snap.education.forEach((e, i) => {
      lines.push(`  ${i + 1}. ${e.school}${e.degree ? ' — ' + e.degree : ''}${e.period ? ' (' + e.period + ')' : ''}`);
    });
  }
  lines.push('');
  lines.push(`Skills (${snap.skills.length}):`);
  if (snap.skills.length === 0) {
    lines.push('  (none found)');
  } else {
    lines.push(`  Pinned (top 3): ${snap.pinnedSkills.join(', ') || '(none)'}`);
    lines.push(`  All: ${snap.skills.join(', ')}`);
  }
  lines.push('');
  lines.push(`Open to work: ${snap.openToWork ? 'YES' : 'no'}`);
  if (snap.openToWork && snap.openToWorkRoles.length) {
    lines.push(`  Roles: ${snap.openToWorkRoles.join(', ')}`);
  }
  lines.push('');
  lines.push(`Languages (${snap.languages.length}):`);
  if (snap.languages.length === 0) {
    lines.push('  (none found)');
  } else {
    snap.languages.forEach((l, i) => {
      lines.push(`  ${i + 1}. ${l.language}${l.level ? ' — ' + l.level : ''}`);
    });
  }
  lines.push('');
  lines.push(`Certifications (${snap.certifications.length}):`);
  if (snap.certifications.length === 0) {
    lines.push('  (none found)');
  } else {
    snap.certifications.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.name}${c.issuer ? ' — ' + c.issuer : ''}${c.date ? ' (' + c.date + ')' : ''}`);
    });
  }
  return lines.join('\n');
}

// --- CLI ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { session: 'default', json: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session') {
      opts.session = args[++i] || 'default';
    } else if (args[i] === '--json') {
      opts.json = true;
    } else if (args[i] === '-h' || args[i] === '--help') {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  node scripts/linkedin/profile-snapshot.js [options]

Options:
  --session <name>   Browser session name (default: "default")
  --json             Output JSON to stdout instead of human-readable text
  -h, --help         Show this help

Requires a logged-in LinkedIn session in the work browser. The profile URL is
read from the DB (users.data.linkedin_profile).`);
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    return;
  }

  const browserOpts = { session: opts.session };

  // 1. Ensure the browser session is active.
  const alive = ensure(browserOpts);
  if (!alive) {
    // Gold Rule 5: open headed so the user can log in manually.
    console.error('[profile-snapshot] Browser session is not active. Opening headed for login.');
    openBrowser('https://www.linkedin.com', { headed: true, session: opts.session });
    console.error('[profile-snapshot] Please log in to LinkedIn, then re-run this script.');
    process.exit(1);
  }

  // 2. Read the profile URL from the DB (Gold Rule 9: never hardcoded).
  const profileUrl = getProfileUrl();
  if (!profileUrl) {
    console.error('[profile-snapshot] No LinkedIn profile URL found in DB (users.data.linkedin_profile). Run onboarding first.');
    process.exit(1);
  }

  // 3. Navigate to the profile.
  goto(profileUrl, browserOpts);

  // Give the page a moment to render dynamic sections.
  execSync('sleep 2', { timeout: 5000 });

  // 4. Extract the snapshot via in-page eval.
  const snap = extractSnapshot(browserOpts);
  if (!snap) {
    console.error('[profile-snapshot] Failed to extract profile data. The page may not have loaded or the session may have expired.');
    process.exit(1);
  }

  // 5. Output.
  if (opts.json) {
    console.log(JSON.stringify(snap, null, 2));
  } else {
    console.log(humanReadable(snap));
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractSnapshot, getProfileUrl, humanReadable };
