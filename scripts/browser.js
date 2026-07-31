#!/usr/bin/env node
/**
 * browser.js — Safe browser wrapper for agents.
 *
 * Guarantees the Chrome profile (.browser-profile) is always used.
 * Reads browser_mode preference from DB to decide headed/headless automatically.
 * Prevents opening a second instance when one is already running.
 *
 * Usage:
 *   node scripts/browser.js open <url> [--headed|--headless]   Open browser (profile always injected)
 *   node scripts/browser.js goto <url>                         Navigate current session
 *   node scripts/browser.js close                              Close current session
 *   node scripts/browser.js close-all                          Close all sessions
 *   node scripts/browser.js list                               List active sessions
 *   node scripts/browser.js status                             Show browser_mode pref + active sessions
 *   node scripts/browser.js -h|--help                          This help
 *
 * For all other playwright-cli commands (click, fill, snapshot, eval, etc.)
 * use `playwright-cli` directly — the wrapper only wraps open/close/goto.
 *
 * If --headed or --headless is not passed to `open`, the wrapper reads
 * preferences.tooling.browser_mode from the DB:
 *   headless            → always headless (except manual login, but that's the caller's job)
 *   headed              → always headed
 *   headed_logins_only  → headless (default; caller passes --headed for logins)
 *   ask_each_time       → headless (caller must pass --headed explicitly when needed)
 * Default if no DB or no preference: headless
 */
'use strict';

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');
const ENV_PATH = path.join(REPO_ROOT, '.env');

// --- helpers ---

function fail(msg, code = 1) {
  console.error(`[browser] ${msg}`);
  process.exit(code);
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Read browser_mode preference from DB.
 * Returns one of: 'headless', 'headed', 'headed_logins_only', 'ask_each_time', or null.
 * If DB is not available or query fails, returns null (caller defaults to headless).
 */
function getBrowserMode() {
  const env = loadEnv(ENV_PATH);
  if (!env.DATABASE_URL) return null;
  let result;
  try {
    result = execFileSync('node', [
      path.join(__dirname, 'db.js'),
      "SELECT value FROM preferences WHERE user_id = 1 AND category = 'tooling' AND key = 'browser_mode' AND status = 'active'",
    ], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
  try {
    const rows = JSON.parse(result);
    if (Array.isArray(rows) && rows.length > 0) return rows[0].value;
  } catch {
    // not JSON or empty
  }
  return null;
}

/**
 * List active playwright-cli sessions.
 * Returns an array of session names, or [] if none.
 * Parses output like:
 *   ### Browsers
 *   - linkedin:
 *     - status: open
 *     ...
 */
function getActiveSessions() {
  let out;
  try {
    out = execFileSync('playwright-cli', ['list'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }
  const sessions = [];
  for (const line of out.split('\n')) {
    // Lines like "- linkedin:" or "- default:"
    const m = line.match(/^\s*-\s+(\S+):\s*$/);
    if (m) sessions.push(m[1]);
  }
  return sessions;
}

/**
 * Get the first active session name, or null if none.
 */
function getActiveSession() {
  const sessions = getActiveSessions();
  return sessions.length > 0 ? sessions[0] : null;
}

/**
 * Run a playwright-cli command, inheriting stdio so the agent sees all output.
 */
function runPwCli(args) {
  try {
    execFileSync('playwright-cli', args, { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch (e) {
    fail(`playwright-cli failed: ${e.message}`);
  }
}

// --- arg parsing ---

const args = process.argv.slice(2);
const flags = {
  headed: args.includes('--headed'),
  headless: args.includes('--headless'),
  help: args.includes('-h') || args.includes('--help'),
};
const positional = args.filter((a) => !a.startsWith('-'));
const command = positional[0];

function usage() {
  console.log(`Usage:
  node scripts/browser.js open <url> [--headed|--headless]   Open browser (profile always injected)
  node scripts/browser.js goto <url>                         Navigate current session
  node scripts/browser.js close                              Close current session
  node scripts/browser.js close-all                          Close all sessions
  node scripts/browser.js list                               List active sessions
  node scripts/browser.js status                             Show browser_mode pref + active sessions
  node scripts/browser.js -h|--help                          This help

The wrapper always passes --profile=.browser-profile. You cannot omit it.
If --headed/--headless is not passed to 'open', the wrapper reads
preferences.tooling.browser_mode from the DB to decide.
Default: headless.

For click, fill, snapshot, eval, etc. use 'playwright-cli' directly.`);
}

function main() {
  if (flags.help || !command) {
    usage();
    return;
  }

  switch (command) {

    case 'open': {
      const url = positional[1];
      if (!url) fail('open requires a URL: node scripts/browser.js open <url>');

      // If a session is already running, reuse it with goto instead of failing
      const existing = getActiveSession();
      if (existing) {
        console.error(`[browser] Session '${existing}' already active, navigating with goto instead of opening a new one.`);
        runPwCli([`-s=${existing}`, 'goto', url]);
        return;
      }

      // Decide headed/headless
      let useHeaded;
      if (flags.headed) {
        useHeaded = true;
      } else if (flags.headless) {
        useHeaded = false;
      } else {
        // Read preference from DB
        const mode = getBrowserMode();
        useHeaded = mode === 'headed';
        // headless, headed_logins_only, ask_each_time, null → all default to headless
        // (the caller passes --headed explicitly for manual logins)
      }

      const pwArgs = ['open', '--profile=.browser-profile', url];
      if (useHeaded) pwArgs.push('--headed');

      runPwCli(pwArgs);
      return;
    }

    case 'goto': {
      const url = positional[1];
      if (!url) fail('goto requires a URL: node scripts/browser.js goto <url>');
      const existing = getActiveSession();
      const sessionArgs = existing ? [`-s=${existing}`] : [];
      runPwCli([...sessionArgs, 'goto', url]);
      return;
    }

    case 'close': {
      const existing = getActiveSession();
      const sessionArgs = existing ? [`-s=${existing}`] : [];
      runPwCli([...sessionArgs, 'close']);
      return;
    }

    case 'close-all': {
      // playwright-cli close-all might not exist in all versions; try both
      try {
        execFileSync('playwright-cli', ['close-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
      } catch {
        // Fallback: try kill-all
        try {
          execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
        } catch (e) {
          fail(`Failed to close all sessions: ${e.message}`);
        }
      }
      return;
    }

    case 'list': {
      runPwCli(['list']);
      return;
    }

    case 'status': {
      const mode = getBrowserMode();
      const sessions = getActiveSessions();
      console.log(JSON.stringify({
        browser_mode: mode || '(not set, default: headless)',
        active_sessions: sessions,
        profile: PROFILE_DIR,
      }, null, 2));
      return;
    }

    default:
      fail(`Unknown command: ${command}. Run --help for usage.`);
  }
}

main();
