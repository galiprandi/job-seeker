#!/usr/bin/env node
/**
 * browser.js — Safe browser wrapper for agents (agent-browser backend).
 *
 * Guarantees repo-scoped isolation: the Chrome profile (.browser-profile)
 * and the daemon namespace always resolve to the consuming repo's root,
 * so multiple agents on the same machine never share a browser session.
 * Auto-injects site guides when navigating to a documented site.
 *
 * Run in-place from the skill directory. Do NOT copy to the consuming repo.
 *
 * Requires: agent-browser installed globally (`npm i -g agent-browser`),
 * system Chrome, and --no-sandbox on AppArmor-restricted Ubuntu.
 *
 * Usage:
 *   node .agents/skills/browser-automation/scripts/browser.js open <url> [--headed|--headless]
 *   node .agents/skills/browser-automation/scripts/browser.js goto <url> [--tab <name>]
 *   node .agents/skills/browser-automation/scripts/browser.js tab-new <url> --name <name>
 *   node .agents/skills/browser-automation/scripts/browser.js exec <cmd> [args...] [--tab <name>]
 *   node .agents/skills/browser-automation/scripts/browser.js wait-dom [--timeout <ms>]
 *   node .agents/skills/browser-automation/scripts/browser.js close | close-all
 *   node .agents/skills/browser-automation/scripts/browser.js save-state <path> | load-state <path>
 *   node .agents/skills/browser-automation/scripts/browser.js status
 *   node .agents/skills/browser-automation/scripts/browser.js doctor
 *   node .agents/skills/browser-automation/scripts/browser.js guides
 *   node .agents/skills/browser-automation/scripts/browser.js contribute
 *   node .agents/skills/browser-automation/scripts/browser.js -h|--help
 *
 * Environment:
 *   BROWSER_DEBUG=1        Verbose logging to stderr.
 *   AGENT_BROWSER_*        Passed through (overrides wrapper defaults).
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = process.cwd();
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');
const CONFIG_PATH = path.join(REPO_ROOT, 'agent-browser.json');
const SITES_DIR = path.join(__dirname, '..', 'sites');
const CONFIG_TEMPLATE = path.join(__dirname, 'agent-browser.template.json');
const UPDATE_CACHE_PATH = path.join(os.homedir(), '.browser-automation', 'update-check.json');
const DEBUG = process.env.BROWSER_DEBUG === '1';
const UPDATE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly

// Binary resolution: AGENT_BROWSER_BIN > repo-local node_modules > global PATH > npx.
// Global install (npm i -g agent-browser) is optional — it only saves the npx
// lookup per call; the npm package ships the same prebuilt Rust binary.
let _abBin = null;
function abBin() {
  if (_abBin) return _abBin;
  if (process.env.AGENT_BROWSER_BIN) return (_abBin = [process.env.AGENT_BROWSER_BIN]);
  const local = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'agent-browser.cmd' : 'agent-browser');
  if (fs.existsSync(local)) return (_abBin = [local]);
  const probe = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!probe.error) return (_abBin = ['agent-browser']);
  _abBin = process.platform === 'win32' ? ['cmd.exe', '/d', '/s', '/c', 'npx', '-y', 'agent-browser']
                                      : ['npx', '-y', 'agent-browser'];
  return _abBin;
}

// Tracker/ad origins blocked on every `open` (migrated from playwright cli.config.json).
const BLOCKED_ORIGINS = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'facebook.com', 'connect.facebook.net', 'ads.linkedin.com',
  'px.ads.linkedin.com', 'snap.licdn.com', 'googleads.g.doubleclick.net',
  'amazon-adsystem.com', 'criteo.com', 'taboola.com', 'outbrain.com',
  'scorecardresearch.com', 'quantserve.com', 'hotjar.com',
  'mixpanel.com', 'segment.io', 'amplitude.com',
];

function debug(msg) { if (DEBUG) console.error(`[browser:debug] ${msg}`); }
function fail(msg, code = 1) { console.error(`[browser] ${msg}`); process.exit(code); }

function env() {
  const e = Object.assign({}, process.env);
  e.AGENT_BROWSER_CONFIG = e.AGENT_BROWSER_CONFIG || CONFIG_PATH;
  e.AGENT_BROWSER_ARGS = e.AGENT_BROWSER_ARGS || '--no-sandbox,--disable-blink-features=AutomationControlled';
  e.AGENT_BROWSER_PROFILE = e.AGENT_BROWSER_PROFILE || PROFILE_DIR;
  // Repo-scoped daemon isolation: without a namespace every repo shares
  // ~/.agent-browser/default.sock — the same collision class as the old
  // playwright-cli "default" daemon.
  e.AGENT_BROWSER_NAMESPACE = e.AGENT_BROWSER_NAMESPACE || path.basename(REPO_ROOT);
  if (!e.AGENT_BROWSER_EXECUTABLE_PATH) {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
                     'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                     '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
      if (fs.existsSync(p)) { e.AGENT_BROWSER_EXECUTABLE_PATH = p; break; }
    }
  }
  return e;
}

function ab(args, { input } = {}) {
  debug(`ab ${args.join(' ')}`);
  const [bin, ...binArgs] = abBin();
  const r = spawnSync(bin, [...binArgs, ...args], {
    env: env(), encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input,
  });
  if (r.error) fail(`agent-browser spawn failed: ${r.error.message}\nInstall: npm install -g agent-browser`);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.stdout) process.stdout.write(r.stdout);
  return r.status === 0;
}

/**
 * Bootstrap agent-browser.json into the consuming repo if missing.
 * The file is the repo's browser contract (sandbox: profile + namespace);
 * the skill ships the template, the wrapper instantiates it per repo.
 * Never overwrites an existing file.
 */
