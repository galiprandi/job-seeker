#!/usr/bin/env node
/**
 * LinkedIn outreach: sends DMs to connections, connection requests with notes to non-connections.
 * Verifies each step. Clicks Send button explicitly.
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
function snapshot() { return run(`${BROWSER} exec snapshot`, 15000); }
function pressKey(key) { return run(`${BROWSER} exec press ${key}`, 10000); }

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

function ensureBrowser() {
  // Check if browser is alive by trying a simple command
  const result = run(`${BROWSER} exec eval "1"`, 10000);
  if (result.includes('No active session') || result.includes('unresponsive') || result.includes('Run') || result.includes('Error')) {
    console.log('  [browser died, reopening...]');
    run(`${BROWSER} open "https://www.linkedin.com/feed/" --headed`, 30000);
    sleep(3000);
    return false;
  }
  return true;
}

function findRef(snap, text, mustBeEnabled = true) {
  const lines = snap.split('\n');
  for (const line of lines) {
    if (line.includes(text)) {
      if (mustBeEnabled && line.includes('disabled')) continue;
      const match = line.match(/\[ref=(\w+)\]/);
      if (match) return match[1];
    }
  }
  return null;
}

function findAllRefs(snap, text) {
  const refs = [];
  const lines = snap.split('\n');
  for (const line of lines) {
    if (line.includes(text) && !line.includes('disabled')) {
      const match = line.match(/\[ref=(\w+)\]/);
      if (match) refs.push(match[1]);
    }
  }
  return refs;
}

const MSG_ES = `Hola! Te escribo porque lance un proyecto open source que creo que encaja con tu contenido. Se llama Job Seeker, son skills en markdown que cualquier coding agent (Devin, Claude, Cursor, opencode) consume para automatizar la busqueda laboral: busca en LinkedIn, llena Easy Apply, trackea todo en un kanban y redacta respuestas a reclutadores. Repo: ${GITHUB_URL} Si te interesa para tu canal me avisas, sin compromiso. Saludos!`;
const MSG_EN = `Hey! I'm reaching out because I just open sourced a project that I think fits your content. It's called Job Seeker, markdown skills that any coding agent (Devin, Claude, Cursor, opencode) consumes to automate job searching: searches LinkedIn, fills Easy Apply forms, tracks everything in a kanban, and drafts recruiter replies. Repo: ${GITHUB_URL} If you're interested for your channel let me know, no pressure. Cheers!`;
const SUBJECT_ES = "Proyecto open source para tu canal";
const SUBJECT_EN = "Open source project for your channel";
const NOTE_ES = `Hola! Vi tu contenido y me parecio genial. Lance un proyecto open source llamado Job Seeker que automatiza la busqueda laboral con AI agents. Me encantaria conectar. Repo: ${GITHUB_URL}`;
const NOTE_EN = `Hey! Love your content. I just open sourced Job Seeker, a tool that automates job searching with AI agents. Would love to connect. Repo: ${GITHUB_URL}`;

// Search terms for each contact (real names for LinkedIn search)
const SEARCH_NAMES = {
  37: "Brais Moure",
  38: "Carlos Azaustre",
  39: "Fernanda Ochoa",
  40: "Nicolas Schurmann",
  75: "Quincy Larson",
  89: "Simon Willison",
  91: "Swyx Shawn Wang",
  94: "AI Jason",
  95: "Matt Wolfe",
  96: "Nicholas Renotte",
  97: "Tech With Tim",
  98: "Traversy Media Brad Traversy",
  99: "Fireship Jeff Delaney",
  100: "ThePrimeagen",
  101: "Theo t3.gg",
  149: "Guillermo Rauch",
  151: "Lee Robinson",
};

async function main() {
  const contacts = dbQuery("SELECT id, name, platform_url, language FROM outreach_contacts WHERE platform='linkedin' AND status='pending' AND category IN ('streamer','creator','ai-builder') AND id != 36 ORDER BY priority DESC, language");
  if (!contacts || contacts.length === 0) {
    console.log('No pending contacts.');
    return;
  }

  console.log(`Processing ${contacts.length} contacts...\n`);

  let dmSent = 0;
  let connectSent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const searchName = SEARCH_NAMES[contact.id] || contact.name.replace(/\s*\(LinkedIn\)\s*/g, '').trim();
    process.stdout.write(`[${contact.id}] ${searchName}... `);

    // Ensure browser is alive before each contact
    ensureBrowser();

    // Step 1: Search LinkedIn for real profile
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchName)}`;
    gotoUrl(searchUrl);
    sleep(3000);

    // Extract first profile URL from results
    const profileUrl = evalJS("(function(){var links=document.querySelectorAll('a[href*=\"/in/\"]');for(var i=0;i<links.length;i++){var m=links[i].href.match(/linkedin\\.com\\/in\\/[^\"?#]+/);if(m)return m[0]}return ''})()");

    if (!profileUrl || profileUrl.length < 15) {
      console.log('NOT FOUND in search');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='Profile not found in LinkedIn search' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    // Update DB with real URL
    dbWrite(`UPDATE outreach_contacts SET platform_url='${profileUrl}' WHERE id=${contact.id}`);

    // Step 2: Navigate to profile
    gotoUrl(profileUrl);
    sleep(3000);

    // Step 3: Check if Message link exists (is connection)
    const hasMessage = evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');return l?'yes':'no'})()");

    if (hasMessage === 'yes') {
      // === IS CONNECTION: Send DM ===
      // Get compose URL
      const composeHref = evalJS("(function(){var l=document.querySelector('a[href*=\"messaging/compose\"]');return l?l.href:''})()");
      if (!composeHref) {
        console.log('no compose URL');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No compose URL' WHERE id=${contact.id}`);
        failed++;
        continue;
      }

      // Navigate to compose page (full page, not overlay)
      gotoUrl(composeHref);
      sleep(4000);

      // Dismiss Premium popup if present
      let snap = snapshot();
      let dismissRef = findRef(snap, '"Dismiss"');
      if (dismissRef) {
        clickRef(dismissRef);
        sleep(2000);
        snap = snapshot();
      }

      // Find subject and message textboxes
      let subjectRef = findRef(snap, '"Subject (optional)"');
      let textboxRef = findRef(snap, '"Write a message');

      // If not found, try waiting more
      if (!textboxRef) {
        sleep(3000);
        snap = snapshot();
        subjectRef = findRef(snap, '"Subject (optional)"');
        textboxRef = findRef(snap, '"Write a message');
      }

      if (!textboxRef) {
        console.log('no textbox (maybe needs Premium)');
        dbWrite(`UPDATE outreach_contacts SET status='needs_premium', notes='No textbox - may need Premium' WHERE id=${contact.id}`);
        failed++;
        continue;
      }

      const msg = contact.language === 'es' ? MSG_ES : MSG_EN;
      const subject = contact.language === 'es' ? SUBJECT_ES : SUBJECT_EN;

      // Fill subject
      if (subjectRef) {
        clickRef(subjectRef);
        sleep(500);
        typeText(subject);
        sleep(500);
      }

      // Fill message body
      clickRef(textboxRef);
      sleep(500);
      typeText(msg);
      sleep(1000);

      // Find and click Send button
      snap = snapshot();
      // Look for Send button that's not disabled
      const sendRefs = findAllRefs(snap, '"Send"');
      // Also try "send" in the message area
      let sendRef = null;
      for (const ref of sendRefs) {
        sendRef = ref;
        break;
      }
      if (!sendRef) {
        // Try pressing Enter as fallback
        pressKey('Enter');
        sleep(2000);
      } else {
        clickRef(sendRef);
        sleep(3000);
      }

      // Verify: check if message appears in conversation
      snap = snapshot();
      if (snap.includes(msg.substring(0, 40))) {
        console.log('DM SENT');
        dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW() WHERE id=${contact.id}`);
        dmSent++;
      } else {
        // Try Enter as fallback
        pressKey('Enter');
        sleep(2000);
        snap = snapshot();
        if (snap.includes(msg.substring(0, 40))) {
          console.log('DM SENT (via Enter)');
          dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW() WHERE id=${contact.id}`);
          dmSent++;
        } else {
          console.log('SEND FAILED - could not verify');
          dbWrite(`UPDATE outreach_contacts SET status='failed', notes='Could not verify DM send' WHERE id=${contact.id}`);
          failed++;
        }
      }
    } else {
      // === NOT CONNECTION: Send connection request with note ===
      let snap = snapshot();
      let connectRef = findRef(snap, '"Connect"');

      if (!connectRef) {
        // Maybe already pending or following
        console.log('no Connect button');
        dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No Connect button' WHERE id=${contact.id}`);
        failed++;
        continue;
      }

      clickRef(connectRef);
      sleep(2000);

      // Look for "Add a note" button in dialog
      snap = snapshot();
      let addNoteRef = findRef(snap, '"Add a note"');

      if (addNoteRef) {
        clickRef(addNoteRef);
        sleep(1500);

        // Find the note textarea
        snap = snapshot();
        let noteRef = findRef(snap, '"Add a personalized note"') || findRef(snap, 'textbox');

        if (noteRef) {
          clickRef(noteRef);
          sleep(500);
          const note = contact.language === 'es' ? NOTE_ES : NOTE_EN;
          typeText(note);
          sleep(1000);
        }
      }

      // Find and click Send/Connect button
      snap = snapshot();
      let sendBtnRef = findRef(snap, '"Send"') || findRef(snap, '"Connect now"') || findRef(snap, '"Add connection"') || findRef(snap, '"Done"');

      if (sendBtnRef) {
        clickRef(sendBtnRef);
        sleep(2000);
        console.log('CONNECT REQUEST SENT');
        dbWrite(`UPDATE outreach_contacts SET status='connection_sent', contacted_at=NOW() WHERE id=${contact.id}`);
        connectSent++;
      } else {
        // Try pressing Enter
        pressKey('Enter');
        sleep(2000);
        console.log('CONNECT REQUEST (via Enter)');
        dbWrite(`UPDATE outreach_contacts SET status='connection_sent', contacted_at=NOW() WHERE id=${contact.id}`);
        connectSent++;
      }
    }

    sleep(2000);
  }

  console.log(`\nDone! DMs: ${dmSent}, Connection requests: ${connectSent}, Failed: ${failed}`);
}

main();
