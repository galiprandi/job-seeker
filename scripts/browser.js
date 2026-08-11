#!/usr/bin/env node
/**
 * browser.js — Generic safe browser wrapper for agents.
 *
 * Guarantees the Chrome profile (.browser-profile) is always used.
 * Reads browser_mode from config file or env var (NO database dependency).
 * Prevents opening a second instance when one is already running (lockfile).
 * Manages named tabs for parallel subagent work.
 * Provides atomic tab-select + command execution via --tab flag + file lock.
 *
 * Config resolution for browser_mode (headed vs headless):
 *   1. --headed / --headless flag passed to `open`
 *   2. .browser-config.json in the repo root: { "browser_mode": "headed" }
 *   3. BROWSER_MODE environment variable
 *   4. Default: headless
 *
 * Usage:
 *   node scripts/browser.js open <url> [--headed|--headless] [--session <name>]
 *     Open browser (profile always injected). If a session is already active,
 *     navigates it to <url> instead of opening a second instance.
 *
 *   node scripts/browser.js attach --session <name>
 *     Attach a new session to the running browser. The attached session has
 *     its own independent active tab, enabling true parallelism without locks.
 *     Use this for subagents: each subagent gets its own session.
 *
 *   node scripts/browser.js detach --session <name>
 *     Detach a session from the browser (does not close the browser).
 *
 *   node scripts/browser.js goto <url> [--tab <name>] [--session <name>]
 *     Navigate current session (or specific tab) to <url>.
 *     With --tab: atomically selects the tab then navigates (lock-protected).
 *
 *   node scripts/browser.js close [--session <name>] [--force]
 *     Close current session. Refuses if other agents are active (use --force).
 *
 *   node scripts/browser.js close-all [--force]
 *     Close all sessions. Refuses if other agents are active (use --force).
 *
 *   node scripts/browser.js ensure [--session <name>] [--headed]
 *     Idempotent: if a healthy session exists, no-op. If not, fails with a
 *     clear message telling the caller to run `open` first.
 *
 *   node scripts/browser.js exec <cmd> [args...] [--tab <name>] [--session <name>]
 *     Passthrough to playwright-cli with automatic session resolution.
 *     With --tab: atomically selects the tab then runs the command (lock-protected).
 *     Example: node scripts/browser.js exec snapshot --tab gmail
 *
 *   node scripts/browser.js tab-new <url> --name <name> [--session <name>]
 *     Create a new tab with a human-readable name.
 *
 *   node scripts/browser.js tab-select <name> [--session <name>]
 *     Select a tab by name.
 *
 *   node scripts/browser.js tab-close <name> [--session <name>]
 *     Close a tab by name and remove it from the mapping.
 *
 *   node scripts/browser.js tab-close-all [--session <name>]
 *     Close all tabs except the first one and clear the mapping.
 *
 *   node scripts/browser.js tab-list [--session <name>] [--json]
 *     List all tabs with their names and indices.
 *
 *   node scripts/browser.js save-state [--filename <path>] [--session <name>]
 *     Save browser auth state (cookies, localStorage) to a file.
 *     Defaults to .browser-profile/auth-state.json.
 *
 *   node scripts/browser.js load-state [--filename <path>] [--session <name>]
 *     Load browser auth state from a file.
 *     Defaults to .browser-profile/auth-state.json.
 *
 *   node scripts/browser.js dashboard
 *     Open the visual dashboard to monitor all running sessions.
 *
 *   node scripts/browser.js trace-start [--session <name>]
 *     Start trace recording for debugging.
 *
 *   node scripts/browser.js trace-stop [--session <name>]
 *     Stop trace recording. Trace can be viewed with `playwright show-trace`.
 *
 *   node scripts/browser.js video-start [--filename <path>] [--session <name>]
 *     Start video recording of the session.
 *
 *   node scripts/browser.js video-stop [--session <name>]
 *     Stop video recording.
 *
 *   node scripts/browser.js console [level] [--session <name>]
 *     List console messages (level: error, warning, info, debug).
 *
 *   node scripts/browser.js requests [--session <name>]
 *     List all network requests since page load.
 *
 *   node scripts/browser.js request <index> [--session <name>]
 *     Show full details of a specific network request.
 *
 *   node scripts/browser.js list
 *     List active playwright-cli sessions.
 *
 *   node scripts/browser.js status
 *     Show browser_mode config + active sessions + tab mapping.
 *
 *   node scripts/browser.js who
 *     List agents currently holding a ref-count on the browser.
 *
 *   node scripts/browser.js -h|--help
 *     This help.
 *
 * For all other playwright-cli commands (click, fill, snapshot, eval, etc.)
 * use `exec` or call `playwright-cli` directly AFTER opening via the wrapper.
 *
 * Environment variables:
 *   BROWSER_DEBUG=1     Verbose logging to stderr.
 *   BROWSER_LOCK_TIMEOUT_MS  Max wait for browser lock (default 60000).
 *   BROWSER_MODE         Override browser mode (headed, headless, headed_logins_only).
 *   PLAYWRIGHT_CLI_SESSION  Default session name (used by playwright-cli directly).
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// REPO_ROOT is the consuming repo's root (CWD), NOT the script's location.
// This allows the script to be copied into any repo and work with that repo's
// .browser-profile directory.
const REPO_ROOT = process.cwd();
const CONFIG_PATH = path.join(REPO_ROOT, '.browser-config.json');
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');
const LOCK_PATH = path.join(PROFILE_DIR, '.lock');
const TABS_PATH = path.join(PROFILE_DIR, 'tabs.json');
const STATE_PATH = path.join(PROFILE_DIR, 'session-state.json');
const AUTH_STATE_PATH = path.join(PROFILE_DIR, 'auth-state.json');

const DEBUG = process.env.BROWSER_DEBUG === '1';
const LOCK_TIMEOUT_MS = parseInt(process.env.BROWSER_LOCK_TIMEOUT_MS || '60000', 10);
const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.BROWSER_HEALTH_CHECK_TIMEOUT_MS || '10000', 10);
const HEALTH_CHECK_RETRIES = parseInt(process.env.BROWSER_HEALTH_CHECK_RETRIES || '2', 10);

// Ref-count: tracks how many agents are actively using the browser.
// close/close-all check this before killing the browser.
// Design: the ref-count is based on LIVE attached sessions. If there are
// attached sessions that pass a health check, there are agents working.
// The primary session is NOT counted as an "agent" — it's the browser owner.
// Only attached sessions represent parallel workers.

// --- logging ---

function debug(msg) {
  if (DEBUG) console.error(`[browser:debug] ${msg}`);
}

// --- helpers ---

function fail(msg, code = 1) {
  console.error(`[browser] ${msg}`);
  process.exit(code);
}

/**
 * Read browser_mode from config file or env var.
 * Returns one of: 'headless', 'headed', 'headed_logins_only', 'ask_each_time', or null.
 * Resolution order:
 *   1. .browser-config.json: { "browser_mode": "..." }
 *   2. BROWSER_MODE env var
 *   3. null (caller defaults to headless)
 */
