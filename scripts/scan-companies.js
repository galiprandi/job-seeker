#!/usr/bin/env node
/**
 * scan-companies.js — Scan company websites for careers/registration pages and contact emails
 * Usage: node scripts/scan-companies.js [--start 0] [--max 20]
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const companies = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'argentina-it-companies.json'), 'utf8'));

const startIdx = parseInt(process.argv.includes('--start') ? process.argv[process.argv.indexOf('--start') + 1] : '0');
const max = parseInt(process.argv.includes('--max') ? process.argv[process.argv.indexOf('--max') + 1] : companies.length);

const batch = companies.slice(startIdx, startIdx + max);

const CAREERS_KEYWORDS = /(?:careers|trabaja|trabajá|sumate|postulate|postulá|talentos|rrhh|recursos\s+humanos|jobs|vacantes|oportunidades|join\s+us|work\s+with\s+us|envianos\s+tu\s+cv|enviános\s+tu\s+cv|carreras|unete|unite|seleccion|selección)/gi;
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))/g;
const CAREERS_LINK_REGEX = /href=["']([^"']*(?:careers|trabaja|sumate|postulate|jobs|vacantes|rrhh|talentos|carreras|unete|unite|seleccion)[^"']*)["']/gi;

function fetchUrl(url, timeout = 10000) {
  try {
    const escaped = url.replace(/'/g, "'\\''");
    return execSync(`curl -sL --max-time ${timeout / 1000} '${escaped}' 2>/dev/null`, {
      encoding: 'utf8',
      timeout: timeout + 5000,
      maxBuffer: 2 * 1024 * 1024
    });
  } catch (e) {
    return '';
  }
}

function extractEmails(html) {
  const emails = new Set();
  let match;
  while ((match = EMAIL_REGEX.exec(html)) !== null) {
    const email = match[1].toLowerCase();
    // Filter out common non-HR emails
    if (!email.includes('sentry') && !email.includes('noreply') && !email.includes('no-reply') &&
        !email.includes('example.com') && !email.includes('sentry.io') && !email.includes('wixpress')) {
      emails.add(email);
    }
  }
  return Array.from(emails);
}

function extractCareersLinks(html, baseUrl) {
  const links = new Set();
  let match;
  while ((match = CAREERS_LINK_REGEX.exec(html)) !== null) {
    let link = match[1];
    if (link.startsWith('/')) {
      try { link = new URL(link, baseUrl).href; } catch {}
    } else if (!link.startsWith('http')) {
      try { link = new URL(link, baseUrl).href; } catch {}
    }
    links.add(link);
  }
  return Array.from(links);
}

function hasCareersContent(html) {
  return CAREERS_KEYWORDS.test(html);
}

const results = [];

for (let i = 0; i < batch.length; i++) {
  const company = batch[i];
  const idx = startIdx + i;
  process.stderr.write(`[${idx + 1}/${companies.length}] ${company.name}... `);

  const html = fetchUrl(company.url);
  const emails = extractEmails(html);
  const careersLinks = extractCareersLinks(html, company.url);
  const hasCareers = hasCareersContent(html);

  // Try to find HR-specific emails
  const hrEmails = emails.filter(e =>
    e.includes('rrhh') || e.includes('hr') || e.includes('talentos') ||
    e.includes('cv') || e.includes('seleccion') || e.includes('recursos') ||
    e.includes('careers') || e.includes('jobs') || e.includes('contacto') ||
    e.includes('contact') || e.includes('info') || e.includes('empleo')
  );

  const result = {
    idx: idx + 1,
    name: company.name,
    url: company.url,
    linkedin: company.linkedin,
    hasCareersPage: hasCareers,
    careersLinks: careersLinks.slice(0, 5),
    allEmails: emails.slice(0, 10),
    hrEmails: hrEmails.slice(0, 5),
    status: 'pending'
  };

  if (careersLinks.length > 0) {
    result.status = 'has_careers_link';
  } else if (hasCareers) {
    result.status = 'has_careers_keyword';
  } else if (hrEmails.length > 0) {
    result.status = 'has_hr_email';
  } else if (emails.length > 0) {
    result.status = 'has_contact_email';
  } else {
    result.status = 'no_contact_found';
  }

  results.push(result);
  process.stderr.write(`${result.status} (${result.hrEmails.length} hr emails, ${result.careersLinks.length} careers links)\n`);
}

// Output results as JSON
console.log(JSON.stringify(results, null, 2));
