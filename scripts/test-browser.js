#!/usr/bin/env node
/**
 * test-browser.js — Regression tests for scripts/browser.js
 *
 * Run: node scripts/test-browser.js
 *
 * Tests cover:
 *   1. Syntax and help
 *   2. Config file validity
 *   3. Fail-fast (no session)
 *   4. Open + ensure + close lifecycle
 *   5. Tab management (new, list, select, close, close-all)
 *   6. Named sessions (--session flag)
 *   7. Attach/detach for parallel subagents
 *   8. Parallel read (exec --tab --session)
 *   9. Parallel write (goto --tab --session)
 *  10. No interference between parallel sessions
 *  11. Save/load state
 *  12. Console + requests inspection
 *  13. Trace start/stop
 *  14. Video start/stop
 *  15. Status output
 *  16. Lockfile stale detection
 *  17. URL with dashes (parsing)
 *  18. exec passthrough
 *
 * The test suite cleans up after itself (close-all at the end).
 * It requires playwright-cli to be installed and available.
 */
'use strict';

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BROWSER_JS = path.join(REPO_ROOT, 'scripts', 'browser.js');
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');
const CONFIG_PATH = path.join(REPO_ROOT, '.playwright', 'cli.config.json');
const TABS_PATH = path.join(PROFILE_DIR, 'tabs.json');
const LOCK_PATH = path.join(PROFILE_DIR, '.lock');
const AUTH_STATE_PATH = path.join(PROFILE_DIR, 'auth-state.json');

const HEADLESS = '--headless';
const TEST_URL_A = 'https://example.com';
const TEST_URL_B = 'https://example.org';
const TEST_URL_C = 'https://example.net';
const TEST_URL_D = 'https://example.edu';

let passed = 0;
let failed = 0;
const failures = [];

function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', [BROWSER_JS, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: opts.timeout || 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status || 1,
    };
  }
}

function runInherit(args) {
  try {
    execFileSync('node', [BROWSER_JS, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30000,
      stdio: 'inherit',
    });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status || 1, stdout: '', stderr: '' };
  }
}

function assert(condition, name, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function assertContains(haystack, needle, name) {
  assert(
    typeof haystack === 'string' && haystack.includes(needle),
    name,
    `expected "${needle}" in output`
  );
}

function assertNotContains(haystack, needle, name) {
  assert(
    typeof haystack === 'string' && !haystack.includes(needle),
    name,
    `did not expect "${needle}" in output`
  );
}

function assertExitCode(result, expectedCode, name) {
  assert(
    result.exitCode === expectedCode,
    name,
    `exit code ${result.exitCode} !== ${expectedCode}`
  );
}

function cleanup() {
  // Close all browser sessions
  try { execFileSync('node', [BROWSER_JS, 'close-all'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }); } catch {}
  // Remove stale lock if any
  try { fs.unlinkSync(LOCK_PATH); } catch {}
  // Clean tab state
  try { fs.unlinkSync(TABS_PATH); } catch {}
}

// --- Test suites ---

function testSyntaxAndHelp() {
  console.log('\n--- Suite 1: Syntax and Help ---');

  const syntaxCheck = run(['-c'], { timeout: 5000 });
  // node -c is not a browser.js command, but we check syntax differently
  const syntaxResult = execSync('node -c scripts/browser.js', { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 });
  assert(syntaxResult !== null || true, 'browser.js syntax valid');

  const help = run(['--help']);
  assertExitCode(help, 0, '--help exits 0');
  assertContains(help.stdout, 'open', 'help mentions open');
  assertContains(help.stdout, 'attach', 'help mentions attach');
  assertContains(help.stdout, 'tab-new', 'help mentions tab-new');
  assertContains(help.stdout, 'save-state', 'help mentions save-state');
  assertContains(help.stdout, 'load-state', 'help mentions load-state');
  assertContains(help.stdout, 'dashboard', 'help mentions dashboard');
  assertContains(help.stdout, 'trace-start', 'help mentions trace-start');
  assertContains(help.stdout, 'console', 'help mentions console');
  assertContains(help.stdout, 'requests', 'help mentions requests');
}

function testConfigFile() {
  console.log('\n--- Suite 2: Config File ---');

  assert(fs.existsSync(CONFIG_PATH), 'config file exists');
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    assert(config.browser && config.browser.channel, 'config has browser.channel');
    assert(config.timeouts && typeof config.timeouts.action === 'number', 'config has timeouts.action');
    assert(config.timeouts && typeof config.timeouts.navigation === 'number', 'config has timeouts.navigation');
    assert(config.network && Array.isArray(config.network.blockedOrigins), 'config has network.blockedOrigins');
    assert(config.network.blockedOrigins.length > 0, 'config blocks at least 1 tracking domain');
    assert(config.console && config.console.level, 'config has console.level');
  } catch (e) {
    assert(false, 'config file is valid JSON', e.message);
  }
}

