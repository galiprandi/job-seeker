#!/usr/bin/env node
/**
 * Posts remaining thread tweets as replies on X.
 * Each tweet is a reply to the previous one.
 */
const { execSync } = require('child_process');
const { getSocial } = require('./social');

const BROWSER = 'node scripts/browser.js';
const social = getSocial();
const TWITTER_HANDLE = social.twitter_handle || '<your-handle>';
const GITHUB_URL = social.github_repo_url || 'https://github.com/<your-username>/<your-repo>';
const DOCS_URL = social.docs_url || 'https://<your-username>.github.io/<your-repo>/';

function run(cmd, timeout = 20000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, cwd: __dirname + '/..' });
  } catch (e) { return e.stdout || ''; }
}

function gotoUrl(url) {
  return run(`${BROWSER} goto "${url}"`, 30000);
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 });
}

function snapshot() {
  return run(`${BROWSER} exec snapshot`, 15000);
}

function clickRef(ref) {
  return run(`${BROWSER} exec click ${ref}`, 15000);
}

function typeText(text) {
  const escaped = text.replace(/'/g, "'\\''");
  return run(`${BROWSER} exec type '${escaped}'`, 60000);
}

function findRef(snap, text, excludeDisabled = true) {
  const lines = snap.split('\n');
  for (const line of lines) {
    if (line.includes(text)) {
      if (excludeDisabled && line.includes('disabled')) continue;
      const match = line.match(/\[ref=(\w+)\]/);
      if (match) return match[1];
    }
  }
  return null;
}

function findLatestTweetUrl(snap) {
  const lines = snap.split('\n');
  const pattern = `/url: /${TWITTER_HANDLE}/status/(\\d+)`;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return 'https://x.com/' + TWITTER_HANDLE + '/status/' + match[1];
  }
  return null;
}

const remainingTweets = [
  "What it does:\n- Reads your CV, learns your preferences\n- Searches LinkedIn with your Must-have filters\n- Fills Easy Apply forms with data from your Postgres DB\n- Tracks every application in a kanban pipeline\n- Drafts recruiter replies in your writing style",
  "Your personal data never touches the repo. Everything lives in your own Neon Postgres DB. Clone, run onboarding, done. Candidate-agnostic by design.",
  "9 flows: onboarding, profile, strategy, radar, targets, news, apply, daily, memory. Strategy levels: passive, selective, active, aggressive. Pick one and all flows respect it.",
  "Browser isolation via playwright-cli. Dedicated Chrome profile. Headless by default, headed for logins/2FA. The agent never handles credentials.",
  "Anti-LLM message drafting. Recruiter replies pass a checklist: no em-dashes, no bullets in DMs, conversational tone, max 2 paragraphs, mimic your style from DB.",
  `Stack: Node.js 22+, playwright-cli, PostgreSQL (Neon), Vitest. MIT licensed. Works with any agent that reads markdown.\n\nRepo: ${GITHUB_URL}\nDocs: ${DOCS_URL}\n\nIf it's useful, give it a star.`,
];

async function main() {
  // Start from the tweet we just replied to
  let currentUrl = `https://x.com/${TWITTER_HANDLE}/status/2086269005468246155`;

  for (let i = 0; i < remainingTweets.length; i++) {
    console.log(`\n[${i + 1}/${remainingTweets.length}] Posting reply...`);

    // Navigate to current tweet
    gotoUrl(currentUrl);
    sleep(3000);

    // Find the reply textbox
    let snap = snapshot();
    let textboxRef = findRef(snap, 'Texto del post');
    if (!textboxRef) {
      textboxRef = findRef(snap, 'textbox', false);
    }

    if (!textboxRef) {
      console.log('  Could not find textbox. Trying to scroll...');
      run(`${BROWSER} exec eval "window.scrollBy(0,300)"`, 10000);
      sleep(1000);
      snap = snapshot();
      textboxRef = findRef(snap, 'Texto del post');
    }

    if (!textboxRef) {
      console.log('  Still no textbox. Skipping.');
      continue;
    }

    console.log(`  Textbox: ${textboxRef}`);
    clickRef(textboxRef);
    sleep(1000);

    // Type the tweet
    console.log(`  Typing tweet ${i + 1}...`);
    typeText(remainingTweets[i]);
    sleep(1000);

    // Find the Responder button (enabled)
    snap = snapshot();
    let replyBtnRef = findRef(snap, '"Responder"');
    if (!replyBtnRef) {
      replyBtnRef = findRef(snap, 'Responder');
    }

    if (!replyBtnRef) {
      console.log('  Could not find Responder button. Skipping.');
      continue;
    }

    console.log(`  Responder button: ${replyBtnRef}`);
    clickRef(replyBtnRef);
    sleep(4000);

    // Find the new tweet URL - navigate to our profile
    gotoUrl(`https://x.com/${TWITTER_HANDLE}`);
    sleep(3000);
    snap = snapshot();
    const newUrl = findLatestTweetUrl(snap);
    if (newUrl) {
      currentUrl = newUrl;
      console.log(`  New tweet: ${currentUrl}`);
    } else {
      console.log('  Could not find new tweet URL. Using same URL.');
    }
  }

  console.log('\nThread complete!');
}

main();
