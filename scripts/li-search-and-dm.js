#!/usr/bin/env node
/**
 * Searches LinkedIn for each contact's real profile URL,
 * updates DB, then sends DM (if connected) or connection request with note.
 */
const { execSync } = require('child_process');
const { getSocial } = require('./social');
const GITHUB_URL = getSocial().github_repo_url || 'https://github.com/<your-username>/<your-repo>';

const BROWSER = 'node scripts/browser.js';

function run(cmd, timeout = 20000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, cwd: __dirname + '/..' }); }
  catch (e) { return e.stdout || ''; }
}

function gotoUrl(url) { return run(`${BROWSER} goto "${url}"`, 30000); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 }); }
function clickRef(ref) { return run(`${BROWSER} exec click ${ref}`, 15000); }
function typeText(text) { const e = text.replace(/'/g, "'\\''"); return run(`${BROWSER} exec type '${e}'`, 120000); }
function pressKey(key) { return run(`${BROWSER} exec press ${key}`, 10000); }
function snapshot() { return run(`${BROWSER} exec snapshot`, 15000); }

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

// Extract first real profile URL from search results
function extractProfileUrl() {
  return evalJS("(function(){var links=document.querySelectorAll('a[href*=\"/in/\"]');for(var i=0;i<links.length;i++){var m=links[i].href.match(/linkedin\\.com\\/in\\/[^/]+\\/?/);if(m)return m[0]}return ''})()");
}

// Check if profile has Message button (is connection)
function checkHasMessage() {
  return evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');return l?'yes':'no'})()");
}

// Get recipient ID from message link
function getRecipientId() {
  return evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');if(l){var m=l.href.match(/recipient=([^&]+)/);return m?m[1]:''}return ''})()");
}

const MSG_ES = `Hola! Te escribo porque lance un proyecto open source que creo que encaja con tu contenido. Se llama Job Seeker, son skills en markdown que cualquier coding agent (Devin, Claude, Cursor, opencode) consume para automatizar la busqueda laboral: busca en LinkedIn, llena Easy Apply, trackea todo en un kanban y redacta respuestas a reclutadores. Repo: ${GITHUB_URL} Si te interesa para tu canal me avisas, sin compromiso. Saludos!`;
const MSG_EN = `Hey! I'm reaching out because I just open sourced a project that I think fits your content. It's called Job Seeker, markdown skills that any coding agent (Devin, Claude, Cursor, opencode) consumes to automate job searching: searches LinkedIn, fills Easy Apply forms, tracks everything in a kanban, and drafts recruiter replies. Repo: ${GITHUB_URL} If you're interested for your channel let me know, no pressure. Cheers!`;
const SUBJECT_ES = "Proyecto open source para tu canal";
const SUBJECT_EN = "Open source project for your channel";
const NOTE_ES = `Hola! Vi tu contenido y me parecio genial. Lance un proyecto open source llamado Job Seeker que automatiza la busqueda laboral con AI agents. Me encantaria conectar. Repo: ${GITHUB_URL}`;
const NOTE_EN = `Hey! Love your content. I just open sourced Job Seeker, a tool that automates job searching with AI agents. Would love to connect. Repo: ${GITHUB_URL}`;

async function main() {
  // Get all pending and needs_connection LinkedIn contacts
  const contacts = dbQuery("SELECT id, name, platform_url, language FROM outreach_contacts WHERE platform='linkedin' AND status IN ('pending','needs_connection') AND category IN ('streamer','creator','ai-builder') ORDER BY priority DESC, language");
  if (!contacts || contacts.length === 0) {
    console.log('No contacts to process.');
    return;
  }

  console.log(`Processing ${contacts.length} LinkedIn contacts...\n`);

  let sent = 0;
  let connected = 0;
  let failed = 0;

  for (const contact of contacts) {
    // Extract search name from contact name (remove "(LinkedIn)" suffix)
    const searchName = contact.name.replace(/\s*\(LinkedIn\)\s*/g, '').trim();
    process.stdout.write(`[${contact.id}] ${searchName}... `);

    // Step 1: Search LinkedIn for the real profile
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchName)}`;
    gotoUrl(searchUrl);
    sleep(3000);

    const profileUrl = extractProfileUrl();
    if (!profileUrl || profileUrl.length < 10) {
      console.log('profile not found');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='Profile not found in search' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    // Update DB with real URL
    dbWrite(`UPDATE outreach_contacts SET platform_url='${profileUrl}' WHERE id=${contact.id}`);

    // Step 2: Navigate to the real profile
    gotoUrl(profileUrl);
    sleep(3000);

    // Step 3: Check if we can message (is connection) or need to connect
    const hasMessage = checkHasMessage();

    if (hasMessage === 'yes') {
      // Can send DM directly
      const recipientId = getRecipientId();
      if (!recipientId || recipientId.length < 5) {
        console.log('no recipient ID');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No recipient ID' WHERE id=${contact.id}`);
        failed++;
        continue;
      }

      // Navigate to compose
      const composeUrl = `https://www.linkedin.com/messaging/compose/?recipient=${recipientId}&screenContext=NON_SELF_PROFILE_VIEW&interop=msgOverlay`;
      gotoUrl(composeUrl);
      sleep(2000);

      // Find subject and message textboxes
      const snap = snapshot();
      const subjectRef = findRef(snap, '"Subject (optional)"');
      const textboxRef = findRef(snap, '"Write a message');

      if (!textboxRef) {
        console.log('no textbox');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No textbox' WHERE id=${contact.id}`);
        failed++;
        continue;
      }

      const msg = contact.language === 'es' ? MSG_ES : MSG_EN;
      const subject = contact.language === 'es' ? SUBJECT_ES : SUBJECT_EN;

      // Fill subject
      if (subjectRef) {
        clickRef(subjectRef);
        sleep(300);
        typeText(subject);
        sleep(300);
      }

      // Fill message and send
      clickRef(textboxRef);
      sleep(500);
      typeText(msg);
      sleep(500);
      pressKey('Enter');
      sleep(2000);

      dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW() WHERE id=${contact.id}`);
      dbWrite(`INSERT INTO outreach_messages (contact_id, channel, direction, subject, body, status, sent_at) VALUES (${contact.id}, 'linkedin_dm', 'outbound', '${subject.replace(/'/g, "''")}', '${msg.replace(/'/g, "''")}', 'sent', NOW())`);
      console.log('DM SENT');
      sent++;
    } else {
      // Not a connection - send connection request with note
      const snap = snapshot();
      const connectRef = findRef(snap, '"Connect"');

      if (!connectRef) {
        console.log('no connect button');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No connect button' WHERE id=${contact.id}`);
        failed++;
        continue;
      }

      clickRef(connectRef);
      sleep(2000);

      // Look for "Add a note" button in the connect dialog
      const snap2 = snapshot();
      const addNoteRef = findRef(snap2, '"Add a note"');

      if (addNoteRef) {
        clickRef(addNoteRef);
        sleep(1000);

        // Find the note textbox
        const snap3 = snapshot();
        const noteRef = findRef(snap3, '"Add a personalized note"') || findRef(snap3, 'textbox');

        if (noteRef) {
          clickRef(noteRef);
          sleep(300);
          const note = contact.language === 'es' ? NOTE_ES : NOTE_EN;
          typeText(note);
          sleep(500);
        }
      }

      // Click Send/connect button
      const snap4 = snapshot();
      const sendRef = findRef(snap4, '"Send"') || findRef(snap4, '"Connect now"') || findRef(snap4, '"Add"');

      if (sendRef) {
        clickRef(sendRef);
        sleep(2000);
        dbWrite(`UPDATE outreach_contacts SET status='connection_sent', contacted_at=NOW() WHERE id=${contact.id}`);
        console.log('CONNECT REQUEST SENT');
        connected++;
      } else {
        console.log('no send button in connect dialog');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No send button in connect dialog' WHERE id=${contact.id}`);
        failed++;
      }
    }

    sleep(2000);
  }

  console.log(`\nDone! DMs sent: ${sent}, Connection requests: ${connected}, Failed: ${failed}`);
}

main();
