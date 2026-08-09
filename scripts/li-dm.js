#!/usr/bin/env node
/**
 * Sends LinkedIn DMs to outreach contacts.
 * Navigates to each profile, clicks Message, types and sends.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getSocial } = require('./social');
const GITHUB_URL = getSocial().github_repo_url || 'https://github.com/<your-username>/<your-repo>';

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const BROWSER = 'node scripts/browser.js';

function run(cmd, timeout = 20000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, cwd: __dirname + '/..' }); }
  catch (e) { return e.stdout || ''; }
}

function gotoUrl(url) { return run(`${BROWSER} goto "${url}"`, 30000); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 }); }
function snapshot() { return run(`${BROWSER} exec snapshot`, 15000); }
function clickRef(ref) { return run(`${BROWSER} exec click ${ref}`, 15000); }
function typeText(text) { const e = text.replace(/'/g, "'\\''"); return run(`${BROWSER} exec type '${e}'`, 120000); }
function pressKey(key) { return run(`${BROWSER} exec press ${key}`, 10000); }
function evalJS(code) { const e = code.replace(/'/g, "'\\''"); const r = run(`${BROWSER} exec eval '${e}'`, 15000); const m = r.match(/### Result\n(.+)/); return m ? m[1].trim() : null; }

function dbQuery(sql) {
  try { return JSON.parse(run(`node scripts/db.js "${sql.replace(/"/g, '\\"')}"`, 15000)); }
  catch (e) { return null; }
}

function dbWrite(sql) {
  try { return JSON.parse(run(`node scripts/db.js --write "${sql.replace(/"/g, '\\"')}"`, 15000)); }
  catch (e) { return null; }
}

function findRef(snap, text) {
  const lines = snap.split('\n');
  for (const line of lines) {
    if (line.includes(text) && !line.includes('disabled')) {
      const match = line.match(/\[ref=(\w+)\]/);
      if (match) return match[1];
    }
  }
  return null;
}

const MSG_ES = `Hola! Te escribo porque lance un proyecto open source que creo que encaja con tu contenido. Se llama Job Seeker, son skills en markdown que cualquier coding agent (Devin, Claude, Cursor, opencode) consume para automatizar la busqueda laboral: busca en LinkedIn, llena Easy Apply, trackea todo en un kanban y redacta respuestas a reclutadores. Repo: ${GITHUB_URL} Si te interesa para tu canal me avisas, sin compromiso. Saludos!`;

const MSG_EN = `Hey! I'm reaching out because I just open sourced a project that I think fits your content. It's called Job Seeker, markdown skills that any coding agent (Devin, Claude, Cursor, opencode) consumes to automate job searching: searches LinkedIn, fills Easy Apply forms, tracks everything in a kanban, and drafts recruiter replies. Repo: ${GITHUB_URL} If you're interested for your channel let me know, no pressure. Cheers!`;

async function main() {
  const contacts = dbQuery("SELECT id, name, platform_url, language FROM outreach_contacts WHERE platform='linkedin' AND status='pending' AND category IN ('streamer','creator','ai-builder') ORDER BY priority DESC, language");
  if (!contacts || contacts.length === 0) {
    console.log('No pending LinkedIn contacts.');
    return;
  }

  console.log(`Processing ${contacts.length} LinkedIn contacts...\n`);

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    console.log(`[${contact.id}] ${contact.name} (${contact.language})`);

    // Navigate to profile
    gotoUrl(contact.platform_url);
    sleep(3000);

    // Find and click Message link
    let snap = snapshot();
    let msgRef = findRef(snap, '"Message"');
    if (!msgRef) msgRef = findRef(snap, 'link "Message"');

    if (!msgRef) {
      // Try to navigate directly to compose URL
      const composeUrl = evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');return l?l.href:''})()");
      if (composeUrl && composeUrl.includes('messaging/compose')) {
        gotoUrl(composeUrl);
        sleep(3000);
      } else {
        console.log('  -> No Message button found. Skipping.');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No message button' WHERE id=${contact.id}`);
        failed++;
        continue;
      }
    } else {
      // Click the message link via eval (to avoid overlay issues)
      evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');if(l)window.location.href=l.href;return l?'navigated':'not found'})()");
      sleep(3000);
    }

    // Find the message textbox
    snap = snapshot();
    let textboxRef = findRef(snap, '"Write a message');
    if (!textboxRef) textboxRef = findRef(snap, 'Write a message');

    if (!textboxRef) {
      console.log('  -> No message textbox found. Skipping.');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No textbox' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    // Click and type
    clickRef(textboxRef);
    sleep(1000);

    const msg = contact.language === 'es' ? MSG_ES : MSG_EN;
    typeText(msg);
    sleep(1000);

    // Press Enter to send
    pressKey('Enter');
    sleep(3000);

    // Verify message was sent
    snap = snapshot();
    if (snap.includes(msg.substring(0, 50))) {
      console.log('  -> Message sent!');
      dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW() WHERE id=${contact.id}`);
      dbWrite(`INSERT INTO outreach_messages (contact_id, channel, direction, body, status, sent_at) VALUES (${contact.id}, 'linkedin_dm', 'outbound', '${msg.replace(/'/g, "''")}', 'sent', NOW())`);
      sent++;
    } else {
      console.log('  -> Could not verify send. Marking as attempted.');
      dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW(), notes='Send attempted but not verified' WHERE id=${contact.id}`);
      sent++;
    }

    sleep(2000);
  }

  console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
}

main();
