#!/usr/bin/env node
/**
 * Posts a thread on X/Twitter by replying to each previous tweet.
 * Usage: node scripts/x-thread.js
 */
const { execSync } = require('child_process');
const { getSocial } = require('./social');

const BROWSER = 'node scripts/browser.js';
const social = getSocial();
const TWITTER_HANDLE = social.twitter_handle || '<your-handle>';
const GITHUB_URL = social.github_repo_url || 'https://github.com/<your-username>/<your-repo>';
const DOCS_URL = social.docs_url || 'https://<your-username>.github.io/<your-repo>/';

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
    execSync(`${BROWSER} goto "${url}"`, { encoding: 'utf8', timeout: 30000, cwd: __dirname + '/..' });
    return true;
  } catch (e) { return false; }
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 });
}

function snapshot() {
  try {
    return execSync(`${BROWSER} exec snapshot`, { encoding: 'utf8', timeout: 15000, cwd: __dirname + '/..' });
  } catch (e) { return ''; }
}

function clickRef(ref) {
  try {
    execSync(`${BROWSER} exec click ${ref}`, { encoding: 'utf8', timeout: 15000, cwd: __dirname + '/..' });
    return true;
  } catch (e) { return false; }
}

function typeText(text) {
  try {
    execSync(`${BROWSER} exec type "${text.replace(/"/g, '\\"').replace(/'/g, "'\\''")}"`, {
      encoding: 'utf8',
      timeout: 60000,
      cwd: __dirname + '/..',
    });
    return true;
  } catch (e) { return false; }
}

function findRefByText(text, snap) {
  const lines = snap.split('\n');
  for (const line of lines) {
    if (line.includes(text)) {
      const match = line.match(/\[ref=(\w+)\]/);
      if (match) return match[1];
    }
  }
  return null;
}

function findTweetUrl(text, snap) {
  const lines = snap.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(text)) {
      // Look for nearby URL
      for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 20); j++) {
        const urlMatch = lines[j].match(/\/url: (\/[^ ]+\/status\/\d+)/);
        if (urlMatch) return 'https://x.com' + urlMatch[1];
      }
    }
  }
  return null;
}

const threadTweets = [
  "Job Seeker is a set of markdown skills that any coding agent (Devin, Claude, Cursor, opencode) consumes to automate your job search.\n\nNot a SaaS. Not a Chrome extension. Skills your agent reads and executes.",
  "What it does:\n- Reads your CV, learns your preferences\n- Searches LinkedIn with your Must-have filters\n- Fills Easy Apply forms with data from your Postgres DB\n- Tracks every application in a kanban pipeline\n- Drafts recruiter replies in your writing style",
  "Your personal data never touches the repo. Everything lives in your own Neon Postgres DB. Clone, run onboarding, done.\n\nCandidate-agnostic by design.",
  "9 flows:\nonboarding, profile, strategy, radar, targets, news, apply, daily, memory\n\nStrategy levels: passive, selective, active, aggressive. Pick one and all flows respect it.",
  "Browser isolation via playwright-cli. Dedicated Chrome profile. Headless by default, headed for logins/2FA. The agent never handles credentials.",
  "Anti-LLM message drafting. Recruiter replies pass a checklist: no em-dashes, no bullets in DMs, conversational tone, max 2 paragraphs, mimic your style from DB.",
  `Stack: Node.js 22+, playwright-cli, PostgreSQL (Neon), Vitest\n\nMIT licensed. Works with any agent that reads markdown.\n\nRepo: ${GITHUB_URL}\nDocs: ${DOCS_URL}\n\nIf it's useful, give it a star.`,
];

async function main() {
  // Find the first tweet URL
  gotoUrl(`https://x.com/${TWITTER_HANDLE}`);
  sleep(3000);
  const snap = snapshot();

  // Find the tweet with "Job Seeker. Thread."
  let tweetUrl = null;
  const lines = snap.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Job Seeker. Thread.")) {
      for (let j = i; j < Math.min(lines.length, i + 30); j++) {
        const urlMatch = lines[j].match(new RegExp('/url: /' + TWITTER_HANDLE + '/status/(\\d+)'));
        if (urlMatch) {
          tweetUrl = 'https://x.com' + urlMatch[1];
          break;
        }
      }
    }
  }

  if (!tweetUrl) {
    console.log('Could not find first tweet URL. Aborting.');
    return;
  }

  console.log(`Found first tweet: ${tweetUrl}`);

  let currentUrl = tweetUrl;
  for (let i = 0; i < threadTweets.length; i++) {
    console.log(`\nPosting tweet ${i + 2}/${threadTweets.length + 1}...`);

    // Navigate to the tweet
    gotoUrl(currentUrl);
    sleep(3000);

    // Find the reply textbox
    let snap = snapshot();
    let replyRef = null;
    const snapLines = snap.split('\n');
    for (const line of snapLines) {
      if (line.includes('textbox') && line.includes('Postear') === false) {
        const match = line.match(/\[ref=(\w+)\]/);
        if (match) {
          replyRef = match[1];
          break;
        }
      }
    }

    // Try to find reply box by looking for "Postear" nearby
    if (!replyRef) {
      for (let j = 0; j < snapLines.length; j++) {
        if (snapLines[j].includes('textbox') && !snapLines[j].includes('Search') && !snapLines[j].includes('Buscar')) {
          const match = snapLines[j].match(/\[ref=(\w+)\]/);
          if (match) {
            replyRef = match[1];
            break;
          }
        }
      }
    }

    if (!replyRef) {
      console.log(`  Could not find reply textbox. Skipping.`);
      continue;
    }

    console.log(`  Found reply textbox: ${replyRef}`);
    clickRef(replyRef);
    sleep(1000);
    typeText(threadTweets[i]);
    sleep(1000);

    // Find Postear button
    snap = snapshot();
    let postRef = null;
    for (const line of snap.split('\n')) {
      if (line.includes('Postear') && line.includes('button') && !line.includes('disabled')) {
        const match = line.match(/\[ref=(\w+)\]/);
        if (match) {
          postRef = match[1];
          break;
        }
      }
    }

    if (postRef) {
      console.log(`  Clicking Postear: ${postRef}`);
      clickRef(postRef);
      sleep(3000);

      // Find the new tweet URL
      snap = snapshot();
      for (const line of snap.split('\n')) {
        const urlMatch = line.match(new RegExp('/url: /' + TWITTER_HANDLE + '/status/(\\d+)'));
        if (urlMatch) {
          currentUrl = 'https://x.com/' + TWITTER_HANDLE + '/status/' + urlMatch[1];
          console.log(`  New tweet URL: ${currentUrl}`);
          break;
        }
      }
    } else {
      console.log(`  Could not find Postear button. Skipping.`);
    }
  }

  console.log('\nThread posted!');
}

main();
