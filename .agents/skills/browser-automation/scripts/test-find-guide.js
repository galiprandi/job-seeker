#!/usr/bin/env node
/**
 * Test for findSiteGuide — verifies that known domains resolve to the correct
 * guide files and that unknown domains return null.
 *
 * Run: node .agents/skills/browser-automation/scripts/test-find-guide.js
 */
'use strict';

const path = require('path');
const fs = require('fs');

const SITES_DIR = path.join(__dirname, '..', 'sites');

const DOMAIN_ALIASES = {
  'mail.google.com': 'gmail_com',
  'web.whatsapp.com': 'whatsapp_com',
  'whatsapp.com': 'whatsapp_com',
};

const PATH_GUIDES = {
  'www.google.com/maps': 'google_com/maps-guide.md',
  'google.com/maps': 'google_com/maps-guide.md',
  'maps.google.com': 'google_com/maps-guide.md',
};

function findSiteGuide(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const hostname = parsed.hostname.toLowerCase();
  const pathPrefix = parsed.pathname.split('/').filter(Boolean)[0] || '';
  const pathKey = pathPrefix ? `${hostname}/${pathPrefix}` : hostname;
  if (PATH_GUIDES[pathKey]) {
    const p = path.join(SITES_DIR, PATH_GUIDES[pathKey]);
    if (fs.existsSync(p)) return p;
  }
  if (PATH_GUIDES[hostname]) {
    const p = path.join(SITES_DIR, PATH_GUIDES[hostname]);
    if (fs.existsSync(p)) return p;
  }
  if (DOMAIN_ALIASES[hostname]) {
    const p = path.join(SITES_DIR, DOMAIN_ALIASES[hostname], 'guide.md');
    if (fs.existsSync(p)) return p;
  }
  const parts = hostname.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const slug = parts.slice(i).join('_');
    const p = path.join(SITES_DIR, slug, 'guide.md');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Test cases: [url, expectedPath or null]
const tests = [
  // Aliases
  ['https://mail.google.com/mail', 'gmail_com/guide.md'],
  ['https://web.whatsapp.com/', 'whatsapp_com/guide.md'],
  ['https://whatsapp.com/', 'whatsapp_com/guide.md'],
  // Path overrides
  ['https://www.google.com/maps', 'google_com/maps-guide.md'],
  ['https://google.com/maps', 'google_com/maps-guide.md'],
  ['https://maps.google.com/', 'google_com/maps-guide.md'],
  // Progressive subdomain stripping
  ['https://www.linkedin.com/', 'linkedin_com/guide.md'],
  ['https://www.facebook.com/', 'facebook_com/guide.md'],
  ['https://www.discord.com/', 'discord_com/guide.md'],
  ['https://discord.com/', 'discord_com/guide.md'],
  ['https://www.jira.com/', 'jira_com/guide.md'],
  ['https://jira.com/', 'jira_com/guide.md'],
  ['https://outlook.office.com/', 'outlook_office_com/guide.md'],
  ['https://www.teamtailor.com/', 'teamtailor_com/guide.md'],
  ['https://reddit.com/', 'reddit_com/guide.md'],
  ['https://www.reddit.com/', 'reddit_com/guide.md'],
  // No guide
  ['https://example.com/', null],
  ['https://calendar.google.com/', null],
  ['https://groq.com/', null],
  ['https://localhost:3000/', null],
];

let passed = 0;
let failed = 0;

for (const [url, expected] of tests) {
  const result = findSiteGuide(url);
  const resultSlug = result ? path.relative(SITES_DIR, result).replace(/\\/g, '/') : null;
  const ok = resultSlug === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL: ${url}`);
    console.log(`  expected: ${expected}`);
    console.log(`  got:      ${resultSlug}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
process.exit(failed > 0 ? 1 : 0);