function testFailFastNoSession() {
  console.log('\n--- Suite 3: Fail-fast (no session) ---');

  // Ensure clean state
  cleanup();

  const gotoNoSession = run(['goto', TEST_URL_A]);
  assertExitCode(gotoNoSession, 1, 'goto without session exits 1');
  assertContains(gotoNoSession.stderr, 'No active session', 'goto without session gives clear error');

  const closeNoSession = run(['close']);
  assertExitCode(closeNoSession, 1, 'close without session exits 1');
  assertContains(closeNoSession.stderr, 'No active session', 'close without session gives clear error');

  const ensureNoSession = run(['ensure']);
  assertExitCode(ensureNoSession, 1, 'ensure without session exits 1');
  assertContains(ensureNoSession.stderr, 'No healthy session', 'ensure without session gives clear error');

  const execNoSession = run(['exec', 'snapshot']);
  assertExitCode(execNoSession, 1, 'exec without session exits 1');
  assertContains(execNoSession.stderr, 'No active session', 'exec without session gives clear error');

  const tabListNoSession = run(['tab-list']);
  assertExitCode(tabListNoSession, 1, 'tab-list without session exits 1');

  const saveStateNoSession = run(['save-state']);
  assertExitCode(saveStateNoSession, 1, 'save-state without session exits 1');

  const loadStateNoSession = run(['load-state']);
  assertExitCode(loadStateNoSession, 1, 'load-state without session exits 1');
}

function testLifecycle() {
  console.log('\n--- Suite 4: Open + Ensure + Close ---');

  cleanup();

  const open = run(['open', TEST_URL_A, HEADLESS]);
  assertExitCode(open, 0, 'open exits 0');
  assertContains(open.stdout, 'Browser', 'open shows browser opened');

  const ensure = run(['ensure']);
  assertExitCode(ensure, 0, 'ensure exits 0 on healthy session');
  assertContains(ensure.stdout, 'active and healthy', 'ensure confirms healthy');

  const status = run(['status']);
  assertExitCode(status, 0, 'status exits 0');
  assertContains(status.stdout, 'browser_mode', 'status shows browser_mode');
  assertContains(status.stdout, 'active_sessions', 'status shows active_sessions');

  const close = run(['close']);
  assertExitCode(close, 0, 'close exits 0');

  const ensureAfterClose = run(['ensure']);
  assertExitCode(ensureAfterClose, 1, 'ensure exits 1 after close');
}

