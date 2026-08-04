#!/usr/bin/env node
/**
 * linkedin-invite.js — Send LinkedIn connection requests without a note.
 *
 * Uses playwright-cli (must be running via browser.js wrapper first).
 * Navigates to the custom-invite URL, clicks "Send without a note".
 *
 * Usage:
 *   node scripts/browser.js open "https://www.linkedin.com"   # ensure session
 *   node scripts/linkedin-invite.js <vanity>
 *   node scripts/linkedin-invite.js <vanity1> <vanity2> <vanity3>
 *   node scripts/linkedin-invite.js --from-search '"AI Engineer" "hiring" LATAM'
 *
 * Exit codes:
 *   0 = invite sent (or already connected)
 *   1 = invite failed (3rd+ connection, profile not found, etc)
 *   2 = browser not running / error
 */
'use strict';

const { execSync } = require('child_process');

function cli(args, timeout = 30000) {
  try {
    return execSync(`playwright-cli ${args}`, {
      encoding: 'utf-8',
      timeout,
      cwd: __dirname,
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function snapshot() {
  return cli('snapshot');
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function click(ref) {
  return cli(`click ${ref}`);
}

function goto(url) {
  execSync(`node ${__dirname}/browser.js goto "${url}"`, { stdio: 'pipe', cwd: __dirname });
}

function sendInvite(vanity) {
  const inviteUrl = `https://www.linkedin.com/preload/custom-invite/?vanityName=${vanity}`;
  goto(inviteUrl);
  sleep(3000);

  const snap = snapshot();

  // Check if dialog appeared
  if (!snap.includes('Add a note to your invitation')) {
    // Could be: already connected, 3rd+ connection, profile not found
    if (snap.includes('Connect') || snap.includes('Message')) {
      return { vanity, status: 'already_connected' };
    }
    return { vanity, status: 'no_dialog', error: 'Invite dialog did not appear (likely 3rd+ or not found)' };
  }

  // Find "Send without a note" button
  const match = snap.match(/ref=(f[0-9a-f]+)[^\n]*Send without a note/);
  if (!match) {
    return { vanity, status: 'no_button', error: 'Send without a note button not found' };
  }

  click(match[1]);
  sleep(2000);

  return { vanity, status: 'sent' };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/linkedin-invite.js <vanity> [<vanity2> ...]');
    console.error('       node scripts/linkedin-invite.js --from-search "<keywords>"');
    process.exit(2);
  }

  let vanities = [];

  if (args[0] === '--from-search') {
    if (!args[1]) {
      console.error('Error: --from-search requires keywords argument');
      process.exit(2);
    }
    // Run linkedin-search.js and parse JSON
    try {
      const output = execSync(
        `node ${__dirname}/linkedin-search.js "${args[1]}" --json --scroll 3`,
        { encoding: 'utf-8', timeout: 120000, cwd: __dirname }
      );
      const posts = JSON.parse(output);
      vanities = posts.filter((p) => p.vanity).map((p) => p.vanity);
      if (vanities.length === 0) {
        console.log('No vanities found from search.');
        process.exit(1);
      }
      console.log(`Found ${vanities.length} profiles from search. Sending invites...\n`);
    } catch (e) {
      console.error('Search failed:', e.message);
      process.exit(1);
    }
  } else {
    vanities = args;
  }

  const results = [];
  for (const vanity of vanities) {
    process.stdout.write(`Inviting ${vanity}... `);
    const result = sendInvite(vanity);
    results.push(result);

    switch (result.status) {
      case 'sent':
        console.log('SENT');
        break;
      case 'already_connected':
        console.log('ALREADY CONNECTED');
        break;
      default:
        console.log(`FAILED: ${result.error || result.status}`);
    }

    // Anti-ban: wait between invites
    if (vanities.indexOf(vanity) < vanities.length - 1) {
      sleep(3000);
    }
  }

  // Summary
  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status !== 'sent' && r.status !== 'already_connected').length;
  const connected = results.filter((r) => r.status === 'already_connected').length;

  console.log(`\nSummary: ${sent} sent, ${connected} already connected, ${failed} failed`);

  process.exit(failed > 0 && sent === 0 ? 1 : 0);
}

main();
