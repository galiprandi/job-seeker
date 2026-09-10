#!/usr/bin/env node
/**
 * browser.js — Safe browser wrapper for agents.
 *
 * Guarantees the Chrome profile (.browser-profile) is always used.
 * Auto-injects site guides when opening/navigating to a documented site.
 * Reads browser_mode from config file or env var.
 *
 * Run in-place from the skill directory. Do NOT copy to the consuming repo.
 * Profile resolves to process.cwd()/.browser-profile (the consuming repo's root).
 *
 * Usage:
 *   node .agents/skills/browser-automation/scripts/browser.js open <url> [--headed|--headless]
 *   node .agents/skills/browser-automation/scripts/browser.js goto <url> [--tab <name>]
 *   node .agents/skills/browser-automation/scripts/browser.js tab-new <url> --name <name>
 *   node .agents/skills/browser-automation/scripts/browser.js exec <cmd> [args...] [--tab <name>]
 *   node .agents/skills/browser-automation/scripts/browser.js close [--force]
 *   node .agents/skills/browser-automation/scripts/browser.js close-all [--force]
 *   node .agents/skills/browser-automation/scripts/browser.js save-state [--filename <path>]
 *   node .agents/skills/browser-automation/scripts/browser.js load-state [--filename <path>]
 *   node .agents/skills/browser-automation/scripts/browser.js status
 *   node .agents/skills/browser-automation/scripts/browser.js guides
 *   node .agents/skills/browser-automation/scripts/browser.js contribute
 *   node .agents/skills/browser-automation/scripts/browser.js -h|--help
 *
 * Environment:
 *   BROWSER_DEBUG=1            Verbose logging to stderr.
 *   BROWSER_MODE               Override browser mode (headed, headless).
 *   BROWSER_NO_UPDATE_CHECK=1  Disable update check.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = process.cwd();
const CONFIG_PATH = path.join(REPO_ROOT, '.browser-config.json');
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');
const TABS_PATH = path.join(PROFILE_DIR, 'tabs.json');
const AUTH_STATE_PATH = path.join(PROFILE_DIR, 'auth-state.json');
const SITES_DIR = path.join(__dirname, '..', 'sites');
const SKILL_DIR = path.join(__dirname, '..');
const UPDATE_CACHE_PATH = path.join(os.homedir(), '.browser-automation', 'update-check.json');

const DEBUG = process.env.BROWSER_DEBUG === '1';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;   // poll git at most once per day
const UPDATE_RENOTIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // re-surface at most once per week
const UPDATE_FETCH_TIMEOUT_MS = 3000;

// --- logging ---

function debug(msg) {
  if (DEBUG) console.error(`[browser:debug] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[browser] ${msg}`);
  process.exit(code);
}

// --- helpers ---

function getBrowserMode() {
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
  if (process.env.BROWSER_MODE) {
    debug(`getBrowserMode: from env = ${process.env.BROWSER_MODE}`);
    return process.env.BROWSER_MODE;
  }
  return null;
}

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

function checkPlaywrightCli() {
  try {
    execFileSync('playwright-cli', ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    fail(`playwright-cli is not installed or not in PATH.\n` +
      `Install it with:\n` +
      `  npm install -g @playwright/cli@latest\n` +
      `  playwright-cli install-browser`);
  }
}

function runPwCli(args) {
  try {
    execFileSync('playwright-cli', args, { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch (e) {
    fail(`playwright-cli failed: ${e.message}`);
  }
}

function runPwCliCapture(args, timeoutMs = 10000) {
  return execFileSync('playwright-cli', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// --- session management ---

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
      return data.browsers.filter((b) => b.status === 'open').map((b) => b.name);
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

function getSession(name) {
  const sessions = getActiveSessions();
  if (sessions.length === 0) return null;
  if (name) return sessions.includes(name) ? name : null;
  return sessions[0];
}

function isSessionHealthy(sessionName) {
  try {
    execFileSync('playwright-cli', [`-s=${sessionName}`, 'eval', '1+1'], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function getHealthySession(name) {
  const session = getSession(name);
  if (!session) return null;
  if (isSessionHealthy(session)) return session;
  // Zombie session — clean it up
  console.error(`[browser] Session '${session}' is unresponsive. Cleaning up.`);
  try {
    execFileSync('playwright-cli', [`-s=${session}`, 'close'], { cwd: REPO_ROOT, stdio: 'pipe', timeout: 5000 });
  } catch {
    try { execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' }); } catch {}
  }
  return null;
}

// --- tab state ---

function loadTabsState() {
  try {
    return JSON.parse(fs.readFileSync(TABS_PATH, 'utf8'));
  } catch {
    return { tabs: {}, current: null };
  }
}

function saveTabsState(state) {
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.writeFileSync(TABS_PATH, JSON.stringify(state, null, 2));
}

function getTabList(sessionName) {
  const sessionArgs = sessionName ? [`-s=${sessionName}`] : [];
  try {
    const out = runPwCliCapture([...sessionArgs, 'tab-list', '--json'], 5000);
    const data = JSON.parse(out);
    const text = data.result || data.output || out;
    const tabs = [];
    for (const line of text.split('\n')) {
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
  } catch (e) {
    debug(`getTabList failed: ${e.message}`);
    return [];
  }
}

// --- update check ---

function readUpdateCache() {
  try {
    return JSON.parse(fs.readFileSync(UPDATE_CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeUpdateCache(cache) {
  try {
    fs.mkdirSync(path.dirname(UPDATE_CACHE_PATH), { recursive: true });
    fs.writeFileSync(UPDATE_CACHE_PATH, JSON.stringify(cache));
  } catch {
    // Best-effort: read-only home dir means we re-check next session
  }
}

/**
 * Check if the skill git repo is behind origin. Returns the number of commits
 * behind, or null if git is unavailable or the skill dir is not a git repo.
 */