function testTabManagement() {
  console.log('\n--- Suite 5: Tab Management ---');

  cleanup();

  run(['open', TEST_URL_A, HEADLESS]);

  // tab-new
  const tabNew = run(['tab-new', TEST_URL_B, '--name', 'tab-b']);
  assertExitCode(tabNew, 0, 'tab-new exits 0');
  assertContains(tabNew.stdout, "Tab 'tab-b' created", 'tab-new confirms creation');

  run(['tab-new', TEST_URL_C, '--name', 'tab-c']);

  // tab-list
  const tabList = run(['tab-list']);
  assertExitCode(tabList, 0, 'tab-list exits 0');
  assertContains(tabList.stdout, 'tab-b', 'tab-list shows tab-b');
  assertContains(tabList.stdout, 'tab-c', 'tab-list shows tab-c');

  // tab-list --json
  const tabListJson = run(['tab-list', '--json']);
  assertExitCode(tabListJson, 0, 'tab-list --json exits 0');
  try {
    const parsed = JSON.parse(tabListJson.stdout);
    assert(Array.isArray(parsed.tabs), 'tab-list --json returns tabs array');
    assert(parsed.tabs.length >= 3, 'tab-list --json has at least 3 tabs');
  } catch (e) {
    assert(false, 'tab-list --json is valid JSON', e.message);
  }

  // tab-select
  const tabSelect = run(['tab-select', 'tab-b']);
  assertExitCode(tabSelect, 0, 'tab-select exits 0');

  // tab-select nonexistent
  const tabSelectMissing = run(['tab-select', 'nonexistent']);
  assertExitCode(tabSelectMissing, 1, 'tab-select nonexistent exits 1');
  assertContains(tabSelectMissing.stderr, 'not found', 'tab-select nonexistent gives error');

  // tab-close
  const tabClose = run(['tab-close', 'tab-c']);
  assertExitCode(tabClose, 0, 'tab-close exits 0');
  assertContains(tabClose.stdout, "Tab 'tab-c' closed", 'tab-close confirms closure');

  // Verify tab-c is gone
  const tabListAfterClose = run(['tab-list']);
  assertNotContains(tabListAfterClose.stdout, 'tab-c', 'tab-c removed from list after close');

  // tab-close-all
  run(['tab-new', TEST_URL_D, '--name', 'tab-d']);
  const tabCloseAll = run(['tab-close-all']);
  assertExitCode(tabCloseAll, 0, 'tab-close-all exits 0');
  const tabListAfterCloseAll = run(['tab-list']);
  // Should have only 1 tab (the default)
  try {
    const parsed = JSON.parse(run(['tab-list', '--json']).stdout);
    assert(parsed.tabs.length === 1, 'tab-close-all leaves 1 tab');
  } catch (e) {
    assert(false, 'tab-close-all verification failed', e.message);
  }

  run(['close-all']);
}

function testNamedSessions() {
  console.log('\n--- Suite 6: Named Sessions ---');

  cleanup();

  const open = run(['open', TEST_URL_A, HEADLESS, '--session', 'test-session']);
  assertExitCode(open, 0, 'open with --session exits 0');

  const ensure = run(['ensure', '--session', 'test-session']);
  assertExitCode(ensure, 0, 'ensure with --session exits 0');

  const goto = run(['goto', TEST_URL_B, '--session', 'test-session']);
  assertExitCode(goto, 0, 'goto with --session exits 0');

  const close = run(['close', '--session', 'test-session']);
  assertExitCode(close, 0, 'close with --session exits 0');

  run(['close-all']);
}

function testAttachDetach() {
  console.log('\n--- Suite 7: Attach/Detach ---');

  cleanup();

  run(['open', TEST_URL_A, HEADLESS]);
  run(['tab-new', TEST_URL_B, '--name', 'gmail']);
  run(['tab-new', TEST_URL_C, '--name', 'linkedin']);

  const attach = run(['attach', '--session', 'gmail-worker']);
  assertExitCode(attach, 0, 'attach exits 0');
  assertContains(attach.stdout, 'attached', 'attach confirms session attached');

  const attachSecond = run(['attach', '--session', 'linkedin-worker']);
  assertExitCode(attachSecond, 0, 'attach second session exits 0');

  // Attach already existing session (idempotent)
  const attachExisting = run(['attach', '--session', 'gmail-worker']);
  assertExitCode(attachExisting, 0, 'attach existing session exits 0');
  assertContains(attachExisting.stdout, 'already exists', 'attach existing is idempotent');

  // Verify sessions are listed
  const list = run(['list']);
  assertContains(list.stdout, 'gmail-worker', 'list shows gmail-worker');
  assertContains(list.stdout, 'linkedin-worker', 'list shows linkedin-worker');

  // Detach
  const detach = run(['detach', '--session', 'gmail-worker']);
  assertExitCode(detach, 0, 'detach exits 0');
  assertContains(detach.stdout, 'detached', 'detach confirms session detached');

  run(['detach', '--session', 'linkedin-worker']);
  run(['close-all']);
}

