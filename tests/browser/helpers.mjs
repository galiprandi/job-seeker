/**
 * Helpers compartidos para los tests del browser wrapper.
 */
import { spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
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

function run(args, opts = {}) {
  const result = spawnSync('node', [BROWSER_JS, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function runShell(cmd, opts = {}) {
  try {
    const stdout = execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: opts.timeout || 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

function cleanup() {
  try { spawnSync('node', [BROWSER_JS, 'close-all'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }); } catch {}
  try { fs.unlinkSync(LOCK_PATH); } catch {}
  try { fs.unlinkSync(TABS_PATH); } catch {}
}

function tmpDir() {
  return execSync('mktemp -d', { encoding: 'utf8' }).trim();
}

export {
  run, runShell, cleanup, tmpDir,
  REPO_ROOT, BROWSER_JS, PROFILE_DIR, CONFIG_PATH, TABS_PATH, LOCK_PATH, AUTH_STATE_PATH,
  HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D,
};
