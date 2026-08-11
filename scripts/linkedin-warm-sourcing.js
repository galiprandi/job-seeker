#!/usr/bin/env node
/**
 * linkedin-warm-sourcing.js — Discover internal contacts, alumni, ex-colleagues, and recruiters at a target company.
 *
 * Candidate-agnostic: reads university, past companies, and profile data from Postgres DB.
 * Uses playwright-cli via browser.js wrapper and lib/browser-helpers for eval-based extraction.
 *
 * Usage:
 *   node scripts/browser.js open "https://www.linkedin.com"
 *   node scripts/linkedin-warm-sourcing.js --company "Stripe" --role "Engineering Manager"
 *   node scripts/linkedin-warm-sourcing.js --company "Meta" --json
 *   node scripts/linkedin-warm-sourcing.js --company "Google" --session apply-1 --json
 *   node scripts/linkedin-warm-sourcing.js --company "Stripe" --pages 2 --json
 *   node scripts/linkedin-warm-sourcing.js --help
 *
 * Output (JSON array of contacts):
 *   [
 *     {
 *       "name": "Jane Doe",
 *       "title": "Staff Engineer at Stripe",
 *       "vanity": "jane-doe",
 *       "profile_url": "https://www.linkedin.com/in/jane-doe/",
 *       "category": "alumni", // "alumni" | "ex_colleague" | "recruiter" | "hiring_manager"
 *       "connection_degree": "2nd",
 *       "company": "Stripe"
 *     }
 *   ]
 *
 * Exit codes:
 *   0 = success (results may be empty)
 *   2 = missing required --company argument OR browser not running
 */
'use strict';

const {
  gotoAndEvalJSON,
  dbQuery,
  ensure,
} = require('../lib/browser-helpers');

let SESSION = 'default';

// JS code injected into the page to extract people from LinkedIn People search results.
// Uses [role="listitem"] selector (empirically validated against real LinkedIn DOM
// snapshots and a fixture test via playwright-cli — see tests/browser/09-warm-sourcing.test.mjs).
// Polls for up to 10s for results to render (LinkedIn loads search results dynamically).
// Extracts: name, vanity, title, connection_degree, profile_url.
const EXTRACT_JS = `(async function() {
  var start = Date.now();
  while (Date.now() - start < 10000) {
    var items = document.querySelectorAll('[role="listitem"]');
    if (items.length > 0) break;
    await new Promise(function(r) { setTimeout(r, 500); });
  }
  var items = Array.from(document.querySelectorAll('[role="listitem"]'));
  var result = items.map(function(li) {
    var inLinks = Array.from(li.querySelectorAll('a[href*="/in/"]')).filter(function(a) {
      return !a.href.includes('search/results');
    });
    var profileLink = inLinks[0];
    var vanity = profileLink ? (profileLink.href.match(/\\/in\\/([^/]+)/) || [])[1] : '';
    if (vanity) vanity = decodeURIComponent(vanity);
    var nameLink = inLinks.find(function(a) {
      var t = a.textContent.trim();
      return t.length > 0 && t.length < 60 && !t.includes('\\u2022') && !t.includes('mutual');
    });
    var name = nameLink ? nameLink.textContent.trim().split('\\n')[0].trim() : '';
    var leafSpans = Array.from(li.querySelectorAll('*'))
      .filter(function(e) { return e.children.length === 0 && e.tagName === 'SPAN'; })
      .map(function(e) { return e.textContent.trim(); })
      .filter(function(t) { return t.length > 0; });
    var degreeIdx = leafSpans.findIndex(function(t) { return /^\\u2022\\s*(1st|2nd|3rd\\+?)/.test(t); });
    var degree = degreeIdx >= 0 ? leafSpans[degreeIdx].replace(/^\\u2022\\s*/, '') : '';
    var title = (degreeIdx >= 0 && leafSpans[degreeIdx + 1]) ? leafSpans[degreeIdx + 1] : '';
    // Fallback: if title is empty, use the second <p> element (LinkedIn renders
    // title as the paragraph after the name+degree paragraph).
    if (!title) {
      var paras = Array.from(li.querySelectorAll('p')).map(function(p) { return p.textContent.trim(); }).filter(function(t) { return t.length > 0; });
      var titleParaIdx = paras.findIndex(function(t) { return /^\\u2022\\s*(1st|2nd|3rd\\+?)/.test(t); });
      if (titleParaIdx >= 0 && paras[titleParaIdx + 1]) {
        title = paras[titleParaIdx + 1];
      } else if (paras.length >= 2) {
        // No degree marker in paragraphs either — try second paragraph
        title = paras[1];
      }
      // Also try to extract degree from the first paragraph if not found in spans
      if (!degree && paras.length > 0) {
        var pDegreeMatch = paras[0].match(/\\u2022\\s*(1st|2nd|3rd\\+?)/);
        if (pDegreeMatch) degree = pDegreeMatch[1];
      }
    }
    return {
      name: name,
      vanity: vanity,
      title: title,
      connection_degree: degree,
      profile_url: profileLink ? profileLink.href : ''
    };
  }).filter(function(p) { return p.vanity && p.name; });
  return JSON.stringify(result);
})()`;

