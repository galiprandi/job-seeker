#!/usr/bin/env node
/**
 * Fast LinkedIn DM sender.
 * Optimized: one eval per profile to get recipient ID, direct compose URL, reuse textbox ref.
 */
const { execSync } = require('child_process');
const { getSocial } = require('./social');
const GITHUB_URL = getSocial().github_repo_url || 'https://github.com/<your-username>/<your-repo>';

const BROWSER = 'node scripts/browser.js';

function run(cmd, timeout = 20000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, cwd: __dirname + '/..' }); }
  catch (e) { return e.stdout || e.message; }
}

function gotoUrl(url) { return run(`${BROWSER} goto "${url}"`, 30000); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 }); }
function clickRef(ref) { return run(`${BROWSER} exec click ${ref}`, 15000); }
function typeText(text) { const e = text.replace(/'/g, "'\\''"); return run(`${BROWSER} exec type '${e}'`, 120000); }
function pressKey(key) { return run(`${BROWSER} exec press ${key}`, 10000); }

function evalJS(code) {
  const e = code.replace(/'/g, "'\\''");
  const r = run(`${BROWSER} exec eval '${e}'`, 15000);
  const m = r.match(/### Result\n(.+)/);
  return m ? m[1].replace(/^"|"$/g, '') : null;
}

function snapshot() { return run(`${BROWSER} exec snapshot`, 15000); }

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
    process.stdout.write(`[${contact.id}] ${contact.name}... `);

    // Step 1: Navigate to profile and extract recipient ID in one shot
    gotoUrl(contact.platform_url);
    sleep(2000);

    const recipientId = evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');if(l){var m=l.href.match(/recipient=([^&]+)/);return m?m[1]:''}return ''})()");

    if (!recipientId || recipientId.length < 5) {
      // Not a connection, can't send DM. Mark as needs_connection.
      dbWrite(`UPDATE outreach_contacts SET status='needs_connection', notes='Not a connection, cannot DM' WHERE id=${contact.id}`);
      console.log('needs connection (not connected)');
      failed++;
      continue;
    }

    // Step 2: Navigate directly to compose URL
    const composeUrl = `https://www.linkedin.com/messaging/compose/?recipient=${recipientId}&screenContext=NON_SELF_PROFILE_VIEW&interop=msgOverlay`;
    gotoUrl(composeUrl);
    sleep(2000);

    // Step 3: One snapshot to find both subject and message textbox refs
    const snap = snapshot();
    const subjectRef = findRef(snap, '"Subject (optional)"');
    const textboxRef = findRef(snap, '"Write a message');

    if (!textboxRef) {
      console.log('no textbox found');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No textbox on compose page' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    const msg = contact.language === 'es' ? MSG_ES : MSG_EN;
    const subject = contact.language === 'es' ? 'Proyecto open source para tu canal' : 'Open source project for your channel';

    // Step 4: Fill subject first (if available)
    if (subjectRef) {
      clickRef(subjectRef);
      sleep(300);
      typeText(subject);
      sleep(300);
    }

    // Step 5: Click message body, type, send
    clickRef(textboxRef);
    sleep(500);
    typeText(msg);
    sleep(500);
    pressKey('Enter');
    sleep(2000);

    // Step 5: Mark as sent
    dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW() WHERE id=${contact.id}`);
    dbWrite(`INSERT INTO outreach_messages (contact_id, channel, direction, body, status, sent_at) VALUES (${contact.id}, 'linkedin_dm', 'outbound', '${msg.replace(/'/g, "''")}', 'sent', NOW())`);
    console.log('SENT');
    sent++;
  }

  console.log(`\nDone! Sent: ${sent}, Failed/Needs connection: ${failed}`);
}

main();