function testParallelRead() {
  console.log('\n--- Suite 8: Parallel Read ---');

  cleanup();

  run(['open', TEST_URL_A, HEADLESS]);
  run(['tab-new', TEST_URL_B, '--name', 'gmail']);
  run(['tab-new', TEST_URL_C, '--name', 'linkedin']);
  run(['attach', '--session', 'gmail-worker']);
  run(['attach', '--session', 'linkedin-worker']);

  const tmpdir = execSync('mktemp -d', { encoding: 'utf8' }).trim();

  // Run two exec --tab --session in parallel
  execFileSync('node', [BROWSER_JS, 'exec', 'eval', 'window.location.href', '--tab', 'gmail', '--session', 'gmail-worker'], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  execFileSync('node', [BROWSER_JS, 'exec', 'eval', 'window.location.href', '--tab', 'linkedin', '--session', 'linkedin-worker'], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Parallel via background processes
  execSync(
    `node ${BROWSER_JS} exec eval "window.location.href" --tab gmail --session gmail-worker > "${tmpdir}/g.txt" 2>&1 & ` +
    `node ${BROWSER_JS} exec eval "window.location.href" --tab linkedin --session linkedin-worker > "${tmpdir}/l.txt" 2>&1 & ` +
    `wait`,
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 }
  );

  const gmailOutput = fs.readFileSync(path.join(tmpdir, 'g.txt'), 'utf8');
  const linkedinOutput = fs.readFileSync(path.join(tmpdir, 'l.txt'), 'utf8');

  assertContains(gmailOutput, TEST_URL_B, 'gmail-worker reads correct tab (example.org)');
  assertContains(linkedinOutput, TEST_URL_C, 'linkedin-worker reads correct tab (example.net)');

  execSync(`rm -rf "${tmpdir}"`);
  run(['detach', '--session', 'gmail-worker']);
  run(['detach', '--session', 'linkedin-worker']);
  run(['close-all']);
}

function testParallelWrite() {
  console.log('\n--- Suite 9-10: Parallel Write + No Interference ---');

  cleanup();

  run(['open', TEST_URL_A, HEADLESS]);
  run(['tab-new', TEST_URL_B, '--name', 'gmail']);
  run(['tab-new', TEST_URL_C, '--name', 'linkedin']);
  run(['attach', '--session', 'gmail-worker']);
  run(['attach', '--session', 'linkedin-worker']);

  const tmpdir = execSync('mktemp -d', { encoding: 'utf8' }).trim();

  // Parallel navigate
  execSync(
    `node ${BROWSER_JS} goto "${TEST_URL_D}" --tab gmail --session gmail-worker > "${tmpdir}/g.txt" 2>&1 & ` +
    `node ${BROWSER_JS} goto "${TEST_URL_A}" --tab linkedin --session linkedin-worker > "${tmpdir}/l.txt" 2>&1 & ` +
    `wait`,
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 }
  );

  const gmailNav = fs.readFileSync(path.join(tmpdir, 'g.txt'), 'utf8');
  const linkedinNav = fs.readFileSync(path.join(tmpdir, 'l.txt'), 'utf8');
  assertContains(gmailNav, TEST_URL_D, 'gmail-worker navigated to example.edu');
  assertContains(linkedinNav, TEST_URL_A, 'linkedin-worker navigated to example.com');

  // Verify no interference
  const gmailVerify = run(['exec', 'eval', 'window.location.href', '--tab', 'gmail', '--session', 'gmail-worker']);
  const linkedinVerify = run(['exec', 'eval', 'window.location.href', '--tab', 'linkedin', '--session', 'linkedin-worker']);
  assertContains(gmailVerify.stdout, TEST_URL_D, 'gmail-worker still on example.edu after parallel nav');
  assertContains(linkedinVerify.stdout, TEST_URL_A, 'linkedin-worker still on example.com after parallel nav');

  execSync(`rm -rf "${tmpdir}"`);
  run(['detach', '--session', 'gmail-worker']);
  run(['detach', '--session', 'linkedin-worker']);
  run(['close-all']);
}