/**
 * Derive contact category from title for recruiter/hiring-manager searches.
 * Alumni and ex-colleague categories are determined by the search query, not the title.
 * Only people-management roles are classified as hiring_manager. IC titles
 * (Staff Engineer, Lead Engineer, Senior Engineer, etc.) are NOT hiring managers.
 * @param {string} title - Contact's headline/title from LinkedIn
 * @returns {string} "recruiter" | "hiring_manager"
 */
function deriveRecruiterCategory(title) {
  const t = (title || '').toLowerCase();
  // Hiring manager signals: roles that involve managing people/hiring.
  // NOTE: "lead engineer", "staff engineer", "principal engineer" are IC tracks, not managers.
  if (/(hiring manager|engineering manager|head of engineering|head of data|vp of|director of engineering|director of data|engineering director|team lead|tech lead manager)/.test(t)) {
    return 'hiring_manager';
  }
  // Everything else from the recruiter search (recruiter, talent acquisition, sourcer, etc.)
  return 'recruiter';
}

function dedupe(contacts) {
  const seen = new Set();
  return contacts.filter((c) => {
    if (!c.vanity || seen.has(c.vanity)) return false;
    seen.add(c.vanity);
    return true;
  });
}

function mapResultsToContacts(results, searchCategory, company) {
  if (!Array.isArray(results)) return [];
  return results.map((p) => ({
    name: p.name,
    title: p.title || '',
    vanity: p.vanity,
    profile_url: p.profile_url || `https://www.linkedin.com/in/${p.vanity}/`,
    // For recruiter searches, derive category from title. For alumni/ex_colleague, keep search category.
    category: (searchCategory === 'recruiter' || searchCategory === 'hiring_manager')
      ? deriveRecruiterCategory(p.title)
      : searchCategory,
    connection_degree: p.connection_degree || '',
    company,
  }));
}

function searchPeople(url, searchCategory, company, pages) {
  const allContacts = [];
  const opts = { session: SESSION !== 'default' ? SESSION : undefined, timeout: 30000 };
  for (let page = 1; page <= pages; page++) {
    const pageUrl = page > 1 ? `${url}&page=${page}` : url;
    const results = gotoAndEvalJSON(pageUrl, EXTRACT_JS, opts);
    const contacts = mapResultsToContacts(results, searchCategory, company);
    if (contacts.length === 0) break;
    allContacts.push(...contacts);
  }
  return allContacts;
}

function printHelp() {
  console.log(`Usage:
  node scripts/linkedin-warm-sourcing.js --company "<Company>" [--role "<Role>"] [--session <name>] [--pages <n>] [--json]

Options:
  --company <name>    Target company name (required)
  --role <role>       Target role (narrows recruiter/hiring-manager search)
  --session <name>    Browser session name (default: "default")
  --pages <n>         Number of result pages to scan (default: 1)
  --json              Output raw JSON (default: human-readable)
  -h, --help          Show this help

Exit codes:
  0 = success (results may be empty)
  2 = missing --company argument OR browser not running`);
}

