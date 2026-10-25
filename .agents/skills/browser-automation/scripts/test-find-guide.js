#!/usr/bin/env node
/**
 * Test for findGuide — verifies that known hosts resolve to the correct
 * guide files and that unknown hosts return null.
 *
 * Mirrors the logic in browser.js:
 *   1. PATH_GUIDES override (hostname + path prefix)
 *   2. `domains:` frontmatter across sites/*//*.md — suffix match
 *   3. generic candidates [host, host-minus-first-label, first-label]
 *      sanitized to a directory name under sites/ + guide.md
 *
 * Run: node .agents/skills/browser-automation/scripts/test-find-guide.js
 */
'use strict';

const path = require('path');
const fs = require('fs');

const SITES_DIR = path.join(__dirname, '..', 'sites');

// Exact copy of PATH_GUIDES + parseFrontmatterDomains + buildDomainIndex +
// findGuide from browser.js — keep in sync.
const PATH_GUIDES = {
  'www.google.com/maps': 'google_com/maps-guide.md',
  'google.com/maps': 'google_com/maps-guide.md',
  'maps.google.com': 'google_com/maps-guide.md',
  'calendar.google.com': 'calendar_google_com/calendar-deeplink.md',
};

function parseFrontmatterDomains(filePath) {
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    head = buf.toString('utf8', 0, n);
  } catch {
    return [];
  }
  const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const body = fm[1];
  const dm = body.match(/^domains:[ \t]*(.*)$/m);
  if (!dm) return [];
  const inline = dm[1].trim();
  const out = [];
  const clean = (s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (inline.startsWith('[')) {
    for (const s of inline.replace(/^\[/, '').replace(/\].*$/, '').split(',')) {
      const v = clean(s);
      if (v) out.push(v);
    }
    return out;
  }
  for (const line of body.slice(body.indexOf(dm[0]) + dm[0].length).split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const lm = line.match(/^\s*-\s*(\S+)\s*$/);
    if (!lm) break;
    out.push(clean(lm[1]));
  }
  return out;
}

function buildDomainIndex() {
  const idx = new Map();
  try {
    for (const dir of fs.readdirSync(SITES_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
      const dirPath = path.join(SITES_DIR, dir.name);
      for (const f of fs.readdirSync(dirPath)) {
        if (!f.endsWith('.md')) continue;
        const fp = path.join(dirPath, f);
        for (const d of parseFrontmatterDomains(fp)) {
          if (!idx.has(d)) idx.set(d, fp);
        }
      }
    }
  } catch { /* sites dir missing → empty index */ }
  return idx;
}

function findGuide(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname) return null;
    const pathPrefix = u.pathname.split('/').filter(Boolean)[0] || '';

    const pathKey = pathPrefix ? `${hostname}/${pathPrefix}` : hostname;
    if (PATH_GUIDES[pathKey]) {
      const p = path.join(SITES_DIR, PATH_GUIDES[pathKey]);
      if (fs.existsSync(p)) return p;
    }
    if (PATH_GUIDES[hostname]) {
      const p = path.join(SITES_DIR, PATH_GUIDES[hostname]);
      if (fs.existsSync(p)) return p;
    }

    const parts = hostname.split('.');

    const idx = buildDomainIndex();
    for (let i = 0; i < parts.length - 1; i++) {
      const guidePath = idx.get(parts.slice(i).join('.'));
      if (guidePath) return guidePath;
    }

    const host = hostname.replace(/^www\./, '');
    const candidates = [host, host.split('.').slice(1).join('.'), host.split('.')[0]];
    for (const c of candidates) {
      if (!c) continue;
      const dir = path.join(SITES_DIR, c.replace(/[^a-z0-9_]/g, '_'));
      const guide = path.join(dir, 'guide.md');
      if (fs.existsSync(guide)) return guide;
    }
  } catch {}
  return null;
}

// Test cases: [url, expectedPath or null]
const tests = [
  // Full host match (generic candidate or declared domain)
  ['https://outlook.office.com/', 'outlook_office_com/guide.md'],
  ['https://dash.cloudflare.com/', 'dash_cloudflare_com/guide.md'],
  ['https://app.web3forms.com/', 'app_web3forms_com/guide.md'],
  ['https://docs.google.com/', 'docs_google_com/guide.md'],
  ['https://www.vea.com.ar/', 'vea_com_ar/guide.md'],
  ['https://afip.gob.ar/', 'afip_gob_ar/guide.md'],
  // www. stripped, then full host match
  ['https://www.linkedin.com/', 'linkedin_com/guide.md'],
  ['https://www.reddit.com/', 'reddit_com/guide.md'],
  ['https://www.jira.com/', 'jira_com/guide.md'],
  ['https://www.facebook.com/', 'facebook_com/guide.md'],
  ['https://www.discord.com/', 'discord_com/guide.md'],
  ['https://discord.com/', 'discord_com/guide.md'],
  ['https://humand.co/', 'humand_co/guide.md'],
  // domains: frontmatter resolution
  ['https://web.whatsapp.com/', 'whatsapp_com/guide.md'],
  ['https://mail.google.com/', 'gmail_com/guide.md'],
  ['https://mail.google.com/mail/u/0/#inbox', 'gmail_com/guide.md'],
  ['https://inbox.google.com/', 'gmail_com/guide.md'],
  ['https://calendar.google.com/', 'calendar_google_com/calendar-deeplink.md'],
  ['https://teams.microsoft.com/', 'teams_com/guide.md'],
  ['https://teams.live.com/', 'teams_com/guide.md'],
  ['https://foo.linkedin.com/', 'linkedin_com/guide.md'],
  ['https://foo.bar.linkedin.com/', 'linkedin_com/guide.md'], // suffix match
  // Path-based overrides
  ['https://www.google.com/maps', 'google_com/maps-guide.md'],
  ['https://maps.google.com/', 'google_com/maps-guide.md'],
  ['https://xx.linkedin.com/', 'linkedin_com/guide.md'],
  // Subdomain of a declared domain → resolves via suffix match
  // (groq_com declares groq.com on a non-guide.md file)
  ['https://api.groq.com/', 'groq_com/signup-apikey.md'],
  // No guide: candidates sanitize to dirs that don't exist
  ['https://example.com/', null],
  ['https://localhost:3000/', null],
  // Invalid URL
  ['not-a-url', null],
];

let passed = 0;
let failed = 0;

for (const [url, expected] of tests) {
  const result = findGuide(url);
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