function ensureConfig() {
  if (fs.existsSync(CONFIG_PATH)) return;
  try {
    const tpl = fs.readFileSync(CONFIG_TEMPLATE, 'utf8')
      .replace('__REPO_NAME__', path.basename(REPO_ROOT));
    fs.writeFileSync(CONFIG_PATH, tpl);
    console.error(`[browser] created agent-browser.json with repo defaults (namespace: ${path.basename(REPO_ROOT)})`);
  } catch (e) {
    debug(`ensureConfig failed: ${e.message}`);
  }
}

// --- site guides ---

// Path-based guide overrides: hostname/path → specific guide file (not guide.md).
const PATH_GUIDES = {
  'www.google.com/maps': 'google_com/maps-guide.md',
  'google.com/maps': 'google_com/maps-guide.md',
  'maps.google.com': 'google_com/maps-guide.md',
  'calendar.google.com': 'calendar_google_com/calendar-deeplink.md',
};

/**
 * Parse the `domains:` list from a markdown file's YAML frontmatter.
 * Supports block lists (`domains:\n  - a.com`) and inline (`domains: [a.com, b.com]`).
 * Returns a lowercased array, empty when absent or unreadable.
 */
function parseFrontmatterDomains(filePath) {
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    head = buf.toString('utf8', 0, n);
  } catch {
    return [];
  }
  const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const body = fm[1];
  const dm = body.match(/^domains:[ \t]*(.*)$/m);
  if (!dm) return [];
  const inline = dm[1].trim();
  const out = [];
  const clean = (s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (inline.startsWith('[')) {
    for (const s of inline.replace(/^\[/, '').replace(/\].*$/, '').split(',')) {
      const v = clean(s);
      if (v) out.push(v);
    }
    return out;
  }
  for (const line of body.slice(body.indexOf(dm[0]) + dm[0].length).split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const lm = line.match(/^\s*-\s*(\S+)\s*$/);
    if (!lm) break;
    out.push(clean(lm[1]));
  }
  return out;
}

/**
 * Index of declared hostname → guide file, built from `domains:` frontmatter
 * across sites/*//*.md (all markdown files, not just guide.md).
 * First declaration wins on collision.
 */
