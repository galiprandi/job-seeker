#!/usr/bin/env node
/**
 * helper.js — Fast path to a running playwright-cli session daemon.
 *
 * playwright-cli sessions are backed by a per-session daemon reachable over a
 * unix socket using newline-delimited JSON RPC. Each `playwright-cli` CLI call
 * pays ~3-4s in node spawn + module loading; talking to the socket directly
 * costs ~500ms (the actual page work) with zero playwright-cli internals.
 *
 * Session resolution mirrors playwright-cli exactly:
 *   cwd → nearest ancestor dir containing `.playwright` → workspaceDir
 *   session file: <daemonDir>/<hash>/<name>.session (JSON, has socketPath)
 *   daemonDir: $PWTEST_DAEMON_SESSION_DIR || $XDG_CACHE_HOME||~/.cache
 *              /ms-playwright/daemon
 * We scan the daemon dir and match by workspaceDir + session name instead of
 * recomputing the hash — simpler and tolerant of version differences.
 *
 * Isolation is unchanged: the socket only exists for sessions opened through
 * the wrapper (which forces --profile=.browser-profile), so the per-repo
 * browser profile remains the security boundary.
 *
 * Usage:
 *   node helper.js exec <cmd> [args...] [--tab <name>] [--timeout ms]
 *     — runs a playwright-cli command against the active session. Prints the
 *       daemon's result text to stdout; exits 1 on daemon-reported errors.
 *   node helper.js wait-dom [--quiet ms] [--timeout ms]
 *     — resolves when the DOM stops mutating (MutationObserver quiet window).
 *   node helper.js status
 *     — prints resolved session + socket liveness.
 *
 * Exit codes: 0 ok · 1 command/daemon error · 2 no session / socket unreachable
 */

'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TIMEOUT_MS = 30000;
const CONNECT_TIMEOUT_MS = 1500;

// --- session discovery (mirrors playwright-core cli-client/registry.js) ---

function findWorkspaceDir(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.playwright'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function baseDaemonDir() {
  if (process.env.PWTEST_DAEMON_SESSION_DIR) return process.env.PWTEST_DAEMON_SESSION_DIR;
  let localCacheDir;
  if (process.platform === 'linux') localCacheDir = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  if (process.platform === 'darwin') localCacheDir = path.join(os.homedir(), 'Library', 'Caches');
  if (process.platform === 'win32') localCacheDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  if (!localCacheDir) throw new Error('Unsupported platform: ' + process.platform);
  return path.join(localCacheDir, 'ms-playwright', 'daemon');
}

function listSessions() {
  const daemonDir = baseDaemonDir();
  const out = [];
  let hashDirs;
  try { hashDirs = fs.readdirSync(daemonDir); } catch { return out; }
  for (const hashDir of hashDirs) {
    const dir = path.join(daemonDir, hashDir);
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.session')) continue;
      try {
        const config = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        if (!config.name) config.name = path.basename(file, '.session');
        out.push(config);
      } catch {}
    }
  }
  return out;
}

/** Locate the installed playwright-cli package dir (null if not found). PATH scan, no spawn. */
function cliPackageDir() {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    try {
      const bin = path.join(dir, 'playwright-cli');
      if (fs.existsSync(bin)) return path.dirname(fs.realpathSync(bin));
    } catch {}
  }
  return null;
}

/**
 * Version of playwright-core bundled with the installed playwright-cli,
 * read from its package.json (no spawn). The session daemon's `version`
 * field is the playwright-core version that spawned it.
 */
function coreVersion() {
  const dir = cliPackageDir();
  if (!dir) return null;
  try {
    const pkg = path.join(dir, 'node_modules', 'playwright-core', 'package.json');
    return JSON.parse(fs.readFileSync(pkg, 'utf8')).version || null;
  } catch { return null; }
}

/** major.minor equality — the daemon socket protocol may change between minors. */
function sameMinor(a, b) {
  const pa = String(a || '').split('.'), pb = String(b || '').split('.');
  return pa[0] === pb[0] && pa[1] === pb[1];
}

/**
 * Resolve the session config for (cwd, name). Same-workspace sessions only.
 * With an explicit name (or PLAYWRIGHT_CLI_SESSION), match that name.
 * Otherwise prefer 'default', then newest by timestamp.
 * Sessions created by a different playwright-core minor version are skipped:
 * the daemon speaks that version's internal protocol, and the real CLI would
 * restart an incompatible daemon anyway.
 */
