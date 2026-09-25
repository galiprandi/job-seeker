#!/usr/bin/env node
// Fix applications with company = 'Unknown' by scraping job pages
const { execSync } = require('child_process');

function snapshot() {
  return execSync('node scripts/browser.js exec snapshot', { encoding: 'utf8', timeout: 15000 });
}

function goto(url) {
  execSync(`node scripts/browser.js goto "${url}"`, { encoding: 'utf8', timeout: 20000 });
}

function sleep(ms) { execSync(`sleep ${ms/1000}`); }

function dbQuery(sql) {
  const out = execSync(`node scripts/db.js "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
  try { return JSON.parse(out); } catch { return []; }
}

function dbWrite(sql) {
  execSync(`node scripts/db.js "${sql.replace(/"/g, '\\"')}" --write`, { encoding: 'utf8' });
}

function escapeSql(s) { return s.replace(/'/g, "''"); }

// Get all Unknown applications
const apps = dbQuery("SELECT id, url FROM applications WHERE user_id = 1 AND status = 'applied' AND (company = 'Unknown' OR company IS NULL OR company = '') ORDER BY id");
console.log(`Found ${apps.length} applications to fix\n`);

let fixed = 0;
for (const app of apps) {
  try {
    goto(app.url);
    sleep(2000);
    const snap = snapshot();

    let company = null;
    let role = null;

    // Try to find company link pointing to /company/ - pattern: link "CompanyName" [ref=xxx]:\n - /url: .../company/
    const companyMatch = snap.match(/- link "([^"]+)" \[ref=[a-z0-9]+\]:\s*\n\s*- \/url: https:\/\/www\.linkedin\.com\/company\//);
    if (companyMatch) {
      company = companyMatch[1].trim();
    }

    // Alternative: heading level=1 is the job title
    const roleMatch = snap.match(/- heading "([^"]+)" \[level=1\]/);
    if (roleMatch) {
      role = roleMatch[1].trim();
    }

    // Fallback: any link followed by /company/ URL
    if (!company) {
      const altMatch = snap.match(/- link "([^"]+)"[\s\S]{0,80}?\/company\//);
      if (altMatch) company = altMatch[1].trim();
    }

    if (company && company !== 'Unknown') {
      dbWrite(`UPDATE applications SET company = '${escapeSql(company)}', role = COALESCE(NULLIF(role, ''), '${escapeSql(role || '')}') WHERE id = ${app.id}`);
      console.log(`[${app.id}] ${company} - ${role || '(no role)'}`);
      fixed++;
    } else {
      console.log(`[${app.id}] could not extract company`);
    }
  } catch (e) {
    console.log(`[${app.id}] error: ${e.message.substring(0, 80)}`);
  }
}

console.log(`\nFixed ${fixed} of ${apps.length}`);
