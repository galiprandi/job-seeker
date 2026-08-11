/**
 * Tests de sintaxis, help y configuración.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { execSync } from 'child_process';
import { run, CONFIG_PATH, REPO_ROOT } from './helpers.mjs';

describe('browser.js syntax and help', () => {
  it('has valid JavaScript syntax', () => {
    const result = execSync('node -c scripts/browser.js', { cwd: REPO_ROOT, encoding: 'utf8' });
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

  it('linkedin-warm-sourcing.js exits 2 when browser not running', () => {
    // Ensure no browser session is active
    try { execSync('node scripts/browser.js close-all --force', { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 10000 }); } catch {}
    try {
      execSync('node scripts/linkedin-warm-sourcing.js --company "Test"', { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
      throw new Error('Expected exit code 2 but process exited successfully');
    } catch (err) {
      expect(err.status).toBe(2);
      expect((err.stderr || err.stdout || '').toString()).toContain('not active');
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
    const commands = ['open', 'attach', 'detach', 'goto', 'close', 'close-all', 'ensure',
      'exec', 'tab-new', 'tab-select', 'tab-close', 'tab-close-all', 'tab-list',
      'save-state', 'load-state', 'dashboard', 'trace-start', 'trace-stop',
      'video-start', 'video-stop', 'console', 'requests', 'request',
      'list', 'status'];
    for (const cmd of commands) {
      expect(result.stdout).toContain(cmd);
    }
  });
});

describe('config file', () => {
  it('exists', () => {
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
  });

  it('is valid JSON with expected fields', () => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(config.browser).toBeDefined();
    expect(config.browser.channel).toBeDefined();
    expect(config.timeouts).toBeDefined();
    expect(typeof config.timeouts.action).toBe('number');
    expect(typeof config.timeouts.navigation).toBe('number');
    expect(config.network).toBeDefined();
    expect(Array.isArray(config.network.blockedOrigins)).toBe(true);
    expect(config.network.blockedOrigins.length).toBeGreaterThan(0);
    expect(config.console).toBeDefined();
    expect(config.console.level).toBeDefined();
  });
});
