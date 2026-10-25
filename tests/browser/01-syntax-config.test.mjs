/**
 * Syntax, help and config tests for the browser wrapper (agent-browser backend).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { execSync } from 'child_process';
import { run, CONFIG_PATH, BROWSER_JS, REPO_ROOT } from './helpers.mjs';

const BROWSER_JS_REL = '.agents/skills/browser-automation/scripts/browser.js';

describe('browser.js syntax and help', () => {
  it('has valid JavaScript syntax', () => {
    const result = execSync(`node -c ${BROWSER_JS_REL}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(result).toBeDefined();
  });

  it('linkedin-warm-sourcing.js has valid JavaScript syntax', () => {
    const result = execSync('node -c scripts/linkedin-warm-sourcing.js', { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(result).toBeDefined();
  });

  it('linkedin-warm-sourcing.js exits 2 without --company', () => {
    try {
      execSync('node scripts/linkedin-warm-sourcing.js', { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
      throw new Error('Expected exit code 2 but process exited successfully');
    } catch (err) {
      expect(err.status).toBe(2);
    }
  });

  it('linkedin-warm-sourcing.js --help exits 0', () => {
    const result = execSync('node scripts/linkedin-warm-sourcing.js --help', { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(result).toContain('--company');
    expect(result).toContain('--role');
    expect(result).toContain('--json');
  });

  it('--help exits 0', () => {
    const result = run(['--help']);
    expect(result.exitCode).toBe(0);
  });

  it('help mentions all commands', () => {
    const result = run(['--help']);
    const commands = ['open', 'goto', 'close', 'close-all',
      'exec', 'tab-new', 'tab-list',
      'save-state', 'load-state', 'wait-dom',
      'status', 'doctor', 'guides', 'contribute'];
    for (const cmd of commands) {
      expect(result.stdout).toContain(cmd);
    }
  });
});

describe('config file (agent-browser.json)', () => {
  it('exists (auto-created by the wrapper on first run)', () => {
    if (!fs.existsSync(CONFIG_PATH)) {
      run(['--help']); // ensureConfig() runs on every invocation
    }
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
  });

  it('is valid JSON with expected fields', () => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(config.namespace).toBeDefined();
    expect(config.profile).toBeDefined();
    expect(typeof config.headed).toBe('boolean');
  });
});