function checkGitBehind() {
  try {
    // Verify it's a git repo
    execFileSync('git', ['-C', SKILL_DIR, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Fetch origin (best-effort, short timeout)
    try {
      execFileSync('git', ['-C', SKILL_DIR, 'fetch', 'origin'], {
        encoding: 'utf8',
        timeout: UPDATE_FETCH_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      debug(`checkGitBehind: fetch failed: ${e.message}`);
      return null;
    }

    // Get current and remote HEAD
    const localHead = execFileSync('git', ['-C', SKILL_DIR, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    let remoteHead;
    try {
      remoteHead = execFileSync('git', ['-C', SKILL_DIR, 'rev-parse', 'origin/main'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // Try master as fallback
      try {
        remoteHead = execFileSync('git', ['-C', SKILL_DIR, 'rev-parse', 'origin/master'], {
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        return null;
      }
    }

    if (localHead === remoteHead) return 0;

    // Count commits behind
    const count = execFileSync('git', ['-C', SKILL_DIR, 'rev-list', '--count', `HEAD..${remoteHead}`], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return parseInt(count, 10) || 1;
  } catch {
    return null;
  }
}

/**
 * Best-effort update check. Uses git if available, falls back to a periodic
 * reminder if git is not usable. Throttled to once per day, anti-nag once per
 * week. Silent on all failures.
 */
function checkForUpdate() {
  if (process.env.BROWSER_NO_UPDATE_CHECK) return;

  const now = Date.now();
  const cache = readUpdateCache();

  // Throttle: don't check more than once per day
  if (cache.lastCheck && now - cache.lastCheck < UPDATE_CHECK_INTERVAL_MS) {
    // Still surface a previously-found update if within renotify window
    if (cache.behind && cache.notifiedAt && now - cache.notifiedAt < UPDATE_RENOTIFY_INTERVAL_MS) {
      return; // already notified recently, stay quiet
    }
    if (cache.behind) {
      cache.notifiedAt = now;
      writeUpdateCache(cache);
      printUpdateMessage(cache.behind);
    }
    return;
  }

  cache.lastCheck = now;
  const behind = checkGitBehind();

  if (behind === null) {
    // Git not available — fallback to periodic reminder (every 7 days)
    if (!cache.lastReminder || now - cache.lastReminder > UPDATE_RENOTIFY_INTERVAL_MS) {
      cache.lastReminder = now;
      writeUpdateCache(cache);
      console.log("[browser] Run 'npx skills update' to check for the latest site guides and selectors.");
    } else {
      writeUpdateCache(cache);
    }
    return;
  }

  cache.behind = behind;

  if (behind > 0) {
    // Anti-nag: don't re-surface the same update within a week
    if (cache.notifiedAt && now - cache.notifiedAt < UPDATE_RENOTIFY_INTERVAL_MS) {
      writeUpdateCache(cache);
      return;
    }
    cache.notifiedAt = now;
    writeUpdateCache(cache);
    printUpdateMessage(behind);
  } else {
    cache.notifiedAt = null;
    writeUpdateCache(cache);
  }
}

function printUpdateMessage(behind) {
  console.log(`[browser] UPDATE AVAILABLE: skill is ${behind} commit(s) behind. ` +
    `Suggest to the user: "browser-automation is outdated (${behind} commits behind). ` +
    `Run 'npx skills update' before continuing — site guides may have broken selectors."`);
}

// --- site guide injection ---

// Alias map: hostname → guide slug (for cases where the slug doesn't match the hostname)
const DOMAIN_ALIASES = {
  'mail.google.com': 'gmail_com',
  'web.whatsapp.com': 'whatsapp_com',
  'whatsapp.com': 'whatsapp_com',
  'web.telegram.org': 'telegram_org',
};

// Path-based guide overrides: hostname/path → specific guide file (not guide.md)
const PATH_GUIDES = {
  'www.google.com/maps': 'google_com/maps-guide.md',
  'google.com/maps': 'google_com/maps-guide.md',
  'maps.google.com': 'google_com/maps-guide.md',
};

/**
 * Find the guide file for a given URL.
 * Resolution order:
 *   1. PATH_GUIDES override (hostname + path prefix)
 *   2. DOMAIN_ALIASES → slug/guide.md
 *   3. Progressive subdomain stripping → slug/guide.md
 * Returns the absolute path to the guide file, or null if not found.
 */
function findSiteGuide(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  const pathPrefix = parsed.pathname.split('/').filter(Boolean)[0] || '';

  // 1. Path-based overrides
  const pathKey = pathPrefix ? `${hostname}/${pathPrefix}` : hostname;
  if (PATH_GUIDES[pathKey]) {
    const guidePath = path.join(SITES_DIR, PATH_GUIDES[pathKey]);
    if (fs.existsSync(guidePath)) return guidePath;
  }
  if (PATH_GUIDES[hostname]) {
    const guidePath = path.join(SITES_DIR, PATH_GUIDES[hostname]);
    if (fs.existsSync(guidePath)) return guidePath;
  }

  // 2. Alias map
  if (DOMAIN_ALIASES[hostname]) {
    const slug = DOMAIN_ALIASES[hostname];
    const guidePath = path.join(SITES_DIR, slug, 'guide.md');
    if (fs.existsSync(guidePath)) return guidePath;
  }

  // 3. Progressive subdomain stripping — exact guide.md match only
  const parts = hostname.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const slug = parts.slice(i).join('_');
    const guidePath = path.join(SITES_DIR, slug, 'guide.md');
    if (fs.existsSync(guidePath)) return guidePath;
  }

  return null;
}

/**
 * Inject the site guide into stdout if a matching guide exists.
 * If no guide exists, inject a contribution prompt instead — encourage
 * the agent to learn, document, and contribute the new site.
 * Always injects — no dedup. Context must be present every time.
 */
function injectSiteGuide(url) {
  const guidePath = findSiteGuide(url);

  if (!guidePath) {
    let hostname;
    try { hostname = new URL(url).hostname.toLowerCase(); } catch { return; }
    const slug = hostname.split('.').slice(-2).join('_');
    const learnPath = path.join(SITES_DIR, 'LEARN.md');
    console.log('\n' + '─'.repeat(60));
    console.log(`[browser] NO SITE GUIDE for ${hostname} — learn and contribute one`);
    console.log('─'.repeat(60));
    try {
      const learnContent = fs.readFileSync(learnPath, 'utf8');
      console.log(learnContent);
    } catch {
      console.log(`This site is not documented. After automating it, contribute what you learned:`);
      console.log(`  Run: node .agents/skills/browser-automation/scripts/browser.js contribute`);
      console.log(`  Target: sites/${slug}/guide.md`);
    }
    console.log('─'.repeat(60) + '\n');
    return;
  }

  try {
    const content = fs.readFileSync(guidePath, 'utf8');
    const relativePath = path.relative(REPO_ROOT, guidePath);
    console.log('\n' + '─'.repeat(60));
    console.log(`[browser] SITE GUIDE: ${relativePath}`);
    console.log('─'.repeat(60));
    console.log(content);
    console.log('─'.repeat(60));
    console.log('[browser] Prefer keyboard shortcuts over clicks — universal patterns in SKILL.md, site shortcuts above.');
    console.log('[browser] Found an undocumented shortcut or a broken selector? Run: contribute');
    console.log('─'.repeat(60) + '\n');
  } catch (e) {
    debug(`injectSiteGuide: failed to read guide: ${e.message}`);
  }
}

// --- contribute ---

function contribute() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  CONTRIBUTE A LEARNING TO browser-automation                  ║
╚══════════════════════════════════════════════════════════════╝

Contributable:
  1. Documented path failed — a selector/endpoint/flow didn't work, you found an alternative
  2. Shortcut found — a keyboard shortcut or path shorter/more reliable than documented
  3. New shortcut — an undocumented keyboard shortcut that is reusable

NOT contributable:
  - Routine success where everything works as documented
  - Anything from internal/private sites (intranets, staging, admin panels)

Steps:
  1. Determine the site domain slug (e.g., whatsapp_com, linkedin_com)
  2. Check if a learning file already exists in sites/<domain_slug>/
  3. Create the file at sites/<domain_slug>/<topic-slug>.md using the template below
  4. PARAPHRASE — never copy site DOM/errors verbatim
  5. SCRUB sensitive data — no tokens, cookies, real URLs with IDs, emails, names
  6. Show the user the full file content
  7. Ask: "Should I open a draft PR to contribute this?"
  8. Only after confirmation, run:
     git checkout -b contribute/<domain_slug>-<topic>
     git add sites/<domain_slug>/<topic-slug>.md
     git commit -m "Add learning: <topic> for <domain>"
     gh pr create --draft --title "Learning: <topic> for <domain>" --body "Contributed via browser-automation skill"

Rules:
  - The PR must only touch files under sites/
  - Never modify SKILL.md, scripts/, references/, or CONTRIBUTING.md
  - Never publish without explicit user confirmation

Template:
`);
  console.log('```markdown');
  console.log(`# <Topic> — <domain>

**Date:** YYYY-MM-DD
**Type:** failure-recovery | shortcut
**Site:** <canonical domain>

## What was expected

<Brief description of what the guide or obvious approach said to do>

## What was found

<Brief description of the alternative or fix that worked, in your own words>

## Reproduction

<Minimal steps to reproduce — URLs with placeholders, selectors, or API patterns>

## Suggested guide update

<What should change in guide.md or SKILL.md to incorporate this learning>
`);
  console.log('```');
  console.log(`
See sites/CONTRIBUTING.md for full details.
`);
}

// --- arg parsing ---

function parseArgs(argv) {
  const result = {
    command: null,
    positionals: [],
    flags: { headed: false, headless: false, help: false, force: false },
    options: { tab: null, name: null, filename: null },
    execArgs: [],
  };

  const valueFlags = new Set(['--tab', '--name', '--filename']);
  const boolFlags = new Set(['--headed', '--headless', '--help', '-h', '--force']);

  let i = 0;
  let inExecPassthrough = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (inExecPassthrough) {
      if (arg === '--tab') {
        i++;
        if (i < argv.length) result.options.tab = argv[i];
        i++;
        continue;
      }
      if (arg.startsWith('--tab=')) {
        result.options.tab = arg.slice('--tab='.length);
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
      if (flagName === '--tab') { result.options.tab = flagValue; i++; continue; }
      if (flagName === '--name') { result.options.name = flagValue; i++; continue; }
      if (flagName === '--filename') { result.options.filename = flagValue; i++; continue; }
    }

    if (boolFlags.has(arg)) {
      if (arg === '--headed') result.flags.headed = true;
      if (arg === '--headless') result.flags.headless = true;
      if (arg === '--help' || arg === '-h') result.flags.help = true;
      if (arg === '--force') result.flags.force = true;
      i++;
      continue;
    }

    if (valueFlags.has(arg)) {
      i++;
      if (i < argv.length) {
        if (arg === '--tab') result.options.tab = argv[i];
        else if (arg === '--name') result.options.name = argv[i];
        else if (arg === '--filename') result.options.filename = argv[i];
      }
      i++;
      continue;
    }

    if (result.command === null) {
      result.command = arg;
      if (arg === 'exec') inExecPassthrough = true;
    } else {
      result.positionals.push(arg);
    }
    i++;
  }

  return result;
}

// --- usage ---

function usage() {
  const scriptPath = path.relative(REPO_ROOT, __filename);
  console.log(`Usage:
  node ${scriptPath} open <url> [--headed|--headless]
    Open browser (profile always injected). Reuses existing session if active.
    Auto-injects site guide if one exists for the URL's domain.

  node ${scriptPath} goto <url> [--tab <name>]
    Navigate to <url>. Auto-injects site guide.

  node ${scriptPath} tab-new <url> --name <name>
    Create a new named tab. Auto-injects site guide.

  node ${scriptPath} exec <cmd> [args...] [--tab <name>]
    Passthrough to playwright-cli. With --tab: selects tab then runs command.
    Example: node ${scriptPath} exec snapshot --tab gmail
    Example: node ${scriptPath} exec press Enter

  node ${scriptPath} close [--force]
    Close the browser.

  node ${scriptPath} close-all [--force]
    Close all browser sessions.

  node ${scriptPath} save-state [--filename <path>]
    Save auth state (cookies, localStorage). Default: .browser-profile/auth-state.json

  node ${scriptPath} load-state [--filename <path>]
    Load auth state. Default: .browser-profile/auth-state.json

  node ${scriptPath} status
    Show browser_mode config + active sessions + tab mapping.

  node ${scriptPath} guides
    List all documented sites and whether they have a guide.md.

  node ${scriptPath} contribute
    Print instructions and template for contributing learnings back to the skill.

  node ${scriptPath} -h|--help
    This help.

The wrapper always passes --profile=.browser-profile. You cannot omit it.
Profile resolves to process.cwd()/.browser-profile (the consuming repo's root).

Config resolution for browser_mode (headed vs headless):
  1. --headed / --headless flag
  2. .browser-config.json: { "browser_mode": "headed" }
  3. BROWSER_MODE env var
  4. Default: headless

Environment:
  BROWSER_DEBUG=1            Verbose logging to stderr.
  BROWSER_MODE               Override browser mode.
  BROWSER_NO_UPDATE_CHECK=1  Disable update check on open.

For click, fill, snapshot, eval, press, etc. use 'exec'.`);
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

  // Commands that don't need playwright-cli installed
  const standaloneCommands = new Set(['contribute', 'guides', 'status', 'help']);
  if (!standaloneCommands.has(command)) {
    checkPlaywrightCli();
  }

  switch (command) {

    case 'open': {
      checkForUpdate();
      const url = positionals[0];
      if (!url) fail('open requires a URL: node browser.js open <url>');

      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) fail(`Invalid URL: ${url}`);

      const existing = getHealthySession(null);
      if (existing) {
        console.error(`[browser] Session already active, navigating with goto instead of opening a new one.`);
        runPwCli([`-s=${existing}`, 'goto', normalizedUrl]);
        const state = loadTabsState();
        const currentName = state.current || 'default';
        state.tabs[currentName] = { index: 0, url: normalizedUrl };
        state.current = currentName;
        saveTabsState(state);
        injectSiteGuide(normalizedUrl);
        return;
      }

      let useHeaded;
      if (flags.headed) useHeaded = true;
      else if (flags.headless) useHeaded = false;
      else useHeaded = getBrowserMode() === 'headed';

      const pwArgs = ['open', '--profile=.browser-profile', normalizedUrl];
      if (useHeaded) pwArgs.push('--headed');

      try {
        runPwCli(pwArgs);
        saveTabsState({ tabs: { default: { index: 0, url: normalizedUrl } }, current: 'default' });
        injectSiteGuide(normalizedUrl);
      } catch (e) {
        fail(`Failed to open browser: ${e.message}`);
      }
      return;
    }

    case 'goto': {
      const url = positionals[0];
      if (!url) fail('goto requires a URL: node browser.js goto <url>');

      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) fail(`Invalid URL: ${url}`);

      const session = getHealthySession(null);
      if (!session) fail(`No active session. Run 'open' first.`);

      if (options.tab) {
        const state = loadTabsState();
        const tabInfo = state.tabs[options.tab];
        if (!tabInfo) fail(`Tab '${options.tab}' not found. Run 'tab-list' to see available tabs.`);
        runPwCli([`-s=${session}`, 'tab-select', String(tabInfo.index)]);
        runPwCli([`-s=${session}`, 'goto', normalizedUrl]);
        tabInfo.url = normalizedUrl;
        state.current = options.tab;
        saveTabsState(state);
      } else {
        runPwCli([`-s=${session}`, 'goto', normalizedUrl]);
      }
      injectSiteGuide(normalizedUrl);
      return;
    }

    case 'tab-new': {
      const url = positionals[0] || 'about:blank';
      const tabName = options.name;
      if (!tabName) fail('tab-new requires --name: node browser.js tab-new <url> --name <name>');

      const normalizedUrl = url === 'about:blank' ? url : normalizeUrl(url);
      if (url !== 'about:blank' && !normalizedUrl) fail(`Invalid URL: ${url}`);

      const session = getHealthySession(null);
      if (!session) fail(`No active session. Run 'open' first.`);

      runPwCli([`-s=${session}`, 'tab-new', normalizedUrl || url]);

      // Find the new tab's index by listing tabs
      const realTabs = getTabList(session);
      const newTab = realTabs.find((t) => t.current) || realTabs[realTabs.length - 1];
      const state = loadTabsState();
      state.tabs[tabName] = { index: newTab ? newTab.index : Object.keys(state.tabs).length, url: normalizedUrl || url };
      state.current = tabName;
      saveTabsState(state);

      console.log(`[browser] Tab '${tabName}' created.`);
      if (normalizedUrl) injectSiteGuide(normalizedUrl);
      return;
    }

    case 'exec': {
      const subcommand = positionals[0];
      if (!subcommand) fail('exec requires a playwright-cli command: node browser.js exec <cmd> [args...]');

      const session = getHealthySession(null);
      if (!session) fail(`No active session. Run 'open' first.`);

      if (options.tab) {
        const state = loadTabsState();
        const tabInfo = state.tabs[options.tab];
        if (!tabInfo) fail(`Tab '${options.tab}' not found. Run 'tab-list' to see available tabs.`);
        runPwCli([`-s=${session}`, 'tab-select', String(tabInfo.index)]);
        runPwCli([`-s=${session}`, subcommand, ...parsed.execArgs]);
        state.current = options.tab;
        saveTabsState(state);
      } else {
        runPwCli([`-s=${session}`, subcommand, ...parsed.execArgs]);
      }
      return;
    }

    case 'close': {
      const session = getSession(null);
      if (!session) {
        console.error('[browser] No active session.');
        return;
      }
      try {
        execFileSync('playwright-cli', [`-s=${session}`, 'close'], { cwd: REPO_ROOT, stdio: 'inherit' });
      } catch {
        try { execFileSync('playwright-cli', ['close-all'], { cwd: REPO_ROOT, stdio: 'inherit' }); }
        catch { try { execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' }); } catch {} }
      }
      saveTabsState({ tabs: {}, current: null });
      console.log('[browser] Session closed. Did anything fail or did you find a better path? Run: contribute');
      return;
    }

    case 'close-all': {
      try {
        execFileSync('playwright-cli', ['close-all'], { cwd: REPO_ROOT, stdio: 'inherit' });
      } catch {
        try { execFileSync('playwright-cli', ['kill-all'], { cwd: REPO_ROOT, stdio: 'inherit' }); }
        catch { debug('close-all: both close-all and kill-all failed'); }
      }
      saveTabsState({ tabs: {}, current: null });
      console.log('[browser] All sessions closed. Did anything fail or did you find a better path? Run: contribute');
      return;
    }

    case 'save-state': {
      const session = getHealthySession(null);
      if (!session) fail(`No active session. Run 'open' first.`);
      const filename = options.filename || AUTH_STATE_PATH;
      runPwCli([`-s=${session}`, 'save-state', `--filename=${filename}`]);
      console.log(`[browser] Auth state saved to ${filename}`);
      return;
    }

    case 'load-state': {
      const session = getHealthySession(null);
      if (!session) fail(`No active session. Run 'open' first.`);
      const filename = options.filename || AUTH_STATE_PATH;
      runPwCli([`-s=${session}`, 'load-state', `--filename=${filename}`]);
      console.log(`[browser] Auth state loaded from ${filename}`);
      return;
    }

    case 'status': {
      const mode = getBrowserMode() || 'headless (default)';
      const sessions = getActiveSessions();
      const tabs = loadTabsState();
      console.log(`[browser] Browser mode: ${mode}`);
      console.log(`[browser] Active sessions: ${sessions.length ? sessions.join(', ') : 'none'}`);
      console.log(`[browser] Profile: ${PROFILE_DIR}`);
      console.log(`[browser] Tabs: ${Object.keys(tabs.tabs).length ? JSON.stringify(tabs.tabs) : 'none'}`);
      return;
    }

    case 'guides': {
      try {
        const entries = fs.readdirSync(SITES_DIR, { withFileTypes: true });
        const sites = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'CONTRIBUTING.md')
          .map((dir) => {
            const dirPath = path.join(SITES_DIR, dir.name);
            const guidePath = path.join(dirPath, 'guide.md');
            const hasGuide = fs.existsSync(guidePath);
            const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
            return {
              slug: dir.name,
              hasGuide,
              files: files.length,
            };
          })
          .filter((s) => s.files > 0);

        if (sites.length === 0) {
          console.log('[browser] No site guides found.');
          return;
        }

        console.log('[browser] Available site guides:\n');
        for (const site of sites) {
          const guideStatus = site.hasGuide ? 'guide.md' : `${site.files} file(s), no guide.md`;
          console.log(`  ${site.slug.padEnd(30)} ${guideStatus}`);
        }
        console.log(`\n[browser] ${sites.length} site(s) documented. ${sites.filter((s) => s.hasGuide).length} with guide.md.`);
      } catch (e) {
        fail(`Failed to list guides: ${e.message}`);
      }
      return;
    }

    case 'contribute': {
      contribute();
      return;
    }

    default:
      fail(`Unknown command: ${command}. Run --help for usage.`);
  }
}

main();
