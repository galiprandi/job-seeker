/**
 * Tests de auth state, debugging tools y edge cases.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import { execSync } from 'child_process';
import { run, cleanup, HEADLESS, TEST_URL_A, AUTH_STATE_PATH, LOCK_PATH, PROFILE_DIR } from './helpers.mjs';

describe('save/load state', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('save-state creates auth-state.json', () => {
    const result = run(['save-state']);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(AUTH_STATE_PATH)).toBe(true);
  });

  it('load-state restores from auth-state.json', () => {
    const result = run(['load-state']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('loaded');
  });

  it('load-state with missing file fails with clear error', () => {
    const result = run(['load-state', '--filename', '/tmp/nonexistent-test-state.json']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it('save-state with custom filename', () => {
    const customPath = '/tmp/test-auth-state-custom.json';
    const result = run(['save-state', '--filename', customPath]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(customPath)).toBe(true);
    fs.unlinkSync(customPath);
  });
});

describe('console and requests', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('console error exits 0', () => {
    const result = run(['console', 'error']);
    expect(result.exitCode).toBe(0);
  });

  it('console with invalid level exits 1', () => {
    const result = run(['console', 'invalid-level']);
    expect(result.exitCode).toBe(1);
  });

  it('requests exits 0', () => {
    const result = run(['requests']);
    expect(result.exitCode).toBe(0);
  });
});

describe('trace and video', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('trace-start and trace-stop', () => {
    expect(run(['trace-start']).exitCode).toBe(0);
    expect(run(['trace-stop']).exitCode).toBe(0);
  });

  it('video-start and video-stop', () => {
    expect(run(['video-start']).exitCode).toBe(0);
    execSync('sleep 1', { encoding: 'utf8' });
    expect(run(['video-stop']).exitCode).toBe(0);
  });
});

describe('lockfile stale detection', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('ensure works with stale lock present', () => {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
    fs.writeFileSync(LOCK_PATH, '99999');

    const result = run(['ensure']);
    expect(result.exitCode).toBe(0);
  });

  it('open detects and clears stale lock', () => {
    fs.writeFileSync(LOCK_PATH, '99999');
    const result = run(['open', 'https://example.org', HEADLESS]);
    expect(result.exitCode).toBe(0);
  });
});

describe('URL with dashes (parsing)', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('open with URL containing dashes in query string', () => {
    const result = run(['open', 'https://example.com/?redirect=-foo', HEADLESS]);
    expect(result.exitCode).toBe(0);
  });
});

describe('exec passthrough', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('exec eval returns page title', () => {
    const result = run(['exec', 'eval', 'document.title']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Example Domain');
  });

  it('exec snapshot exits 0', () => {
    const result = run(['exec', 'snapshot']);
    expect(result.exitCode).toBe(0);
  });

  it('exec with --tab selects tab then runs command', () => {
    run(['tab-new', 'https://example.org', '--name', 'test-tab']);
    const result = run(['exec', 'eval', 'window.location.href', '--tab', 'test-tab']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('example.org');
  });
});