function main() {
  const args = process.argv.slice(2);
  let company = '';
  let role = '';
  let jsonOutput = false;
  let pages = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--company' && args[i + 1]) { company = args[i + 1]; i++; }
    else if (args[i] === '--role' && args[i + 1]) { role = args[i + 1]; i++; }
    else if (args[i] === '--session' && args[i + 1]) { SESSION = args[i + 1]; i++; }
    else if (args[i] === '--json') jsonOutput = true;
    else if (args[i] === '--pages' && args[i + 1]) { pages = parseInt(args[i + 1], 10) || 1; i++; }
    else if (args[i] === '-h' || args[i] === '--help') { printHelp(); process.exit(0); }
  }

  if (!company) {
    console.error('Usage: node scripts/linkedin-warm-sourcing.js --company "<Company>" [--role "<Role>"] [--session <name>] [--pages <n>] [--json]');
    process.exit(2);
  }

  // Verify browser session is active before attempting any navigation.
  // Without this, gotoAndEvalJSON silently returns null and the script reports
  // "0 contacts found" — misleading the user into thinking there are no contacts.
  const sessionOpts = SESSION !== 'default' ? { session: SESSION } : {};
  if (!ensure(sessionOpts)) {
    console.error(`Error: Browser session '${SESSION}' is not active. Run: node scripts/browser.js open "https://www.linkedin.com"${SESSION !== 'default' ? ` --session ${SESSION}` : ''}`);
    process.exit(2);
  }

  // Load candidate education and experience background from DB
  const userRows = dbQuery(`SELECT data->'profile' AS profile FROM users WHERE id = 1`);
  const profile = userRows && userRows[0] && userRows[0].profile ? userRows[0].profile : {};

  const education = Array.isArray(profile.education) ? profile.education : [];
  const experience = Array.isArray(profile.experience) ? profile.experience : [];

  // Extract university/institution names from education entries.
  // Handles multiple schema variants: institution, school, university, name.
  const universityKeywords = education
    .map((e) => {
      if (typeof e === 'string') return e;
      return e.institution || e.school || e.university || e.name || '';
    })
    .filter((s) => s && s.length > 2);

  // Extract past company names from experience entries (excluding the target company).
  const pastCompanies = experience
    .map((e) => {
      if (typeof e === 'string') return e;
      return e.company || e.organization || '';
    })
    .filter((c) => c && c.length > 2 && c.toLowerCase() !== company.toLowerCase());

  const allContacts = [];

  // 1. Search Recruiter / Hiring Manager at Target Company
  const recruiterQuery = role
    ? `"${company}" "${role}" recruiter OR "talent acquisition" OR "hiring manager"`
    : `"${company}" recruiter OR "talent acquisition" OR "hiring manager"`;
  const recruiterUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(recruiterQuery)}`;
  const recruiterContacts = searchPeople(recruiterUrl, 'recruiter', company, pages);
  allContacts.push(...recruiterContacts);

  // 2. Search Alumni at Target Company (for each university in profile)
  for (const school of universityKeywords) {
    const alumniQuery = `"${company}" "${school}"`;
    const alumniUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(alumniQuery)}`;
    const alumniContacts = searchPeople(alumniUrl, 'alumni', company, pages);
    allContacts.push(...alumniContacts);
  }

  // 3. Search Ex-Colleagues at Target Company (for each past company in profile)
  for (const pastCompany of pastCompanies) {
    const exColleagueQuery = `"${company}" "${pastCompany}"`;
    const exColleagueUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(exColleagueQuery)}`;
    const exColleagueContacts = searchPeople(exColleagueUrl, 'ex_colleague', company, pages);
    allContacts.push(...exColleagueContacts);
  }

  const uniqueContacts = dedupe(allContacts);

  if (jsonOutput) {
    console.log(JSON.stringify(uniqueContacts, null, 2));
  } else {
    console.log(`\nWarm Sourcing Results for ${company} (${uniqueContacts.length} contacts found):\n`);
    if (universityKeywords.length === 0) {
      console.log('  Note: No university/institution found in profile.education. Alumni search skipped.\n');
    }
    uniqueContacts.forEach((c, i) => {
      console.log(`${i + 1}. [${c.category.toUpperCase()}] ${c.name} (${c.connection_degree})`);
      console.log(`   Title:   ${c.title}`);
      console.log(`   Profile: ${c.profile_url}`);
      console.log();
    });
  }

  process.exit(0);
}

// Export for testing. Guard main() so requiring the module doesn't execute it.
if (require.main === module) {
  main();
}

module.exports = { EXTRACT_JS, deriveRecruiterCategory, dedupe, mapResultsToContacts };