function resolveSession(cwd, sessionName) {
  const workspaceDir = findWorkspaceDir(cwd);
  const name = sessionName || process.env.PLAYWRIGHT_CLI_SESSION || null;
  const version = coreVersion();
  const sessions = listSessions()
    .filter(c => (c.workspaceDir || null) === (workspaceDir || null))
    .filter(c => !version || !c.version || sameMinor(c.version, version))
    // Stale .session files persist after close; the socket file must exist.
    .filter(c => c.socketPath && fs.existsSync(c.socketPath))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  if (name) return sessions.find(c => c.name === name) || null;
  return sessions.find(c => c.name === 'default') || sessions[0] || null;
}

// --- newline-JSON socket RPC ---

let nextId = 1;

function rpc(socketPath, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const socket = net.createConnection(socketPath);
    let buf = '';
    let settled = false;
    const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); socket.destroy(); fn(v); } };
    const timer = setTimeout(() => finish(reject, new Error('timeout')), timeoutMs);
    const connectTimer = setTimeout(() => finish(reject, new Error('connect timeout')), CONNECT_TIMEOUT_MS);
    socket.on('connect', () => {
      clearTimeout(connectTimer);
      socket.write(JSON.stringify({ id, method, params }) + '\n');
    });
    socket.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === id) {
          if (msg.error) finish(reject, new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)));
          else finish(resolve, msg.result);
          return;
        }
      }
    });
    socket.on('error', e => finish(reject, e));
    socket.on('close', () => finish(reject, new Error('socket closed')));
  });
}

/**
 * Run a playwright-cli command on a session. args = minimist-shaped object
 * ({_: [cmd, ...positionals], flag: value}). Returns {text, isError}.
 */
async function runCommand(sessionConfig, args, cwd, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return await rpc(sessionConfig.socketPath, 'run', { args, cwd }, timeoutMs);
}

// Flag types from playwright-cli's help.json (playwright-core cli-client).
// String flags consume the next token as value; boolean flags don't.
// Prefer the installed playwright-cli's help.json (self-heals on upgrades);
// the static table is the fallback.
const STRING_FLAGS_STATIC = new Set(('browser config device profile cdp endpoint extension session modifiers ' +
  'path data filename depth regex type domain expires sameSite filter status body content-type ' +
  'header remove-header skills size description duration position cursor port host style').split(' '));

let _stringFlags = null;
function stringFlags() {
  if (_stringFlags) return _stringFlags;
  _stringFlags = STRING_FLAGS_STATIC;
  try {
    // playwright-cli bin → realpath → <pkg>/playwright-cli.js → playwright-core help.json
    const cliPkgDir = cliPackageDir();
    if (!cliPkgDir) return _stringFlags;
    const helpPath = path.join(cliPkgDir, 'node_modules', 'playwright-core', 'lib', 'tools', 'cli-client', 'help.json');
    const help = JSON.parse(fs.readFileSync(helpPath, 'utf8'));
    const strs = new Set();
    for (const c of Object.values(help.commands || {})) {
      for (const [k, v] of Object.entries(c.flags || {})) if (v === 'string') strs.add(k);
    }
    if (strs.size) _stringFlags = strs;
  } catch {}
  return _stringFlags;
}

/** Convert raw CLI tokens into the minimist-shaped args object the daemon expects. */
function buildArgs(tokens) {
  const args = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') { args._.push(...tokens.slice(i + 1)); break; }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      if (eq > 0) { args[t.slice(2, eq)] = t.slice(eq + 1); continue; }
      const key = t.slice(2);
      if (key.startsWith('no-')) { args[key.slice(3)] = false; continue; }
      if (stringFlags().has(key) && i + 1 < tokens.length) { args[key] = tokens[++i]; continue; }
      args[key] = true;
      continue;
    }
    args._.push(t);
  }
  return args;
}

/**
 * Extract the value from a daemon eval result text.
 * Daemon output wraps results as: ### Result\n"<json-escaped>"\n### Ran ...
 * Returns the inner value (e.g. clean JSON), or null if not parseable.
 */
function extractResultValue(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/### Result\n([\s\S]*?)\n### /);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1]; }
}

// --- wait-dom: in-page MutationObserver quiet window ---

const WAIT_DOM_JS = (quietMs, maxMs) => `(async () => {
  const quiet = ${quietMs}, max = ${maxMs};
  return await new Promise(resolve => {
    let timer = null;
    const t0 = Date.now();
    const done = why => { obs.disconnect(); resolve(JSON.stringify({ settled: why, elapsed_ms: Date.now() - t0 })); };
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => done('quiet'), quiet);
      if (Date.now() - t0 > max) done('max-wait');
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(() => done('quiet'), quiet);
    setTimeout(() => done('max-wait'), max);
  });
})()`;

// --- wait-for: poll until selector/text/predicate matches ---

