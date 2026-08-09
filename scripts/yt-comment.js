#!/usr/bin/env node
/**
 * YouTube comment outreach: navigates to each channel's latest video,
 * scrolls to comments, clicks "Add a comment", types and submits.
 * Uses the validated manual flow: scroll to #comments, wait, find textbox after avatar.
 */
const { execSync } = require('child_process');
const { getSocial } = require('./social');

const BROWSER = 'node scripts/browser.js';
const social = getSocial();
const FULL_NAME = social.full_name || '<Your Name>';
const GITHUB_URL = social.github_repo_url || 'https://github.com/<your-username>/<your-repo>';
const YT_HANDLE = social.youtube_handle || '<your-handle>';

function run(cmd, timeout = 20000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, cwd: __dirname + '/..' }); }
  catch (e) { return e.stdout || ''; }
}

function gotoUrl(url) { return run(`${BROWSER} goto "${url}"`, 30000); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 }); }
function clickRef(ref) { return run(`${BROWSER} exec click ${ref}`, 15000); }
function typeText(text) { const e = text.replace(/'/g, "'\\''"); return run(`${BROWSER} exec type '${e}'`, 60000); }
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

function ensureBrowser() {
  const result = run(`${BROWSER} exec eval "1"`, 8000);
  if (result.includes('No active session') || result.includes('unresponsive') || result.includes('Error') || result.includes('Run')) {
    console.log('  [browser died, reopening...]');
    run(`${BROWSER} close`, 5000); // cleanup zombie
    sleep(2000);
    run(`${BROWSER} open "https://www.youtube.com" --headed`, 30000);
    sleep(5000);
  }
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

// Find the comment textbox: it's the textbox right after the user's avatar img
function findCommentTextbox(snap) {
  const lines = snap.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(FULL_NAME) && lines[i].includes('img')) {
      // Look for textbox in next 3 lines
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j].includes('textbox')) {
          const match = lines[j].match(/\[ref=(\w+)\]/);
          if (match) return match[1];
        }
      }
    }
  }
  return null;
}

// Find the Comentar/Comment button (enabled, not disabled)
function findCommentButton(snap) {
  const lines = snap.split('\n');
  for (const line of lines) {
    if ((line.includes('Comentar') || line.includes('"Comment"')) && line.includes('button') && !line.includes('disabled')) {
      const match = line.match(/\[ref=(\w+)\]/);
      if (match) return match[1];
    }
  }
  return null;
}

// Comment templates
const COMMENT_EN = `Great content! I built an open source tool that lets your AI coding agent (Devin, Claude, Cursor) search, filter and apply to jobs for you. It's called Job Seeker, markdown skills that automate the whole job search end to end. Would love your thoughts: ${GITHUB_URL}`;
const COMMENT_ES = `Excelente contenido! Cree una herramienta open source que deja que tu agente de IA (Devin, Claude, Cursor) busque, filtre y aplique a empleos por vos. Se llama Job Seeker, skills en markdown que automatizan toda la busqueda laboral. Me encantaria saber que pensas: ${GITHUB_URL}`;

async function main() {
  const contacts = dbQuery("SELECT id, name, handle, platform_url, language FROM outreach_contacts WHERE platform='youtube' AND status='pending' ORDER BY priority DESC, language");
  if (!contacts || contacts.length === 0) {
    console.log('No pending YouTube contacts.');
    return;
  }

  console.log(`Processing ${contacts.length} YouTube channels...\n`);

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    process.stdout.write(`[${contact.id}] ${contact.name}... `);

    ensureBrowser();

    // Step 1: Navigate to channel videos page
    const videosUrl = contact.platform_url + '/videos';
    gotoUrl(videosUrl);
    sleep(3000);

    // Step 2: Extract first video URL
    const videoUrl = evalJS("(function(){var links=document.querySelectorAll('a[href*=\"/watch?v=\"]');for(var i=0;i<links.length;i++){var m=links[i].href.match(/watch\\?v=[^&]+/);if(m)return 'https://www.youtube.com/'+m[0]}return ''})()");

    if (!videoUrl || videoUrl.length < 20) {
      console.log('no video found');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No video found on channel' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    // Step 3: Navigate to the video
    gotoUrl(videoUrl);
    sleep(4000);

    // Step 4: Scroll to comments section and wait for them to load
    evalJS("document.querySelector('#comments')?.scrollIntoView()");
    sleep(7000);

    // Step 5: Find the comment textbox (after user's avatar)
    let snap = snapshot();
    let textboxRef = findCommentTextbox(snap);

    if (!textboxRef) {
      // Wait more and retry
      sleep(5000);
      snap = snapshot();
      textboxRef = findCommentTextbox(snap);
    }

    if (!textboxRef) {
      console.log('no comment textbox');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No comment textbox found' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    // Step 6: Click textbox and type comment
    clickRef(textboxRef);
    sleep(1500);

    const comment = contact.language === 'es' ? COMMENT_ES : COMMENT_EN;
    typeText(comment);
    sleep(1500);

    // Step 7: Find and click Comment button
    snap = snapshot();
    let btnRef = findCommentButton(snap);

    if (!btnRef) {
      console.log('no comment button');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='No comment button found' WHERE id=${contact.id}`);
      failed++;
      continue;
    }

    clickRef(btnRef);
    sleep(3000);

    // Step 8: Verify comment was posted
    snap = snapshot();
    if (snap.includes(YT_HANDLE) && snap.includes(comment.substring(0, 20))) {
      console.log('COMMENTED');
      dbWrite(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW() WHERE id=${contact.id}`);
      sent++;
    } else {
      console.log('FAILED to verify');
      dbWrite(`UPDATE outreach_contacts SET status='failed', notes='Comment not verified after submit' WHERE id=${contact.id}`);
      failed++;
    }

    sleep(2000);
  }

  console.log(`\nDone! Comments posted: ${sent}, Failed: ${failed}`);
}

main();
