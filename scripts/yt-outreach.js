#!/usr/bin/env node
/**
 * YouTube outreach automation.
 * For each pending YouTube contact:
 * 1. Navigate to channel /about page
 * 2. Extract contact email if available
 * 3. Leave a comment on the latest video if no email
 * 4. Update status in DB
 *
 * Usage: node scripts/yt-outreach.js [--limit N] [--lang es|en]
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getSocial } = require('./social');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const BROWSER = 'node scripts/browser.js';
const GITHUB_URL = getSocial().github_repo_url || 'https://github.com/<your-username>/<your-repo>';
const args = process.argv.slice(2);
let limit = 0;
let langFilter = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[i + 1]);
  if (args[i] === '--lang' && args[i + 1]) langFilter = args[i + 1];
}

function dbQuery(sql, write = false) {
  const flag = write ? '--write' : '';
  try {
    const escaped = sql.replace(/'/g, "'\\''");
    const result = execSync(`${BROWSER} exec eval "null" 2>/dev/null; node scripts/db.js ${flag} "${escaped}"`, {
      encoding: 'utf8',
      timeout: 30000,
      cwd: __dirname + '/..',
    });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

function dbQuerySafe(sql, write = false) {
  const flag = write ? '--write' : '';
  try {
    const result = execSync(`node scripts/db.js ${flag} "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      timeout: 30000,
      cwd: __dirname + '/..',
    });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

function evalJS(code) {
  try {
    const escaped = code.replace(/'/g, "'\\''");
    const result = execSync(`${BROWSER} exec eval '${escaped}'`, {
      encoding: 'utf8',
      timeout: 20000,
      cwd: __dirname + '/..',
    });
    const match = result.match(/### Result\n(.+)/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { return match[1].trim(); }
    }
    return null;
  } catch (e) { return null; }
}

function gotoUrl(url) {
  try {
    execSync(`${BROWSER} goto "${url}"`, {
      encoding: 'utf8',
      timeout: 30000,
      cwd: __dirname + '/..',
    });
    return true;
  } catch (e) { return false; }
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 });
}

// Extract email from YouTube channel About page
function extractEmail() {
  const code = `(function(){var links=document.querySelectorAll('a[href*="mailto:"]');if(links.length>0)return links[0].href.replace('mailto:','');var text=document.body.innerText;var match=text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);return match?match[0]:''})()`;
  return evalJS(code);
}

// Get latest video URL from channel page
function getLatestVideoUrl() {
  const code = `(function(){var links=document.querySelectorAll('a[href*="/watch?v="]');if(links.length>0)return links[0].href;return ''})()`;
  return evalJS(code);
}

// Get channel name for verification
function getChannelName() {
  const code = `(function(){var el=document.querySelector('ytd-channel-name yt-formatted-string, #channel-name, h1, [class*="channel-name"]');return el?el.textContent.trim():''})()`;
  return evalJS(code);
}

// Leave a comment on a video
function leaveComment(videoUrl, message) {
  gotoUrl(videoUrl);
  sleep(3000);

  // Find comment box
  const code = `(function(){var box=document.querySelector('#simplebox #input, #commentbox #input, ytd-comment-simplebox-renderer #input, [contenteditable=true][aria-label*="comment" i], #placeholder-area');if(box){box.click();return 'clicked'}return 'not found'})()`;
  const clickResult = evalJS(code);
  if (clickResult !== 'clicked') return 'no_comment_box';

  sleep(1000);

  // Type the comment
  const escapedMsg = message.replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const typeCode = `(function(){var box=document.querySelector('#input[contenteditable=true], [contenteditable=true][aria-label*="comment" i]');if(box){box.innerText='${escapedMsg}';box.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'}return 'no_box'})()`;
  const typeResult = evalJS(typeCode);
  if (typeResult !== 'typed') return 'type_failed';

  sleep(1000);

  // Click comment button
  const btnCode = `(function(){var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim().toLowerCase()==='comment'&&!btns[i].disabled){btns[i].click();return 'clicked'}}return 'not_found'})()`;
  const btnResult = evalJS(btnCode);
  return btnResult === 'clicked' ? 'commented' : 'no_button';
}

// Message templates
const MSG_ES = `Hola! Acabo de open source un proyecto que creo que encaja con tu canal. Se llama Job Seeker, son skills en markdown que cualquier coding agent (Devin, Claude, Cursor) consume para automatizar la busqueda laboral: busca en LinkedIn, llena Easy Apply, trackea todo en un kanban y redacta respuestas a reclutadores. Repo: ${GITHUB_URL} Si te interesa para un video me avisas, sin compromiso. Saludos!`;

const MSG_EN = `Hey! I just open sourced a project that I think fits your channel. It's called Job Seeker, markdown skills that any coding agent (Devin, Claude, Cursor) consumes to automate job searching: searches LinkedIn, fills Easy Apply forms, tracks everything in a kanban, and drafts recruiter replies. Repo: ${GITHUB_URL} If you're interested in a video let me know, no pressure. Cheers!`;

async function main() {
  // Get pending contacts
  let query = `SELECT id, name, handle, platform_url, language FROM outreach_contacts WHERE platform='youtube' AND status='pending'`;
  if (langFilter) query += ` AND language='${langFilter}'`;
  query += ` ORDER BY priority DESC, name`;
  if (limit > 0) query += ` LIMIT ${limit}`;

  const contacts = dbQuerySafe(query);
  if (!contacts || contacts.length === 0) {
    console.log('No pending YouTube contacts found.');
    return;
  }

  console.log(`Processing ${contacts.length} YouTube contacts...\n`);

  let emailed = 0;
  let commented = 0;
  let failed = 0;

  for (const contact of contacts) {
    console.log(`[${contact.id}] ${contact.name} (${contact.language}) - ${contact.platform_url}`);

    // Navigate to About page
    const aboutUrl = contact.platform_url + '/about';
    gotoUrl(aboutUrl);
    sleep(3000);

    // Try to extract email
    const email = extractEmail();
    const msg = contact.language === 'es' ? MSG_ES : MSG_EN;

    if (email && email.includes('@')) {
      console.log(`  -> Found email: ${email}`);
      // Save email and mark as contacted
      dbQuerySafe(`UPDATE outreach_contacts SET email='${email.replace(/'/g, "''")}', status='contacted', contacted_at=NOW() WHERE id=${contact.id}`, true);
      dbQuerySafe(`INSERT INTO outreach_messages (contact_id, channel, direction, subject, body, status) VALUES (${contact.id}, 'email', 'outbound', 'Open source project for your channel', '${msg.replace(/'/g, "''")}', 'draft')`, true);
      emailed++;
      console.log(`  -> Saved email, marked as contacted`);
    } else {
      // No email found, try to comment on latest video
      console.log(`  -> No email found, trying comment on latest video...`);
      gotoUrl(contact.platform_url);
      sleep(3000);
      const videoUrl = getLatestVideoUrl();
      if (videoUrl && videoUrl.includes('/watch?v=')) {
        console.log(`  -> Found latest video: ${videoUrl}`);
        const result = leaveComment(videoUrl, msg);
        if (result === 'commented') {
          dbQuerySafe(`UPDATE outreach_contacts SET status='contacted', contacted_at=NOW(), notes='Commented on latest video' WHERE id=${contact.id}`, true);
          dbQuerySafe(`INSERT INTO outreach_messages (contact_id, channel, direction, body, status, sent_at) VALUES (${contact.id}, 'youtube_comment', 'outbound', '${msg.replace(/'/g, "''")}', 'sent', NOW())`, true);
          commented++;
          console.log(`  -> Commented successfully`);
        } else {
          dbQuerySafe(`UPDATE outreach_contacts SET status='failed', notes='Comment failed: ${result}' WHERE id=${contact.id}`, true);
          failed++;
          console.log(`  -> Comment failed: ${result}`);
        }
      } else {
        dbQuerySafe(`UPDATE outreach_contacts SET status='failed', notes='No email and no video found' WHERE id=${contact.id}`, true);
        failed++;
        console.log(`  -> No video found either, marking as failed`);
      }
    }
    sleep(2000);
  }

  console.log(`\nDone! Emailed: ${emailed}, Commented: ${commented}, Failed: ${failed}`);
}

main();
