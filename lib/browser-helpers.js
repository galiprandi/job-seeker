/**
 * browser-helpers.js — Shared browser operation helpers.
 *
 * Extracted from the 6 scripts that duplicated the same wrappers.
 * Key design decisions based on baseline experiment findings:
 *
 * 1. eval() is the primary interaction method (not ref-based clicks).
 *    Refs don't persist between separate playwright-cli calls.
 *    Click-by-text via eval is more robust.
 * 2. snapshot() reads the YAML file that `open`/`goto` auto-generates,
 *    not just `exec snapshot` (which fails when session is briefly busy).
 * 3. waitFor() uses in-page polling Promises instead of shell sleeps,
 *    which kill the daemon session.
 * 4. All helpers accept an optional session/tab name for parallel work.
 */

'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BROWSER_JS = path.join(REPO_ROOT, 'scripts', 'browser.js');
const SNAPSHOT_DIR = path.join(REPO_ROOT, '.playwright-cli');

// --- core exec ---

/**
 * Run a command, return stdout. Never throws (returns e.stdout on error).
 */
function run(cmd, timeout = 30000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, cwd: REPO_ROOT });
  } catch (e) {
    return e.stdout || e.message || '';
  }
}

/**
 * Run browser.js with args. Returns stdout.
 */
function browser(args, timeout = 30000) {
  return run(`node "${BROWSER_JS}" ${args}`, timeout);
}

// --- navigation ---

/**
 * Navigate to a URL. Uses the wrapper (Gold Rule 10).
 * @param {string} url
 * @param {object} opts - { session, tab }
 */
function goto(url, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  return browser(`goto "${url}" ${session} ${tab}`.trim(), 30000);
}

/**
 * Open the browser to a URL. Uses the wrapper (Gold Rule 10).
 * @param {string} url
 * @param {object} opts - { headed, session }
 */
function openBrowser(url, opts = {}) {
  const headed = opts.headed ? '--headed' : '--headless';
  const session = opts.session ? `--session ${opts.session}` : '';
  return browser(`open "${url}" ${headed} ${session}`.trim(), 30000);
}

/**
 * Ensure a session is alive. If not, returns false (caller should open).
 */
function ensure(opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const result = browser(`ensure ${session}`.trim(), 15000);
  return result.includes('active and healthy');
}

// --- snapshot ---

/**
 * Take a snapshot via exec. Returns the YAML text.
 * @param {object} opts - { session, tab }
 */
function snapshot(opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  return browser(`exec snapshot ${session} ${tab}`.trim(), 20000);
}

/**
 * Read the latest snapshot file from .playwright-cli/.
 * Fallback when exec snapshot fails (session briefly busy).
 * @returns {string} YAML content of the most recent snapshot
 */
function readLatestSnapshot() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return '';
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith('page-') && f.endsWith('.yml'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return '';
  return fs.readFileSync(path.join(SNAPSHOT_DIR, files[0].name), 'utf8');
}

/**
 * Best-effort snapshot: try exec first, fall back to reading the file.
 */
function snapshotReliable(opts = {}) {
  const snap = snapshot(opts);
  if (snap && snap.includes('ref=') && snap.length > 100) return snap;
  return readLatestSnapshot();
}

// --- eval (the workhorse) ---

/**
 * Evaluate JS in the page. Returns the result string or null.
 * Parses the "### Result" line from playwright-cli output.
 * @param {string} code - JS code to evaluate
 * @param {object} opts - { session, tab }
 * @returns {string|null}
 */