/**
 * target forms:
 *   css=<selector>  → element present and visible
 *   text=<string>   → substring present in body innerText (case-insensitive)
 *   js=<expression> → expression evaluates truthy
 */
const WAIT_FOR_JS = (target, timeoutMs) => `(async () => {
  const target = ${JSON.stringify(target)}, timeout = ${timeoutMs};
  const t0 = Date.now();
  const m = target.match(/^(css|text|js)=(.*)$/s);
  const kind = m ? m[1] : 'css', val = m ? m[2] : target;
  const check = () => {
    if (kind === 'css') { for (const el of document.querySelectorAll(val)) { if (el.offsetParent !== null || el.getClientRects().length) return true; } return false; }
    if (kind === 'text') return document.body && document.body.innerText.toLowerCase().includes(val.toLowerCase());
    try { return !!eval('(' + val + ')')(); } catch { return false; }
  };
  while (Date.now() - t0 < timeout) {
    if (check()) return JSON.stringify({ found: true, kind, elapsed_ms: Date.now() - t0 });
    await new Promise(r => setTimeout(r, 100));
  }
  return JSON.stringify({ found: false, kind, elapsed_ms: Date.now() - t0, timeout: true });
})()`;

// --- observe: compact page state for agent decision-making ---

const OBSERVE_JS = `(() => {
  const SEL = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"],[contenteditable=""],summary,[onclick]';
  const vh = innerHeight;
  const visible = el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const distToViewport = r => r.top >= 0 && r.top < vh ? 0 : r.top < 0 ? -r.top : r.top - vh;
  const label = el => (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.name || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const els = [...document.querySelectorAll(SEL)].filter(visible)
    .map(el => ({ el, d: distToViewport(el.getBoundingClientRect()) }))
    .sort((a, b) => a.d - b.d).slice(0, 50)
    .map(({ el }, i) => {
      const t = { id: 'el' + i, tag: el.tagName.toLowerCase(), text: label(el) };
      const role = el.getAttribute('role'); if (role) t.role = role;
      if (el.tagName === 'A') t.href = (el.getAttribute('href') || '').slice(0, 80);
      if (el.tagName === 'INPUT') { t.type = el.type; if (el.getAttribute('placeholder')) t.ph = el.getAttribute('placeholder').slice(0, 40); }
      return t;
    });
  const alerts = [...document.querySelectorAll('[role="alert"],[aria-live="polite"],[aria-live="assertive"],.toast,[class*="toast"],[class*="notification-banner"]')]
    .filter(visible).map(el => (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 120)).filter(Boolean).slice(0, 5);
  return JSON.stringify({
    url: location.href, title: document.title,
    h1: (document.querySelector('h1') || {}).innerText?.trim().slice(0, 120) || null,
    scroll: { y: Math.round(scrollY), height: document.documentElement.scrollHeight },
    elements: els, alerts,
  }, null, 0);
})()`;

/** Run several commands sequentially on the same session. Stops on first error unless continueOnError. */
async function runBatch(sessionConfig, commands, cwd, { timeoutMs = DEFAULT_TIMEOUT_MS, continueOnError = false } = {}) {
  const results = [];
  for (let i = 0; i < commands.length; i++) {
    const tokens = commands[i];
    if (!Array.isArray(tokens) || !tokens.length) {
      results.push({ i, ok: false, error: 'invalid command (expected [cmd, ...args])' });
      if (!continueOnError) break;
      continue;
    }
    const t0 = Date.now();
    try {
      const r = await runCommand(sessionConfig, buildArgs(tokens.map(String)), cwd, timeoutMs);
      const text = typeof r === 'string' ? r : (r && r.text) || '';
      results.push({ i, ok: !(r && r.isError), ms: Date.now() - t0, text });
      if (r && r.isError && !continueOnError) break;
    } catch (e) {
      results.push({ i, ok: false, ms: Date.now() - t0, error: e.message });
      if (!continueOnError) break;
    }
  }
  return results;
}

// --- CLI ---