function buildDomainIndex() {
  const idx = new Map();
  try {
    for (const dir of fs.readdirSync(SITES_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
      const dirPath = path.join(SITES_DIR, dir.name);
      for (const f of fs.readdirSync(dirPath)) {
        if (!f.endsWith('.md')) continue;
        const fp = path.join(dirPath, f);
        for (const d of parseFrontmatterDomains(fp)) {
          if (!idx.has(d)) idx.set(d, fp);
        }
      }
    }
  } catch { /* sites dir missing → empty index */ }
  return idx;
}

/**
 * Find the guide file for a given URL.
 * Resolution order:
 *   1. PATH_GUIDES override (hostname + path prefix)
 *   2. Declared `domains:` in guide frontmatter — progressive suffix match
 *   3. Generic candidates → <slug>/guide.md (fallback)
 * Returns the absolute path to the guide file, or null if not found.
 */
function findGuide(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname) return null;
    const pathPrefix = u.pathname.split('/').filter(Boolean)[0] || '';

    // 1. Path-based overrides
    const pathKey = pathPrefix ? `${hostname}/${pathPrefix}` : hostname;
    if (PATH_GUIDES[pathKey]) {
      const p = path.join(SITES_DIR, PATH_GUIDES[pathKey]);
      if (fs.existsSync(p)) return p;
    }
    if (PATH_GUIDES[hostname]) {
      const p = path.join(SITES_DIR, PATH_GUIDES[hostname]);
      if (fs.existsSync(p)) return p;
    }

    const parts = hostname.split('.');

    // 2. Declared domains (frontmatter) — most specific suffix wins
    const idx = buildDomainIndex();
    for (let i = 0; i < parts.length - 1; i++) {
      const guidePath = idx.get(parts.slice(i).join('.'));
      if (guidePath) return guidePath;
    }

    // 3. Generic candidates — strip leading www., then
    //    [host, host-minus-first-label, first-label] → <slug>/guide.md
    const host = hostname.replace(/^www\./, '');
    const candidates = [host, host.split('.').slice(1).join('.'), host.split('.')[0]];
    for (const c of candidates) {
      if (!c) continue;
      const dir = path.join(SITES_DIR, c.replace(/[^a-z0-9_]/g, '_'));
      const guide = path.join(dir, 'guide.md');
      if (fs.existsSync(guide)) return guide;
    }
  } catch {}
  return null;
}

function printGuide(url) {
  const guide = findGuide(url);
  if (!guide) return;
  try {
    const content = fs.readFileSync(guide, 'utf8');
    console.log(`\n[browser] Site guide: ${path.relative(REPO_ROOT, guide)}\n${content}`);
  } catch {}
}

// --- update check (weekly, warn only) ---

function checkForUpdate() {
  try {
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(UPDATE_CACHE_PATH, 'utf8')); } catch {}
    const now = Date.now();
    if (cache.lastCheck && now - cache.lastCheck < UPDATE_CHECK_INTERVAL_MS) {
      if (cache.latest && cache.installed && cache.latest !== cache.installed) {
        console.error(`[browser] agent-browser ${cache.latest} available (installed: ${cache.installed}). Run: agent-browser upgrade`);
      }
      return;
    }
    const installed = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 3000 });
    const latest = spawnSync('npm', ['view', 'agent-browser', 'version'], { encoding: 'utf8', timeout: 3000 });
    const installedV = (installed.stdout || '').trim().replace(/^agent-browser\s+/i, '');
    const latestV = (latest.stdout || '').trim();
    fs.mkdirSync(path.dirname(UPDATE_CACHE_PATH), { recursive: true });
    fs.writeFileSync(UPDATE_CACHE_PATH, JSON.stringify({ lastCheck: now, installed: installedV, latest: latestV }));
    if (latestV && installedV && latestV !== installedV) {
      console.error(`[browser] agent-browser ${latestV} available (installed: ${installedV}). Run: agent-browser upgrade`);
    }
  } catch {}
}

// --- blocklist injection ---

function injectBlocklist() {
  const cmds = BLOCKED_ORIGINS.map((o) => ['network', 'route', `*://*.${o}/*`, '--abort']);
  cmds.push(['network', 'route', '*://doubleclick.net/*', '--abort']);
  debug(`injecting ${cmds.length} blocked routes`);
  return ab(['batch', '--json'], { input: JSON.stringify(cmds) });
}

// --- CLI ---

const [cmd, ...rest] = process.argv.slice(2);
ensureConfig();
checkForUpdate();