function evalJS(code, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  const escaped = code.replace(/'/g, "'\\''");
  const result = browser(`exec eval '${escaped}' ${session} ${tab}`.trim(), 20000);
  const match = result.match(/### Result\n(.+)/);
  return match ? match[1].replace(/^"|"$/g, '').trim() : null;
}

/**
 * Evaluate JS and parse the result as JSON.
 * playwright-cli returns the ### Result line as a JSON-encoded string, so a
 * JSON.stringify() return value is double-encoded (e.g. "{\"a\":\"b\"}").
 * evalJS only strips the outer quotes, leaving escaped inner quotes that
 * break JSON.parse. Here we parse the raw result line directly to unescape,
 * then parse the inner JSON.
 * @returns {any|null}
 */
function evalJSON(code, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  const escaped = code.replace(/'/g, "'\\''");
  const result = browser(`exec eval '${escaped}' ${session} ${tab}`.trim(), 20000);
  const match = result.match(/### Result\n(.+)/);
  if (!match) return null;
  const raw = match[1].trim();
  if (raw === 'undefined' || raw === 'null') return null;
  try {
    // First parse unescapes the JSON-encoded string value; second parse
    // turns the inner JSON string into the final object/array.
    const inner = JSON.parse(raw);
    return typeof inner === 'string' ? JSON.parse(inner) : inner;
  } catch {
    // Fallback: try parsing the raw line directly (non-double-encoded case)
    try { return JSON.parse(raw); } catch { return null; }
  }
}

// --- ref-based operations (use with caution, refs don't persist) ---

/**
 * Click a ref. Note: refs are per-snapshot and don't persist between calls.
 * Prefer clickByText() or evalJS-based clicks.
 */
function clickRef(ref, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  return browser(`exec click ${ref} ${session} ${tab}`.trim(), 15000);
}

/**
 * Type text into the currently focused element.
 */
function typeText(text, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  const escaped = text.replace(/'/g, "'\\''");
  return browser(`exec type '${escaped}' ${session} ${tab}`.trim(), 120000);
}

/**
 * Press a keyboard key.
 */
function pressKey(key, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  return browser(`exec press ${key} ${session} ${tab}`.trim(), 10000);
}

// --- robust interaction patterns (from baseline experiment) ---

/**
 * Click an element by text content using eval.
 * More robust than ref-based clicks (refs don't persist between CLI calls).
 * @param {string} selector - CSS selector to search within
 * @param {string} text - text to match
 * @param {object} opts - { session, tab }
 * @returns {boolean} true if clicked
 */
function clickByText(selector, text, opts = {}) {
  const code = `(function(){
    const els = document.querySelectorAll('${selector}');
    for (const el of els) {
      if (el.textContent.includes('${text.replace(/'/g, "\\'")}')) {
        el.click();
        return 'clicked';
      }
    }
    return 'not_found';
  })()`;
  return evalJS(code, opts) === 'clicked';
}

/**
 * Wait for a condition by polling the page with eval.
 * Uses in-page Promise polling (not shell sleep, which kills the daemon).
 * @param {string} conditionCode - JS that returns truthy when condition is met
 * @param {object} opts - { timeout: 10000, interval: 500, session, tab }
 * @returns {boolean} true if condition was met
 */
function waitFor(conditionCode, opts = {}) {
  const timeout = opts.timeout || 10000;
  const interval = opts.interval || 500;
  const code = `(async function(){
    const start = Date.now();
    while (Date.now() - start < ${timeout}) {
      try {
        const result = ${conditionCode};
        if (result) return JSON.stringify(result);
      } catch(e) {}
      await new Promise(r => setTimeout(r, ${interval}));
    }
    return 'timeout';
  })()`;
  const result = evalJS(code, opts);
  return result && result !== 'timeout';
}

/**
 * Wait for a selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {object} opts - { timeout, session, tab }
 */
function waitForSelector(selector, opts = {}) {
  return waitFor(`document.querySelector('${selector}')`, opts);
}

/**
 * Wait for text to appear in the page body.
 * @param {string} text - text to wait for
 * @param {object} opts - { timeout, session, tab }
 */
function waitForText(text, opts = {}) {
  const escaped = text.replace(/'/g, "\\'");
  return waitFor(`document.body.innerText.includes('${escaped}')`, opts);
}

// --- modal handling ---

/**
 * Dismiss common modals: beforeunload, cookie consent, popups.
 * Should be called once after navigation.
 * Uses eval to handle dialogs and click consent buttons.
 */
function dismissModals(opts = {}) {
  // Handle beforeunload and other dialogs via eval
  // Note: playwright-cli doesn't expose page.on('dialog'), so we
  // inject a window.onbeforeunload handler that returns null
  evalJS(`window.onbeforeunload = null; 'done'`, opts);

  // Try clicking common cookie consent buttons
  const consentSelectors = [
    'button#onetrust-accept-btn-handler',
    'button[aria-label="Accept cookies"]',
    'button[aria-label="Aceptar cookies"]',
    'button[aria-label="Accept all"]',
    'button[aria-label="Aceptar todo"]',
    'button:has-text("Accept all")',
  ];
  for (const sel of consentSelectors) {
    clickByText(sel.split(':')[0], sel.includes('text') ? sel.match(/"(.+)"/)?.[1] || '' : '', opts);
  }
}

// --- DB helpers ---

/**
 * Query the DB. Returns parsed JSON array.
 */
function dbQuery(sql) {
  try {
    return JSON.parse(run(`node scripts/db.js "${sql.replace(/"/g, '\\"')}"`, 15000));
  } catch { return []; }
}

/**
 * Write to the DB.
 */
function dbWrite(sql) {
  try {
    return JSON.parse(run(`node scripts/db.js --write "${sql.replace(/"/g, '\\"')}"`, 15000));
  } catch { return null; }
}

// --- snapshot parsing ---

/**
 * Find a ref by text in a snapshot.
 * @param {string} snap - snapshot YAML
 * @param {string} text - text to search for
 * @returns {string|null} ref or null
 */
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

/**
 * Find a ref by regex pattern in a snapshot.
 * @param {string} snap - snapshot YAML
 * @param {RegExp} pattern - regex to match
 * @returns {string|null} ref or null
 */
function findRefByPattern(snap, pattern) {
  const match = snap.match(pattern);
  return match ? match[1] : null;
}

// --- utilities ---

/**
 * Sleep. WARNING: this kills the daemon session if used between browser calls.
 * Prefer waitFor() with in-page polling.
 */
function sleep(ms) {
  execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 });
}

/**
 * Take a screenshot.
 */
function screenshot(name, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  return browser(`exec screenshot --filename ${name} ${session} ${tab}`.trim(), 15000);
}

// --- atomic operations (prevent session death between calls) ---

/**
 * Open a browser and run an eval in a single chained shell command.
 * This prevents session death between open and eval (Rule 6 + chaining pattern).
 * @param {string} url - URL to open
 * @param {string} evalCode - JS code to run after open
 * @param {object} opts - { session, headed, timeout }
 * @returns {string|null} eval result
 */
function openAndEval(url, evalCode, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const headed = opts.headed ? '--headed' : '--headless';
  const escaped = evalCode.replace(/'/g, "'\\''");
  const cmd = `node "${BROWSER_JS}" open "${url}" ${headed} ${session} && node "${BROWSER_JS}" exec eval '${escaped}' ${session}`;
  const result = run(cmd, opts.timeout || 30000);
  const match = result.match(/### Result\n(.+)/);
  return match ? match[1].replace(/^"|"$/g, '').trim() : null;
}

/**
 * Open a browser and run an eval that returns JSON, in a single chained command.
 * Parses the raw ### Result line directly (not via openAndEval, which strips
 * outer quotes and corrupts double-encoded JSON strings).
 * @returns {any|null}
 */
function openAndEvalJSON(url, evalCode, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const headed = opts.headed ? '--headed' : '--headless';
  const escaped = evalCode.replace(/'/g, "'\\''");
  const cmd = `node "${BROWSER_JS}" open "${url}" ${headed} ${session} && node "${BROWSER_JS}" exec eval '${escaped}' ${session}`;
  const result = run(cmd, opts.timeout || 30000);
  const match = result.match(/### Result\n(.+)/);
  if (!match) return null;
  const raw = match[1].trim();
  if (raw === 'undefined' || raw === 'null') return null;
  try {
    const inner = JSON.parse(raw);
    return typeof inner === 'string' ? JSON.parse(inner) : inner;
  } catch {
    try { return JSON.parse(raw); } catch { return null; }
  }
}

/**
 * Navigate and run an eval in a single chained command.
 * Use this when the browser is already open but you need to navigate + extract
 * without risking session death between goto and eval.
 * @returns {string|null} eval result
 */
function gotoAndEval(url, evalCode, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  const escaped = evalCode.replace(/'/g, "'\\''");
  const cmd = `node "${BROWSER_JS}" goto "${url}" ${session} ${tab} && node "${BROWSER_JS}" exec eval '${escaped}' ${session} ${tab}`;
  const result = run(cmd, opts.timeout || 30000);
  const match = result.match(/### Result\n(.+)/);
  return match ? match[1].replace(/^"|"$/g, '').trim() : null;
}

/**
 * Navigate and run an eval that returns JSON, in a single chained command.
 * Parses the raw ### Result line directly (not via gotoAndEval, which strips
 * outer quotes and corrupts double-encoded JSON strings).
 * @returns {any|null}
 */
function gotoAndEvalJSON(url, evalCode, opts = {}) {
  const session = opts.session ? `--session ${opts.session}` : '';
  const tab = opts.tab ? `--tab ${opts.tab}` : '';
  const escaped = evalCode.replace(/'/g, "'\\''");
  const cmd = `node "${BROWSER_JS}" goto "${url}" ${session} ${tab} && node "${BROWSER_JS}" exec eval '${escaped}' ${session} ${tab}`;
  const result = run(cmd, opts.timeout || 30000);
  const match = result.match(/### Result\n(.+)/);
  if (!match) return null;
  const raw = match[1].trim();
  if (raw === 'undefined' || raw === 'null') return null;
  try {
    const inner = JSON.parse(raw);
    return typeof inner === 'string' ? JSON.parse(inner) : inner;
  } catch {
    try { return JSON.parse(raw); } catch { return null; }
  }
}

module.exports = {
  run, browser,
  goto, openBrowser, ensure,
  snapshot, readLatestSnapshot, snapshotReliable,
  evalJS, evalJSON,
  clickRef, typeText, pressKey,
  clickByText,
  waitFor, waitForSelector, waitForText,
  dismissModals,
  dbQuery, dbWrite,
  findRef, findRefByPattern,
  sleep, screenshot,
  openAndEval, openAndEvalJSON,
  gotoAndEval, gotoAndEvalJSON,
};