function testStatePersistence() {
  console.log('\n--- Suite 11: Save/Load State ---');

  cleanup();
  run(['open', TEST_URL_A, HEADLESS]);

  const saveState = run(['save-state']);
  assertExitCode(saveState, 0, 'save-state exits 0');
  assert(fs.existsSync(AUTH_STATE_PATH), 'auth-state.json created');

  const loadState = run(['load-state']);
  assertExitCode(loadState, 0, 'load-state exits 0');
  assertContains(loadState.stdout, 'loaded', 'load-state confirms load');

  const loadStateMissing = run(['load-state', '--filename', '/tmp/nonexistent-test.json']);
  assertExitCode(loadStateMissing, 1, 'load-state with missing file exits 1');
  assertContains(loadStateMissing.stderr, 'not found', 'load-state missing file gives error');

  run(['close-all']);
}

function testConsoleAndRequests() {
  console.log('\n--- Suite 12: Console + Requests ---');

  cleanup();
  run(['open', TEST_URL_A, HEADLESS]);

  const consoleResult = run(['console', 'error']);
  assertExitCode(consoleResult, 0, 'console error exits 0');

  const consoleInvalid = run(['console', 'invalid-level']);
  assertExitCode(consoleInvalid, 1, 'console invalid level exits 1');

  const requests = run(['requests']);
  assertExitCode(requests, 0, 'requests exits 0');

  run(['close-all']);
}

function testTraceAndVideo() {
  console.log('\n--- Suite 13-14: Trace + Video ---');

  cleanup();
  run(['open', TEST_URL_A, HEADLESS]);

  const traceStart = run(['trace-start']);
  assertExitCode(traceStart, 0, 'trace-start exits 0');

  const traceStop = run(['trace-stop']);
  assertExitCode(traceStop, 0, 'trace-stop exits 0');

  const videoStart = run(['video-start']);
  assertExitCode(videoStart, 0, 'video-start exits 0');

  // Brief wait for video to record something
  execSync('sleep 1', { encoding: 'utf8' });

  const videoStop = run(['video-stop']);
  assertExitCode(videoStop, 0, 'video-stop exits 0');

  run(['close-all']);
}

function testLockfileStale() {
  console.log('\n--- Suite 16: Lockfile Stale Detection ---');

  cleanup();
  run(['open', TEST_URL_A, HEADLESS]);

  // Write a stale lock (PID 99999 doesn't exist)
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.writeFileSync(LOCK_PATH, '99999');

  // ensure should still work (doesn't need lock, but tests that stale lock doesn't block)
  const ensure = run(['ensure']);
  assertExitCode(ensure, 0, 'ensure works with stale lock present');

  // open should detect stale lock and proceed
  const open = run(['open', TEST_URL_B, HEADLESS]);
  assertExitCode(open, 0, 'open detects and clears stale lock');

  run(['close-all']);
}

function testUrlWithDashes() {
  console.log('\n--- Suite 17: URL with Dashes ---');

  cleanup();

  // URL with - in query string should not be parsed as flag
  const open = run(['open', 'https://example.com/?redirect=-foo', HEADLESS]);
  assertExitCode(open, 0, 'open with URL containing dashes exits 0');

  run(['close-all']);
}

function testExecPassthrough() {
  console.log('\n--- Suite 18: Exec Passthrough ---');

  cleanup();
  run(['open', TEST_URL_A, HEADLESS]);

  const exec = run(['exec', 'eval', 'document.title']);
  assertExitCode(exec, 0, 'exec eval exits 0');
  assertContains(exec.stdout, 'Example Domain', 'exec eval returns page title');

  const execSnapshot = run(['exec', 'snapshot']);
  assertExitCode(execSnapshot, 0, 'exec snapshot exits 0');

  run(['close-all']);
}

// --- Main ---

function main() {
  console.log('=========================================');
  console.log('  Browser Wrapper Regression Tests');
  console.log('=========================================');

  // Pre-cleanup
  cleanup();

  // Run suites
  testSyntaxAndHelp();
  testConfigFile();
  testFailFastNoSession();
  testLifecycle();
  testTabManagement();
  testNamedSessions();
  testAttachDetach();
  testParallelRead();
  testParallelWrite();
  testStatePersistence();
  testConsoleAndRequests();
  testTraceAndVideo();
  testLockfileStale();
  testUrlWithDashes();
  testExecPassthrough();

  // Post-cleanup
  cleanup();

  // Summary
  console.log('\n=========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('  Failures:');
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
  }
  console.log('=========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
