/**
 * browser-helpers.js — Shared browser operation helpers (agent-browser backend).
 *
 * Extracted from the 6 scripts that duplicated the same wrappers.
 * Key design decisions:
 *
 * 1. eval() is the primary interaction method for scripts (ref-based clicks are
 *    for humans/agents following the semantic hierarchy — scripts prefer DOM
 *    reads via eval for stability).
 * 2. eval goes through `exec eval --json -b <base64>`: base64 avoids all shell
 *    escaping issues and --json gives a structured { success, data: { result } }
 *    envelope that parses cleanly.
 * 3. Snapshot output uses agent-browser format: lines like `@e12 [button] "Name"`.
 *    Refs are passed to click/fill as `@eN`. Refs survive while the node exists.
 * 4. All helpers accept { session, tab } for parallel work. Sessions are native
 *    agent-browser sessions (`--session <name>`); tabs are agent-browser labels
 *    switched via `exec tab <name>` before the command.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BROWSER_JS = fs.existsSync(path.join(REPO_ROOT, 'scripts', 'browser.js'))
  ? path.join(REPO_ROOT, 'scripts', 'browser.js')
  : path.join(REPO_ROOT, '.agents', 'skills', 'browser-automation', 'scripts', 'browser.js');

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

/**
 * Shell-safe single-quoting for inline args (paths, keys). JS code should use
 * base64 instead — see evalJS.
 */
function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * agent-browser global flags for a helper call.
 */
function globalFlags(opts = {}) {
  return opts.session ? ` --session ${opts.session}` : '';
}

/**
 * Run an agent-browser subcommand through `exec`, selecting the tab first when
 * opts.tab is set (`exec tab <label>` is the agent-browser-native way; the
 * wrapper's --tab flag only applies to the default session).
 */
function execSub(sub, opts = {}, timeout = 30000) {
  const sess = globalFlags(opts);
  if (opts.tab) browser(`exec tab ${sq(opts.tab)}${sess}`, 15000);
  return browser(`exec ${sub}${sess}`, timeout);
}

// --- navigation ---

/**
 * Navigate to a URL. Uses the wrapper (Gold Rule 10). Goes through
 * `exec navigate` so the --session flag is honored (wrapper `goto` does not
 * forward a session).
 * @param {string} url
 * @param {object} opts - { session, tab }
 */
function goto(url, opts = {}) {
  return execSub(`navigate ${sq(url)}`, opts, 30000);
}

/**
 * Open the browser to a URL. Uses the wrapper (Gold Rule 10).
 * `--headed`/`--headless` are forwarded by the wrapper's open command; the
 * session is selected via the AGENT_BROWSER_SESSION env on the child call
 * because wrapper `open` does not take a --session flag.
 * @param {string} url
 * @param {object} opts - { headed, session }
 */
function openBrowser(url, opts = {}) {
  const headed = opts.headed ? '--headed' : '--headless';
  const sess = opts.session ? `AGENT_BROWSER_SESSION=${opts.session} ` : '';
  return run(`${sess}node "${BROWSER_JS}" open ${sq(url)} ${headed}`, 60000);
}

/**
 * Ensure a session is alive. Returns true if the browser responds to eval.
 */
function ensure(opts = {}) {
  const out = execSub('eval --json "document.readyState"', opts, 15000);
  try {
    return JSON.parse(out).success === true;
  } catch {
    return out.includes('"success":true');
  }
}

// --- snapshot ---

/**
 * Take a snapshot via exec. Returns the agent-browser tree text
 * (lines like `@eN [role] "name"`). Pass opts.interactive for `-i`
 * (interactive elements only) and opts.urls to include link hrefs.
 * @param {object} opts - { session, tab, interactive, urls }
 */
function snapshot(opts = {}) {
  const flags = `${opts.interactive ? '-i ' : ''}${opts.urls ? '--urls ' : ''}`.trim();
  return execSub(`snapshot${flags ? ' ' + flags : ''}`, opts, 20000);
}

/**
 * Best-effort snapshot. Kept for API compatibility: agent-browser does not
 * write page-*.yml files, so this is just snapshot() now.
 */
function snapshotReliable(opts = {}) {
  return snapshot(opts);
}

/**
 * @deprecated agent-browser does not write snapshot files to disk. Returns ''.
 */
function readLatestSnapshot() {
  return '';
}