function getBrowserMode() {
  // 1. Config file
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.browser_mode) {
        debug(`getBrowserMode: from config file = ${config.browser_mode}`);
        return config.browser_mode;
      }
    } catch (e) {
      debug(`getBrowserMode: config file parse failed: ${e.message}`);
    }
  }
  // 2. Env var
  if (process.env.BROWSER_MODE) {
    debug(`getBrowserMode: from env = ${process.env.BROWSER_MODE}`);
    return process.env.BROWSER_MODE;
  }
  debug('getBrowserMode: no config found, returning null');
  return null;
}

// --- session management ---

/**
 * List active playwright-cli sessions via --json.
 * Returns an array of session names, or [] if none.
 */
function getActiveSessions() {
  let out;
  try {
    out = execFileSync('playwright-cli', ['list', '--json'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    debug(`getActiveSessions: playwright-cli list failed: ${e.message}`);
    return [];
  }
  try {
    const data = JSON.parse(out);
    if (data && Array.isArray(data.browsers)) {
      return data.browsers
        .filter((b) => b.status === 'open')
        .map((b) => b.name);
    }
  } catch {
    debug('getActiveSessions: list output not JSON, falling back to text parse');
    const sessions = [];
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*-\s+(\S+):\s*$/);
      if (m) sessions.push(m[1]);
    }
    return sessions;
  }
  return [];
}

/**
 * Get a specific session by name, or the first active one if no name given.
 */
function getSession(name) {
  const sessions = getActiveSessions();
  if (sessions.length === 0) return null;
  if (name) {
    return sessions.includes(name) ? name : null;
  }
  return sessions[0];
}

/**
 * Health check: verify a session is responsive by running a trivial command.
 * Retries before declaring zombie. Returns true if alive, false if zombie.
 */