function parseExecArgs(argv) {
  const positionals = [];
  const opts = { tab: null, timeout: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tab') opts.tab = argv[++i];
    else if (a === '--timeout') opts.timeout = parseInt(argv[++i], 10) || DEFAULT_TIMEOUT_MS;
    else if (a === '--quiet') opts.quiet = parseInt(argv[++i], 10);
    else positionals.push(a);
  }
  return { positionals, opts };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();

  if (!command || command === '-h' || command === '--help') {
    console.log('helper.js — fast socket path to playwright-cli session daemon\n');
    console.log('  node helper.js exec <cmd> [args...] [--tab <name>] [--timeout ms]');
    console.log('  node helper.js wait-dom [--quiet ms] [--timeout ms]');
    console.log('  node helper.js wait-for <css=sel|text=str|js=expr> [--timeout ms]');
    console.log('  node helper.js observe');
    console.log('  echo \'[["eval","(() => 1)()"]]\' | node helper.js batch');
    console.log('  node helper.js status');
    return;
  }

  if (command === 'status') {
    const session = resolveSession(cwd, null);
    if (!session) { console.log('no session for this workspace'); process.exit(2); }
    try {
      const r = await runCommand(session, { _: ['eval', '(() => location.href)()'] }, cwd, 5000);
      console.log(`session '${session.name}' alive on ${session.socketPath}`);
      console.log(r.text);
    } catch (e) {
      console.log(`session '${session.name}' socket unreachable: ${e.message}`);
      process.exit(2);
    }
    return;
  }

  const session = resolveSession(cwd, null);
  if (!session) {
    console.error('[helper] no active playwright-cli session for this workspace. Open one via browser.js first.');
    process.exit(2);
  }

  if (command === 'wait-for') {
    const { positionals, opts } = parseExecArgs(rest);
    const target = positionals[0];
    if (!target) { console.error('[helper] wait-for requires a target: css=<sel> | text=<str> | js=<expr>'); process.exit(2); }
    const timeout = opts.timeout ?? 10000;
    const r = await runCommand(session, { _: ['eval', WAIT_FOR_JS(target, timeout)] }, cwd, timeout + 15000);
    const text = extractResultValue(r && r.text) ?? (typeof r === 'string' ? r : r.text ?? '');
    process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    if (r && r.isError) process.exitCode = 1;
    else if (/found\\?":\s*false|["']?found["']?:\s*false/.test(text)) process.exitCode = 1;
    return;
  }

  if (command === 'observe') {
    const r = await runCommand(session, { _: ['eval', OBSERVE_JS] }, cwd);
    const text = extractResultValue(r && r.text) ?? (typeof r === 'string' ? r : r.text ?? '');
    process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    if (r && r.isError) process.exitCode = 1;
    return;
  }

  if (command === 'batch') {
    // JSON from file arg or stdin: [["eval","(() => 1)()"],["find","x"]] or {commands, continueOnError}
    let input = rest[0] && fs.existsSync(rest[0]) ? fs.readFileSync(rest[0], 'utf8') : '';
    if (!input) input = fs.readFileSync(0, 'utf8');
    const spec = JSON.parse(input);
    const commands = Array.isArray(spec) ? spec : spec.commands;
    const results = await runBatch(session, commands, cwd, { continueOnError: !!(spec && spec.continueOnError) });
    console.log(JSON.stringify(results, null, 2));
    if (results.some(r => !r.ok)) process.exitCode = 1;
    return;
  }

  if (command === 'wait-dom') {
    const { opts } = parseExecArgs(rest);
    const js = WAIT_DOM_JS(opts.quiet ?? 250, opts.timeout ?? 3000);
    const r = await runCommand(session, { _: ['eval', js] }, cwd, (opts.timeout ?? 3000) + 10000);
    const text = extractResultValue(r && r.text) ?? (typeof r === 'string' ? r : r.text ?? '');
    process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    if (r && r.isError) process.exitCode = 1;
    return;
  }

  if (command === 'exec') {
    const { positionals, opts } = parseExecArgs(rest);
    const [sub, ...args] = positionals;
    if (!sub) { console.error('[helper] exec requires a command'); process.exit(2); }
    try {
      if (opts.tab) {
        // tab state lives in the repo's .browser-profile/tabs.json
        const tabsPath = path.join(cwd, '.browser-profile', 'tabs.json');
        const tabs = JSON.parse(fs.readFileSync(tabsPath, 'utf8'));
        const tab = tabs.tabs[opts.tab];
        if (!tab) { console.error(`[helper] tab '${opts.tab}' not found`); process.exit(1); }
        await runCommand(session, { _: ['tab-select', String(tab.index)] }, cwd, opts.timeout);
      }
      const r = await runCommand(session, buildArgs([sub, ...args]), cwd, opts.timeout);
      const text = typeof r === 'string' ? r : r.text ?? '';
      process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
      if (r && r.isError) process.exitCode = 1;
    } catch (e) {
      console.error(`[helper] ${e.message}`);
      process.exit(1);
    }
    return;
  }

  console.error(`[helper] unknown command: ${command}`);
  process.exit(2);
}

if (require.main === module) main().catch(e => { console.error(`[helper] ${e.message}`); process.exit(1); });

module.exports = { resolveSession, runCommand, runBatch, buildArgs, findWorkspaceDir, listSessions, extractResultValue, WAIT_DOM_JS, WAIT_FOR_JS, OBSERVE_JS };