// --- eval (the workhorse) ---

/**
 * Parse the stdout of `eval --json`. Returns { ok, result } where result is
 * the raw JS value (data.result in the envelope).
 */
function parseEvalOutput(out) {
  try {
    const env = JSON.parse(out);
    if (env && env.success === true && env.data && 'result' in env.data) {
      return { ok: true, result: env.data.result };
    }
    if (env && env.success === false) return { ok: false, result: null };
  } catch { /* not JSON — fall through */ }
  // Fallbacks: legacy "### Result" block, or the last non-empty line.
  const m = out.match(/### Result\n([\s\S]*?)(?:\n###|$)/);
  if (m) {
    let raw = m[1].trim();
    try { raw = JSON.parse(raw); } catch { raw = raw.replace(/^"|"$/g, ''); }
    return { ok: true, result: raw };
  }
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (last === undefined) return { ok: false, result: null };
  try { return { ok: true, result: JSON.parse(last) }; } catch { return { ok: true, result: last }; }
}

/**
 * Evaluate JS in the page via `eval --json -b <base64>`.
 * @param {string} code - JS code to evaluate (IIFE/expression)
 * @param {object} opts - { session, tab }
 * @returns {string|null} strings are returned as-is, other values as text
 */
function evalJS(code, opts = {}) {
  const b64 = Buffer.from(code, 'utf8').toString('base64');
  const out = execSub(`eval --json -b ${sq(b64)}`, opts, 20000);
  const { ok, result } = parseEvalOutput(out);
  if (!ok || result === undefined || result === null) return null;
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/**
 * Evaluate JS and return the value parsed as JSON.
 * The agent-browser envelope already gives us the decoded value: objects are
 * returned directly, strings containing JSON are parsed once more.
 * @returns {any|null}
 */
function evalJSON(code, opts = {}) {
  const b64 = Buffer.from(code, 'utf8').toString('base64');
  const out = execSub(`eval --json -b ${sq(b64)}`, opts, 20000);
  const { ok, result } = parseEvalOutput(out);
  if (!ok || result === undefined || result === null) return null;
  if (typeof result === 'string') {
    try { return JSON.parse(result); } catch { return result; }
  }
  return result;
}

// --- interaction primitives ---

/**
 * Click an element: snapshot ref (@eN) or CSS selector.
 */
function clickRef(ref, opts = {}) {
  return execSub(`click ${sq(ref)}`, opts, 15000);
}

/**
 * Type text into the currently focused element (keyboard type).
 */
function typeText(text, opts = {}) {
  return execSub(`keyboard type ${sq(text)}`, opts, 120000);
}

/**
 * Press a key or chord. Maps legacy playwright key names to agent-browser
 * names (ControlOrMeta → Meta, Ctrl → Control).
 */
function pressKey(key, opts = {}) {
  const k = String(key).replace(/ControlOrMeta/g, 'Meta').replace(/\bCtrl\b/g, 'Control');
  return execSub(`press ${k}`, opts, 10000);
}

// --- robust interaction patterns ---

/**
 * Click an element by text content using eval.
 * @param {string} selector - CSS selector to search within
 * @param {string} text - text to match
 * @param {object} opts - { session, tab }
 * @returns {boolean} true if clicked
 */
function clickByText(selector, text, opts = {}) {
  const code = `(function(){
    const els = document.querySelectorAll(${JSON.stringify(selector)});
    for (const el of els) {
      if (el.textContent.includes(${JSON.stringify(text)})) {
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
 * Uses in-page Promise polling (not shell sleep).
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
  return result !== null && result !== 'timeout';
}

/**
 * Wait for a selector to appear in the DOM.
 */
function waitForSelector(selector, opts = {}) {
  return waitFor(`document.querySelector(${JSON.stringify(selector)})`, opts);
}

/**
 * Wait for text to appear in the page body.
 */
function waitForText(text, opts = {}) {
  return waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, opts);
}

// --- modal handling ---

/**
 * Dismiss common modals: beforeunload, cookie consent, popups.
 * Should be called once after navigation.
 */
function dismissModals(opts = {}) {
  evalJS(`window.onbeforeunload = null; 'done'`, opts);

  const consentSelectors = [
    'button#onetrust-accept-btn-handler',
    'button[aria-label="Accept cookies"]',
    'button[aria-label="Aceptar cookies"]',
    'button[aria-label="Accept all"]',
    'button[aria-label="Aceptar todo"]',
  ];
  for (const sel of consentSelectors) {
    evalJS(`(function(){const b=document.querySelector(${JSON.stringify(sel)});if(b){b.click();return 'clicked';}return 'none';})()`, opts);
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
 * Find a ref by text in a snapshot. Returns `@eN` (usable directly with
 * clickRef/click) or null. Handles the agent-browser line format
 * `@eN [role] "name"` and legacy `[ref=x]` lines.
 * @param {string} snap - snapshot text
 * @param {string} text - text to search for
 * @returns {string|null} ref like "@e12" or null
 */
function findRef(snap, text) {
  const lines = snap.split('\n');
  for (const line of lines) {
    if (line.includes(text) && !line.includes('disabled')) {
      const m = line.match(/@e(\d+)/) || line.match(/\[ref=(\w+)\]/);
      if (m) return m[0].startsWith('@') ? m[0] : `@e${m[1]}`;
    }
  }
  return null;
}

/**
 * Find a ref by regex pattern in a snapshot. The pattern's capture group must
 * capture the ref (with or without the @ prefix).
 * @returns {string|null} ref like "@e12" or null
 */
function findRefByPattern(snap, pattern) {
  const match = snap.match(pattern);
  if (!match) return null;
  const raw = match[1];
  return raw.startsWith('@') ? raw : `@e${raw}`;
}

// --- utilities ---

/**
 * Sleep. Prefer waitFor() with in-page polling.
 */
function sleep(ms) {
  execSync(`sleep ${ms / 1000}`, { timeout: ms + 1000 });
}

/**
 * Take a screenshot. agent-browser `screenshot [path]` — saved under
 * agent-browser.json screenshotDir when a bare filename is given.
 */
function screenshot(name, opts = {}) {
  return execSub(`screenshot ${sq(name)}`, opts, 15000);
}

// --- atomic operations ---

/**
 * Open a browser and run an eval in a single chained shell command.
 * @returns {string|null} eval result
 */
function openAndEval(url, evalCode, opts = {}) {
  const headed = opts.headed ? '--headed' : '--headless';
  const sessEnv = opts.session ? `AGENT_BROWSER_SESSION=${opts.session} ` : '';
  const b64 = Buffer.from(evalCode, 'utf8').toString('base64');
  const cmd = `${sessEnv}node "${BROWSER_JS}" open ${sq(url)} ${headed} && node "${BROWSER_JS}" exec eval --json -b ${sq(b64)}${opts.session ? ` --session ${opts.session}` : ''}`;
  const { ok, result } = parseEvalOutput(run(cmd, opts.timeout || 60000));
  if (!ok || result === undefined || result === null) return null;
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/**
 * Open a browser and run an eval that returns JSON, in a single chained command.
 * @returns {any|null}
 */
function openAndEvalJSON(url, evalCode, opts = {}) {
  const headed = opts.headed ? '--headed' : '--headless';
  const sessEnv = opts.session ? `AGENT_BROWSER_SESSION=${opts.session} ` : '';
  const b64 = Buffer.from(evalCode, 'utf8').toString('base64');
  const cmd = `${sessEnv}node "${BROWSER_JS}" open ${sq(url)} ${headed} && node "${BROWSER_JS}" exec eval --json -b ${sq(b64)}${opts.session ? ` --session ${opts.session}` : ''}`;
  const { ok, result } = parseEvalOutput(run(cmd, opts.timeout || 60000));
  if (!ok || result === undefined || result === null) return null;
  if (typeof result === 'string') {
    try { return JSON.parse(result); } catch { return result; }
  }
  return result;
}

/**
 * Navigate and run an eval in a single chained command.
 * @returns {string|null} eval result
 */
function gotoAndEval(url, evalCode, opts = {}) {
  goto(url, opts);
  const r = evalJS(evalCode, opts);
  return r;
}

/**
 * Navigate and run an eval that returns JSON, in a single chained command.
 * @returns {any|null}
 */
function gotoAndEvalJSON(url, evalCode, opts = {}) {
  goto(url, opts);
  return evalJSON(evalCode, opts);
}

module.exports = {
  REPO_ROOT, BROWSER_JS,
  run, browser, execSub, sq,
  goto, openBrowser, ensure,
  snapshot, snapshotReliable, readLatestSnapshot,
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