function isSessionHealthy(sessionName) {
  for (let attempt = 1; attempt <= HEALTH_CHECK_RETRIES + 1; attempt++) {
    try {
      execFileSync('playwright-cli', [`-s=${sessionName}`, 'eval', '1+1'], {
        encoding: 'utf8',
        timeout: HEALTH_CHECK_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      debug(`isSessionHealthy: ${sessionName} is healthy (attempt ${attempt})`);
      return true;
    } catch (e) {
      debug(`isSessionHealthy: ${sessionName} attempt ${attempt} failed: ${e.message}`);
      if (attempt <= HEALTH_CHECK_RETRIES) {
        const waitMs = 1000 * attempt;
        debug(`isSessionHealthy: retrying in ${waitMs}ms...`);
        execFileSync('sleep', [String(waitMs / 1000)], { stdio: 'ignore' });
      }
    }
  }
  return false;
}

/**
 * Get a healthy session. If the named session exists but is a zombie,
 * kill ONLY that session (not all) and return null so the caller can reopen.
 */
function getHealthySession(name) {
  const session = getSession(name);
  if (!session) return null;
  if (isSessionHealthy(session)) return session;
  console.error(`[browser] Session '${session}' is unresponsive (zombie). Cleaning up.`);
  try {
    execFileSync('playwright-cli', ['-s=' + session, 'close'], { cwd: REPO_ROOT, stdio: 'pipe', timeout: 5000 });
    debug(`getHealthySession: closed session '${session}'`);
  } catch {
    debug(`getHealthySession: targeted close failed, falling back to kill-all`);
    killAllSessions();
  }
  return null;
}

/**
 * Get any healthy session from the active list. Tries each one until
 * a healthy session is found. Used by attach() to find any live parent.
 * Prefers 'default' if it exists and is healthy.
 */
function getAnyHealthySession() {
  const sessions = getActiveSessions();
  if (sessions.length === 0) return null;
  if (sessions.includes('default') && isSessionHealthy('default')) return 'default';
  for (const s of sessions) {
    if (s === 'default') continue;
    if (isSessionHealthy(s)) return s;
  }
  return null;
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

/**
 * Run a playwright-cli command, capturing output (no inherit).
 * Returns the stdout string, or throws on failure.
 */
function runPwCliCapture(args, timeoutMs = 10000) {
  return execFileSync('playwright-cli', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Kill all sessions forcefully.
 */
function killAllSessions() {
  try {
    execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    // Ignore — best effort cleanup
  }
  removeLock();
  clearTabsState();
}

// --- lock management ---

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire a file lock to serialize browser operations.
 * Uses atomic O_EXCL creation. If a stale lock is detected (process dead),
 * it is removed and retried.
 */
function acquireLock(timeoutMs = LOCK_TIMEOUT_MS) {
  const start = Date.now();
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
  while (true) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
      debug(`acquireLock: lock acquired (PID ${process.pid})`);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const lockPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
        if (lockPid && !isProcessAlive(lockPid)) {
          debug(`acquireLock: stale lock from dead PID ${lockPid}, removing`);
          fs.unlinkSync(LOCK_PATH);
          continue;
        }
      } catch {
        try { fs.unlinkSync(LOCK_PATH); } catch {}
        continue;
      }
      if (Date.now() - start > timeoutMs) {
        fail(`Timeout waiting for browser lock at ${LOCK_PATH} (PID ${process.pid}). Another process may be using the browser.`);
      }
      try { execFileSync('sleep', ['0.05']); } catch {}
    }
  }
}

function releaseLock() {
  removeLock();
}

function removeLock() {
  try {
    const lockPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
    if (lockPid === process.pid) {
      fs.unlinkSync(LOCK_PATH);
      debug('removeLock: lock removed');
    }
  } catch {
    // Lock doesn't exist or can't read — fine
  }
}

// --- ref-count management (prevents destructive close when agents are working) ---

/**
 * Count live attached sessions. An attached session is a parallel worker.
 * If there are live attached sessions, closing the primary session would
 * kill the browser for all of them.
 * @returns {string[]} array of live attached session names
 */
function getLiveAttachedSessions() {
  const state = loadSessionState();
  if (!state.sessions) return [];
  const live = [];
  for (const [name, info] of Object.entries(state.sessions)) {
    if (!info.attached) continue;
    if (isSessionHealthy(name)) {
      live.push(name);
    }
  }
  return live;
}

/**
 * Count live attached sessions (excluding a specific session if provided).
 */
function refcountActiveCount(excludeSession = null) {
  const live = getLiveAttachedSessions();
  if (excludeSession) {
    return live.filter((s) => s !== excludeSession).length;
  }
  return live.length;
}

/**
 * List active attached sessions (for status/who display).
 */
function refcountList() {
  const state = loadSessionState();
  if (!state.sessions) return [];
  const result = [];
  for (const [name, info] of Object.entries(state.sessions)) {
    if (!info.attached) continue;
    if (isSessionHealthy(name)) {
      result.push({
        session: name,
        parent: info.parent || 'default',
        since: info.opened_at,
      });
    }
  }
  return result;
}

// --- tab state management ---

function loadTabsState() {
  try {
    const data = JSON.parse(fs.readFileSync(TABS_PATH, 'utf8'));
    return data;
  } catch {
    return { tabs: {}, current: null };
  }
}

function saveTabsState(state) {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
  fs.writeFileSync(TABS_PATH, JSON.stringify(state, null, 2));
}

function clearTabsState() {
  saveTabsState({ tabs: {}, current: null });
}

/**
 * Parse playwright-cli tab-list output to extract tab indices and URLs.
 * Returns array of { index, current, url, title }.
 */
function parseTabList(output) {
  const tabs = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*-\s+(\d+):\s*(\(current\)\s*)?\[([^\]]*)\]\((.+)\)\s*$/);
    if (m) {
      tabs.push({
        index: parseInt(m[1], 10),
        current: !!m[2],
        title: m[3] || '',
        url: m[4],
      });
    }
  }
  return tabs;
}

function getTabList(sessionName) {
  const sessionArgs = sessionName ? [`-s=${sessionName}`] : [];
  try {
    const out = runPwCliCapture([...sessionArgs, 'tab-list', '--json'], 5000);
    const data = JSON.parse(out);
    const text = data.result || data.output || out;
    return parseTabList(text);
  } catch (e) {
    debug(`getTabList failed: ${e.message}`);
    return [];
  }
}

function normalizeUrlForCompare(url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p === '/') p = '';
    return `${u.protocol}//${u.host.toLowerCase()}${p}${u.search}${u.hash}`;
  } catch {
    return url.replace(/\/$/, '');
  }
}

/**
 * Sync the tab state with the actual browser tabs.
 * Rebuilds the name→index mapping by matching URLs (normalized).
 */
