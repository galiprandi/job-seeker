#!/usr/bin/env node
/**
 * Extracts emails from YouTube channel About pages.
 * Some channels show business emails in their About section.
 */
const { execSync } = require('child_process');

const BROWSER = 'node scripts/browser.js';

function run(cmd, timeout = 20000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, cwd: __dirname + '/..' }); }
  catch (e) { return e.stdout || ''; }
}

function gotoUrl(url) { return run(`${BROWSER} goto "${url}"`, 30000); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 }); }

function evalJS(code) {
  const e = code.replace(/'/g, "'\\''");
  const r = run(`${BROWSER} exec eval '${e}'`, 15000);
  const m = r.match(/### Result\n(.+)/);
  return m ? m[1].replace(/^"|"$/g, '') : null;
}

function dbQuery(sql) {
  try { return JSON.parse(run(`node scripts/db.js "${sql.replace(/"/g, '\\"')}"`, 15000)); }
  catch (e) { return null; }
}

function dbWrite(sql) {
  try { return run(`node scripts/db.js --write "${sql.replace(/"/g, '\\"')}"`, 15000); }
  catch (e) { return ''; }
}

async function main() {
  const contacts = dbQuery("SELECT id, name, handle, platform_url, language FROM outreach_contacts WHERE platform='youtube' AND status='pending' ORDER BY priority DESC, language");
  if (!contacts || contacts.length === 0) {
    console.log('No pending YouTube contacts.');
    return;
  }

  console.log(`Extracting emails from ${contacts.length} YouTube channels...\n`);

  let found = 0;
  let notFound = 0;

  for (const contact of contacts) {
    process.stdout.write(`[${contact.id}] ${contact.name}... `);

    // Navigate to About page
    const aboutUrl = contact.platform_url + '/about';
    gotoUrl(aboutUrl);
    sleep(3000);

    // Extract email from page text and links
    const email = evalJS("(function(){var text=document.body.innerText;var match=text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);if(match)return match[0];var links=document.querySelectorAll('a');for(var i=0;i<links.length;i++){var href=links[i].href;if(href.startsWith('mailto:')){return href.replace('mailto:','')}}return ''})()");

    if (email && email.length > 5 && !email.includes('noreply') && !email.includes('no-reply')) {
      console.log(`FOUND: ${email}`);
      dbWrite(`UPDATE outreach_contacts SET email='${email}', notes='Email found on YouTube About page' WHERE id=${contact.id}`);
      found++;
    } else {
      // Check for "View email address" button (requires captcha)
      const hasViewEmail = evalJS("(function(){var text=document.body.innerText;return text.includes('View email address')||text.includes('Ver dirección de correo')?'yes':'no'})()");
      if (hasViewEmail === 'yes') {
        console.log('has View email button (needs captcha)');
        dbWrite(`UPDATE outreach_contacts SET notes='Has View email button - needs captcha' WHERE id=${contact.id}`);
      } else {
        console.log('no email');
      }
      notFound++;
    }
  }

  console.log(`\nDone! Emails found: ${found}, Not found: ${notFound}`);
}

main();