function optValue(flag) {
  const i = rest.indexOf(flag);
  return i >= 0 ? rest[i + 1] : null;
}
function stripOpts(flags) {
  return rest.filter((a, i) => !(flags.includes(a) || flags.includes(rest[i - 1])));
}

switch (cmd) {
  case undefined:
  case '-h':
  case '--help':
    console.log(`browser.js — agent-browser wrapper (repo-isolated)
  open <url> [--headed|--headless]   launch browser + inject tracker blocklist
  goto <url> [--tab <name>]        navigate (auto-prints site guide if known)
  tab-new <url> --name <name>      new labeled tab
  tab-list                         list tabs
  exec <cmd> [args...] [--tab <n>] passthrough to agent-browser (eval, press, click, fill, type,
                                   snapshot, find, keyboard, wait, screenshot, read, batch, ...)
  wait-dom [--timeout <ms>]        wait for page load
  close | close-all                close session / all sessions
  save-state <path> | load-state <path>   auth state backup/restore
  status                           session list
  doctor                           agent-browser diagnostics
  guides                           list available site guides
  contribute                       how to contribute a site guide`);
    break;

  case 'open': {
    const url = rest.find((a) => !a.startsWith('--'));
    const args = ['open'];
    if (rest.includes('--headed')) args.push('--headed');
    if (rest.includes('--headless')) args.push('--headed', 'false');
    if (!ab(args)) fail('open failed');
    injectBlocklist();
    if (url) {
      if (!ab(['navigate', url])) fail('navigate failed');
      printGuide(url);
    }
    break;
  }

  case 'goto': {
    const tab = optValue('--tab');
    const url = stripOpts(['--tab'])[0];
    if (tab) ab(['tab', tab]);
    if (!ab(['navigate', url])) fail('goto failed');
    printGuide(url);
    break;
  }

  case 'tab-new': {
    const name = optValue('--name');
    const url = stripOpts(['--name'])[0];
    const args = ['tab', 'new'];
    if (name) args.push('--label', name);
    if (url) args.push(url);
    if (!ab(args)) fail('tab-new failed');
    if (url) printGuide(url);
    break;
  }

  case 'tab-list':
    ab(['tab']);
    break;

  case 'exec': {
    const tab = optValue('--tab');
    const sub = stripOpts(['--tab']);
    if (!sub.length) fail('exec requires a command: node browser.js exec <cmd> [args...]');
    if (tab) ab(['tab', tab]);
    if (sub[0] === 'run-code') fail('run-code is not supported on agent-browser — use eval/batch');
    const real = sub[0] === 'goto' ? 'navigate' : sub[0];
    if (!ab([real, ...sub.slice(1)])) process.exit(1);
    break;
  }

  case 'wait-dom': {
    const t = optValue('--timeout') || '30000';
    if (!ab(['wait', '--load', 'load', '--timeout', t])) process.exit(1);
    break;
  }

  case 'close':
    ab(['close']);
    break;

  case 'close-all':
    ab(['close', '--all']);
    break;

  case 'save-state':
    if (!rest[0]) fail('save-state requires a path');
    if (!ab(['state', 'save', rest[0]])) process.exit(1);
    break;

  case 'load-state':
    if (!rest[0]) fail('load-state requires a path');
    if (!ab(['state', 'load', rest[0]])) process.exit(1);
    break;

  case 'status':
    ab(['session', 'list']);
    break;

  case 'doctor':
    ab(['doctor', ...rest]);
    break;

  case 'guides': {
    try {
      const dirs = fs.readdirSync(SITES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(SITES_DIR, d.name, 'guide.md')))
        .map((d) => d.name);
      console.log(dirs.join('\n'));
    } catch { console.log('(no guides found)'); }
    break;
  }

  case 'contribute':
    console.log(`Found an undocumented shortcut or a broken selector?
Write a site guide at: ${path.join(SITES_DIR, '<domain>', 'guide.md')}
Rules: markdown only, no executable scripts in sites/. See sites/CONTRIBUTING.md.`);
    break;

  default:
    if (!ab([cmd, ...rest])) process.exit(1);
}