function syncTabsState(sessionName) {
  const state = loadTabsState();
  const realTabs = getTabList(sessionName);
  const newTabs = {};
  for (const tab of realTabs) {
    let name = null;
    for (const [n, info] of Object.entries(state.tabs)) {
      if (normalizeUrlForCompare(info.url) === normalizeUrlForCompare(tab.url)) {
        name = n;
        break;
      }
    }
    if (!name) {
      for (const [n, info] of Object.entries(state.tabs)) {
        if (info.index === tab.index) {
          name = n;
          break;
        }
      }
    }
    if (name) {
      newTabs[name] = { index: tab.index, url: tab.url };
    }
  }
  const currentReal = realTabs.find((t) => t.current);
  let currentName = null;
  if (currentReal) {
    for (const [n, info] of Object.entries(newTabs)) {
      if (info.index === currentReal.index) {
        currentName = n;
        break;
      }
    }
  }
  saveTabsState({ tabs: newTabs, current: currentName });
  return { tabs: newTabs, current: currentName, realTabs };
}

// --- session state persistence ---

function loadSessionState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { sessions: {} };
  }
}

function saveSessionState(state) {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function recordSession(name, url, headed) {
  const state = loadSessionState();
  if (!state.sessions) state.sessions = {};
  state.sessions[name] = {
    opened_at: new Date().toISOString(),
    headed,
    initial_url: url,
    attached: false,
  };
  saveSessionState(state);
}

function removeSessionState(name) {
  const state = loadSessionState();
  if (state.sessions && state.sessions[name]) {
    delete state.sessions[name];
    saveSessionState(state);
  }
}

function recordAttachedSession(name, parentSession) {
  const state = loadSessionState();
  if (!state.sessions) state.sessions = {};
  state.sessions[name] = {
    opened_at: new Date().toISOString(),
    attached: true,
    parent: parentSession,
  };
  saveSessionState(state);
}

function isAttachedSession(name) {
  const state = loadSessionState();
  return !!(state.sessions && state.sessions[name] && state.sessions[name].attached);
}

// --- screenshot on failure ---

function screenshotOnFailure(sessionName) {
  const sessionArgs = sessionName ? [`-s=${sessionName}`] : [];
  try {
    execFileSync('playwright-cli', [...sessionArgs, 'screenshot'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.error(`[browser] Screenshot may have been saved. Check ${PROFILE_DIR}/ for recent screenshots.`);
  } catch {
    // Best effort
  }
}

// --- URL validation ---

function normalizeUrl(url) {
  if (!url) return null;
  if (!url.match(/^https?:\/\//) && !url.match(/^about:/) && !url.match(/^file:/)) {
    url = 'https://' + url;
  }
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

// --- arg parsing ---

function parseArgs(argv) {
  const result = {
    command: null,
    positionals: [],
    flags: {
      headed: false,
      headless: false,
      json: false,
      help: false,
      force: false,
    },
    options: {
      session: null,
      tab: null,
      name: null,
      filename: null,
    },
    execArgs: [],
  };

  const valueFlags = new Set(['--session', '--tab', '--name', '--timeout', '--filename']);
  const boolFlags = new Set(['--headed', '--headless', '--json', '--help', '-h', '--force']);

  let i = 0;
  let inExecPassthrough = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (inExecPassthrough) {
      if (arg === '--session' || arg === '--tab') {
        i++;
        if (i < argv.length) {
          if (arg === '--session') result.options.session = argv[i];
          else result.options.tab = argv[i];
        }
        i++;
        continue;
      }
      if (arg.startsWith('--session=') || arg.startsWith('--tab=')) {
        if (arg.startsWith('--session=')) result.options.session = arg.slice('--session='.length);
        else result.options.tab = arg.slice('--tab='.length);
        i++;
        continue;
      }
      if (result.positionals.length === 0) {
        result.positionals.push(arg);
      } else {
        result.execArgs.push(arg);
      }
      i++;
      continue;
    }

    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const flagName = arg.slice(0, eqIdx);
      const flagValue = arg.slice(eqIdx + 1);
      if (flagName === '--session') { result.options.session = flagValue; i++; continue; }
      if (flagName === '--tab') { result.options.tab = flagValue; i++; continue; }
      if (flagName === '--name') { result.options.name = flagValue; i++; continue; }
      if (flagName === '--filename') { result.options.filename = flagValue; i++; continue; }
    }

    if (boolFlags.has(arg)) {
      if (arg === '--headed') result.flags.headed = true;
      if (arg === '--headless') result.flags.headless = true;
      if (arg === '--json') result.flags.json = true;
      if (arg === '--help' || arg === '-h') result.flags.help = true;
      if (arg === '--force') result.flags.force = true;
      i++;
      continue;
    }

    if (valueFlags.has(arg)) {
      i++;
      if (i < argv.length) {
        if (arg === '--session') result.options.session = argv[i];
        else if (arg === '--tab') result.options.tab = argv[i];
        else if (arg === '--name') result.options.name = argv[i];
        else if (arg === '--filename') result.options.filename = argv[i];
      }
      i++;
      continue;
    }

    if (result.command === null) {
      result.command = arg;
      if (arg === 'exec') {
        inExecPassthrough = true;
      }
    } else {
      result.positionals.push(arg);
    }
    i++;
  }

  return result;
}

// --- usage ---

function usage() {
  console.log(`Usage:
  node scripts/browser.js open <url> [--headed|--headless] [--session <name>]
    Open browser (profile always injected). Reuses existing session if active.

  node scripts/browser.js attach --session <name>
    Attach a new session to the running browser. Independent active tab.
    Use for subagents: each gets its own session, no tab locks needed.

  node scripts/browser.js detach --session <name>
    Detach a session from the browser.

  node scripts/browser.js goto <url> [--tab <name>] [--session <name>]
    Navigate to <url>. With --tab: atomically selects tab then navigates.

  node scripts/browser.js close [--session <name>] [--force]
    Close current session. Refuses if other agents are active (use --force).

  node scripts/browser.js close-all [--force]
    Close all sessions. Refuses if other agents are active (use --force).

  node scripts/browser.js who
    List agents currently holding a ref-count on the browser.

  node scripts/browser.js ensure [--session <name>] [--headed]
    Idempotent check: no-op if healthy session exists, fails if not.

  node scripts/browser.js exec <cmd> [args...] [--tab <name>] [--session <name>]
    Passthrough to playwright-cli with session resolution.
    With --tab: atomically selects tab then runs command (lock-protected).
    Example: node scripts/browser.js exec snapshot --tab gmail

  node scripts/browser.js tab-new <url> --name <name> [--session <name>]
    Create a new tab with a human-readable name.

  node scripts/browser.js tab-select <name> [--session <name>]
    Select a tab by name.

  node scripts/browser.js tab-close <name> [--session <name>]
    Close a tab by name.

  node scripts/browser.js tab-close-all [--session <name>]
    Close all tabs and clear the mapping.

  node scripts/browser.js tab-list [--session <name>] [--json]
    List all tabs with names and indices.

  node scripts/browser.js save-state [--filename <path>] [--session <name>]
    Save auth state (cookies, localStorage). Default: .browser-profile/auth-state.json

  node scripts/browser.js load-state [--filename <path>] [--session <name>]
    Load auth state. Default: .browser-profile/auth-state.json

  node scripts/browser.js dashboard
    Open visual dashboard to monitor all running sessions.

  node scripts/browser.js trace-start [--session <name>]
    Start trace recording for debugging.

  node scripts/browser.js trace-stop [--session <name>]
    Stop trace recording.

  node scripts/browser.js video-start [--filename <path>] [--session <name>]
    Start video recording.

  node scripts/browser.js video-stop [--session <name>]
    Stop video recording.

  node scripts/browser.js console [level] [--session <name>]
    List console messages. Level: error, warning, info, debug.

  node scripts/browser.js requests [--session <name>]
    List all network requests since page load.

  node scripts/browser.js request <index> [--session <name>]
    Show details of a specific network request.

  node scripts/browser.js list
    List active playwright-cli sessions.

  node scripts/browser.js status
    Show browser_mode config + active sessions + tab mapping.

  node scripts/browser.js -h|--help
    This help.

The wrapper always passes --profile=.browser-profile. You cannot omit it.
Config resolution for browser_mode (headed vs headless):
  1. --headed / --headless flag
  2. .browser-config.json: { "browser_mode": "headed" }
  3. BROWSER_MODE env var
  4. Default: headless

Environment:
  BROWSER_DEBUG=1              Verbose logging to stderr.
  BROWSER_LOCK_TIMEOUT_MS      Max wait for browser lock (default 60000).
  BROWSER_MODE                 Override browser mode.

For click, fill, snapshot, eval, etc. use 'exec' or call 'playwright-cli' directly.`);
}

// --- main ---

function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  if (parsed.flags.help || !parsed.command) {
    usage();
    return;
  }

  const { command, positionals, flags, options } = parsed;

  switch (command) {

    case 'open': {
      const url = positionals[0];
      if (!url) fail('open requires a URL: node scripts/browser.js open <url>');

      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) fail(`Invalid URL: ${url}`);

      const sessionName = options.session || 'default';

      acquireLock();

      const existing = getHealthySession(sessionName);
      if (existing) {
        console.error(`[browser] Session '${existing}' already active, navigating with goto instead of opening a new one.`);
        runPwCli([`-s=${existing}`, 'goto', normalizedUrl]);
        const state = loadTabsState();
        const currentName = state.current || 'default';
        state.tabs[currentName] = { index: 0, url: normalizedUrl };
        state.current = currentName;
        saveTabsState(state);
        releaseLock();
        return;
      }

      // If a browser is already running with the same profile, attach instead
      // of opening a second instance (which would kill the existing one).
      const anySession = getAnyHealthySession();
      if (anySession && sessionName !== 'default') {
        console.error(`[browser] Browser already running (session '${anySession}'). Attaching '${sessionName}' instead of opening a new instance.`);
        try {
          runPwCli(['attach', anySession, `--session=${sessionName}`]);
          recordAttachedSession(sessionName, anySession);
          runPwCli([`-s=${sessionName}`, 'tab-new', normalizedUrl]);
          console.log(`[browser] Session '${sessionName}' attached to '${anySession}' with new tab at ${normalizedUrl}.`);
        } catch (e) {
          screenshotOnFailure(sessionName);
          fail(`Failed to attach session '${sessionName}': ${e.message}`);
        }
        releaseLock();
        return;
      }

      // Decide headed/headless
      let useHeaded;
      if (flags.headed) {
        useHeaded = true;
      } else if (flags.headless) {
        useHeaded = false;
      } else {
        const mode = getBrowserMode();
        useHeaded = mode === 'headed';
        debug(`open: browser_mode = ${mode}, useHeaded = ${useHeaded}`);
      }

      const pwArgs = ['open', '--profile=.browser-profile', normalizedUrl];
      if (useHeaded) pwArgs.push('--headed');

      if (sessionName !== 'default') {
        pwArgs.unshift(`-s=${sessionName}`);
      }

      try {
        runPwCli(pwArgs);
        recordSession(sessionName, normalizedUrl, useHeaded);
        saveTabsState({ tabs: { default: { index: 0, url: normalizedUrl } }, current: 'default' });
      } catch (e) {
        screenshotOnFailure(sessionName);
        fail(`Failed to open browser: ${e.message}`);
      }
      releaseLock();
      return;
    }

    case 'attach': {
      const sessionName = options.session || positionals[0];
      if (!sessionName) fail('attach requires a session name: node scripts/browser.js attach --session <name>');

      const parentSession = getAnyHealthySession();
      if (!parentSession) {
        fail('No active browser to attach to. Run `open` first.');
      }

      const existing = getSession(sessionName);
      if (existing) {
        console.log(`[browser] Session '${sessionName}' already exists.`);
        return;
      }

      try {
        runPwCli(['attach', parentSession, `--session=${sessionName}`]);
        recordAttachedSession(sessionName, parentSession);
        console.log(`[browser] Session '${sessionName}' attached to '${parentSession}'. Independent tab context active.`);
      } catch (e) {
        fail(`Failed to attach session '${sessionName}': ${e.message}`);
      }
      return;
    }

    case 'detach': {
      const sessionName = options.session || 'default';
      const session = getSession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'.`);
      }
      try {
        runPwCli([`-s=${session}`, 'detach']);
        removeSessionState(sessionName);
        console.log(`[browser] Session '${sessionName}' detached.`);
      } catch (e) {
        fail(`Failed to detach session '${sessionName}': ${e.message}`);
      }
      return;
    }

    case 'goto': {
      const url = positionals[0];
      if (!url) fail('goto requires a URL: node scripts/browser.js goto <url>');

      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) fail(`Invalid URL: ${url}`);

      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      if (options.tab) {
        const attached = isAttachedSession(sessionName);
        if (!attached) acquireLock();
        try {
          const state = loadTabsState();
          const tabInfo = state.tabs[options.tab];
          if (!tabInfo) {
            fail(`Tab '${options.tab}' not found. Run 'tab-list' to see available tabs.`);
          }
          runPwCli([`-s=${session}`, 'tab-select', String(tabInfo.index)]);
          runPwCli([`-s=${session}`, 'goto', normalizedUrl]);
          if (!attached) {
            tabInfo.url = normalizedUrl;
            state.current = options.tab;
            saveTabsState(state);
          }
        } finally {
          if (!attached) releaseLock();
        }
      } else {
        runPwCli([`-s=${session}`, 'goto', normalizedUrl]);
      }
      return;
    }

    case 'close': {
      const sessionName = options.session || 'default';
      const session = getSession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      acquireLock();
      try {
        const others = refcountActiveCount(sessionName);
        if (others > 0) {
          const attached = isAttachedSession(sessionName);
          if (attached) {
            try {
              execFileSync('playwright-cli', [`-s=${session}`, 'detach'], { cwd: REPO_ROOT, stdio: 'inherit' });
              console.error(`[browser] Session '${sessionName}' detached (not closed): ${others} other agent(s) still using the browser.`);
            } catch {
              try { execFileSync('playwright-cli', [`-s=${session}`, 'close'], { cwd: REPO_ROOT, stdio: 'inherit' }); } catch {}
            }
            removeSessionState(sessionName);
            releaseLock();
            return;
          } else {
            if (!flags.force) {
              console.error(`[browser] WARNING: ${others} attached agent(s) are using the browser. Closing the primary session would kill it for everyone.`);
              console.error(`[browser] Active agents:`);
              for (const r of refcountList()) {
                console.error(`[browser]   session '${r.session}' (attached to '${r.parent}', since ${r.since})`);
              }
              console.error(`[browser] Use 'detach --session ${sessionName}' to release this session without killing the browser.`);
              console.error(`[browser] Or use 'close --session ${sessionName} --force' to force-close anyway.`);
              releaseLock();
              fail(`Refusing to close primary session with ${others} active agent(s). Use --force to override.`, 1);
            }
            console.error(`[browser] Force-closing primary session despite ${others} active agent(s).`);
          }
        }
        try {
          execFileSync('playwright-cli', [`-s=${session}`, 'close'], { cwd: REPO_ROOT, stdio: 'inherit' });
        } catch {
          debug(`close: graceful close failed, trying close-all/kill-all`);
          try {
            execFileSync('playwright-cli', ['close-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
          } catch {
            try {
              execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
            } catch {}
          }
        }
        removeSessionState(sessionName);
        clearTabsState();
      } finally {
        releaseLock();
      }
      return;
    }

    case 'close-all': {
      acquireLock();
      try {
        const others = refcountActiveCount(null);
        if (others > 0 && !flags.force) {
          console.error(`[browser] WARNING: ${others} attached agent(s) are using the browser. close-all would kill it for everyone.`);
          console.error(`[browser] Active agents:`);
          for (const r of refcountList()) {
            console.error(`[browser]   session '${r.session}' (attached to '${r.parent}', since ${r.since})`);
          }
          console.error(`[browser] Use 'close-all --force' to override.`);
          releaseLock();
          fail(`Refusing to close all sessions with ${others} active agent(s). Use --force to override.`, 1);
        }
        if (others > 0) {
          console.error(`[browser] Force-closing all sessions despite ${others} active agent(s).`);
        }
        try {
          execFileSync('playwright-cli', ['close-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
        } catch {
          try {
            execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
          } catch {
            debug('close-all: both close-all and kill-all failed (probably no sessions)');
          }
        }
        saveSessionState({ sessions: {} });
        clearTabsState();
      } finally {
        releaseLock();
      }
      return;
    }

    case 'ensure': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (session) {
        console.log(`[browser] Session '${session}' is active and healthy.`);
        if (flags.json) {
          console.log(JSON.stringify({ status: 'ok', session: sessionName }));
        }
        return;
      }
      fail(`No healthy session '${sessionName}'. Run: node scripts/browser.js open <url> ${options.session ? `--session ${options.session}` : ''}${flags.headed ? ' --headed' : ''}`);
      return;
    }

    case 'exec': {
      const subcommand = positionals[0];
      if (!subcommand) fail('exec requires a playwright-cli command: node scripts/browser.js exec <cmd> [args...]');

      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      if (options.tab) {
        const attached = isAttachedSession(sessionName);
        if (!attached) acquireLock();
        try {
          const state = loadTabsState();
          const tabInfo = state.tabs[options.tab];
          if (!tabInfo) {
            fail(`Tab '${options.tab}' not found. Run 'tab-list' to see available tabs.`);
          }
          runPwCli([`-s=${session}`, 'tab-select', String(tabInfo.index)]);
          runPwCli([`-s=${session}`, subcommand, ...parsed.execArgs]);
          if (!attached) {
            state.current = options.tab;
            saveTabsState(state);
          }
        } catch (e) {
          screenshotOnFailure(session);
          fail(`exec failed: ${e.message}`);
        } finally {
          if (!attached) releaseLock();
        }
      } else {
        try {
          runPwCli([`-s=${session}`, subcommand, ...parsed.execArgs]);
        } catch (e) {
          screenshotOnFailure(session);
          fail(`exec failed: ${e.message}`);
        }
      }
      return;
    }

    case 'tab-new': {
      const url = positionals[0] || 'about:blank';
      const tabName = options.name;
      if (!tabName) fail('tab-new requires --name: node scripts/browser.js tab-new <url> --name <name>');

      const normalizedUrl = url === 'about:blank' ? url : normalizeUrl(url);
      if (url !== 'about:blank' && !normalizedUrl) fail(`Invalid URL: ${url}`);

      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      acquireLock();
      try {
        runPwCli([`-s=${session}`, 'tab-new', normalizedUrl || url]);
        const realTabs = getTabList(session);
        const newTab = realTabs.find((t) => t.current) || realTabs[realTabs.length - 1];
        if (!newTab) {
          fail('Failed to create new tab: could not determine tab index.');
        }
        const state = loadTabsState();
        state.tabs[tabName] = { index: newTab.index, url: normalizedUrl || url };
        state.current = tabName;
        saveTabsState(state);
        console.log(`[browser] Tab '${tabName}' created at index ${newTab.index} (${normalizedUrl || url}).`);
      } finally {
        releaseLock();
      }
      return;
    }

    case 'tab-select': {
      const tabName = positionals[0] || options.name;
      if (!tabName) fail('tab-select requires a tab name: node scripts/browser.js tab-select <name>');

      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      const attached = isAttachedSession(sessionName);
      if (!attached) acquireLock();
      try {
        const synced = attached ? { tabs: loadTabsState().tabs, current: null } : syncTabsState(session);
        const tabInfo = synced.tabs[tabName];
        if (!tabInfo) {
          fail(`Tab '${tabName}' not found. Available: ${Object.keys(synced.tabs).join(', ') || '(none)'}`);
        }
        runPwCli([`-s=${session}`, 'tab-select', String(tabInfo.index)]);
        if (!attached) {
          saveTabsState({ tabs: synced.tabs, current: tabName });
        }
      } finally {
        if (!attached) releaseLock();
      }
      return;
    }

    case 'tab-close': {
      const tabName = positionals[0] || options.name;
      if (!tabName) fail('tab-close requires a tab name: node scripts/browser.js tab-close <name>');

      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      acquireLock();
      try {
        const state = loadTabsState();
        const tabInfo = state.tabs[tabName];
        if (!tabInfo) {
          fail(`Tab '${tabName}' not found. Available: ${Object.keys(state.tabs).join(', ') || '(none)'}`);
        }
        runPwCli([`-s=${session}`, 'tab-close', String(tabInfo.index)]);
        delete state.tabs[tabName];
        saveTabsState(state);
        syncTabsState(session);
        console.log(`[browser] Tab '${tabName}' closed.`);
      } finally {
        releaseLock();
      }
      return;
    }

    case 'tab-close-all': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      acquireLock();
      try {
        const realTabs = getTabList(session);
        for (let i = realTabs.length - 1; i >= 1; i--) {
          runPwCli([`-s=${session}`, 'tab-close', String(realTabs[i].index)]);
        }
        clearTabsState();
        const remaining = getTabList(session);
        if (remaining.length > 0) {
          saveTabsState({ tabs: { default: { index: 0, url: remaining[0].url } }, current: 'default' });
        }
        console.log('[browser] All tabs closed except the first one.');
      } finally {
        releaseLock();
      }
      return;
    }

    case 'tab-list': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }

      const synced = syncTabsState(session);

      if (flags.json) {
        const realTabs = synced.realTabs;
        const output = realTabs.map((t) => {
          let name = null;
          for (const [n, info] of Object.entries(synced.tabs)) {
            if (info.index === t.index) { name = n; break; }
          }
          return { index: t.index, name, url: t.url, current: t.current };
        });
        console.log(JSON.stringify({ tabs: output, current: synced.current }, null, 2));
      } else {
        const realTabs = synced.realTabs;
        if (realTabs.length === 0) {
          console.log('No tabs open.');
          return;
        }
        console.log('Tabs:');
        for (const tab of realTabs) {
          let name = '(unnamed)';
          for (const [n, info] of Object.entries(synced.tabs)) {
            if (info.index === tab.index) { name = n; break; }
          }
          const cur = tab.current ? ' (current)' : '';
          console.log(`  ${tab.index}: ${name}${cur} — ${tab.url}`);
        }
      }
      return;
    }

    case 'list': {
      runPwCli(['list']);
      return;
    }

    case 'who': {
      const holders = refcountList();
      if (holders.length === 0) {
        console.log('No attached agents currently active.');
      } else {
        console.log(`Active attached agents (${holders.length}):`);
        for (const h of holders) {
          console.log(`  session '${h.session}' (attached to '${h.parent}', since ${h.since})`);
        }
      }
      return;
    }

    case 'status': {
      const mode = getBrowserMode();
      const sessions = getActiveSessions();
      const tabsState = loadTabsState();
      const sessionState = loadSessionState();
      const holders = refcountList();
      const output = {
        browser_mode: mode || '(not set, default: headless)',
        config_file: fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : '(not found)',
        active_sessions: sessions,
        profile: PROFILE_DIR,
        tabs: tabsState.tabs,
        current_tab: tabsState.current,
        session_state: sessionState.sessions,
        active_agents: holders,
        active_agent_count: holders.length,
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    case 'save-state': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      const filename = options.filename || AUTH_STATE_PATH;
      try {
        runPwCli([`-s=${session}`, 'state-save', filename]);
        console.log(`[browser] Auth state saved to ${filename}.`);
      } catch (e) {
        fail(`Failed to save state: ${e.message}`);
      }
      return;
    }

    case 'load-state': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      const filename = options.filename || AUTH_STATE_PATH;
      if (!fs.existsSync(filename)) {
        fail(`Auth state file not found: ${filename}. Run 'save-state' after login first.`);
      }
      try {
        runPwCli([`-s=${session}`, 'state-load', filename]);
        console.log(`[browser] Auth state loaded from ${filename}.`);
      } catch (e) {
        fail(`Failed to load state: ${e.message}`);
      }
      return;
    }

    case 'dashboard': {
      try {
        runPwCli(['show']);
      } catch (e) {
        fail(`Failed to open dashboard: ${e.message}`);
      }
      return;
    }

    case 'trace-start': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      runPwCli([`-s=${session}`, 'tracing-start']);
      return;
    }

    case 'trace-stop': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      runPwCli([`-s=${session}`, 'tracing-stop']);
      return;
    }

    case 'video-start': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      const pwArgs = [`-s=${session}`, 'video-start'];
      if (options.filename) pwArgs.push(options.filename);
      runPwCli(pwArgs);
      return;
    }

    case 'video-stop': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      runPwCli([`-s=${session}`, 'video-stop']);
      return;
    }

    case 'console': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      const level = positionals[0] || 'warning';
      const validLevels = ['error', 'warning', 'info', 'debug'];
      if (!validLevels.includes(level)) {
        fail(`Invalid console level: ${level}. Valid: ${validLevels.join(', ')}.`);
      }
      runPwCli([`-s=${session}`, 'console', level]);
      return;
    }

    case 'requests': {
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      runPwCli([`-s=${session}`, 'requests']);
      return;
    }

    case 'request': {
      const index = positionals[0];
      if (index === undefined) fail('request requires an index: node scripts/browser.js request <index>');
      const sessionName = options.session || 'default';
      const session = getHealthySession(sessionName);
      if (!session) {
        fail(`No active session '${sessionName}'. Run 'open' first.`);
      }
      runPwCli([`-s=${session}`, 'request', index]);
      return;
    }

    default:
      fail(`Unknown command: ${command}. Run --help for usage.`);
  }
}

process.on('exit', () => {
  removeLock();
});
process.on('SIGINT', () => {
  removeLock();
  process.exit(130);
});
process.on('SIGTERM', () => {
  removeLock();
  process.exit(143);
});

main();
