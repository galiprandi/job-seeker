/**
 * Tests de sesiones nombradas y attach/detach para paralelismo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { run, cleanup, HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C } from './helpers.mjs';

describe('named sessions', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('open with --session exits 0', () => {
    const result = run(['open', TEST_URL_A, HEADLESS, '--session', 'test-session']);
    expect(result.exitCode).toBe(0);
  });

  it('ensure with --session exits 0', () => {
    const result = run(['ensure', '--session', 'test-session']);
    expect(result.exitCode).toBe(0);
  });

  it('goto with --session exits 0', () => {
    const result = run(['goto', TEST_URL_B, '--session', 'test-session']);
    expect(result.exitCode).toBe(0);
  });

  it('close with --session exits 0', () => {
    const result = run(['close', '--session', 'test-session']);
    expect(result.exitCode).toBe(0);
  });
});

describe('attach/detach', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
    run(['tab-new', TEST_URL_B, '--name', 'gmail']);
    run(['tab-new', TEST_URL_C, '--name', 'linkedin']);
  });
  afterAll(() => cleanup());

  it('attach creates a new session', () => {
    const result = run(['attach', '--session', 'gmail-worker']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('attached');
  });

  it('attach creates a second session', () => {
    const result = run(['attach', '--session', 'linkedin-worker']);
    expect(result.exitCode).toBe(0);
  });

  it('attach existing session is idempotent', () => {
    const result = run(['attach', '--session', 'gmail-worker']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('already exists');
  });

  it('list shows attached sessions', () => {
    const result = run(['list']);
    expect(result.stdout).toContain('gmail-worker');
    expect(result.stdout).toContain('linkedin-worker');
  });

  it('detach removes a session', () => {
    const result = run(['detach', '--session', 'gmail-worker']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('detached');
  });

  it('detach removes second session', () => {
    const result = run(['detach', '--session', 'linkedin-worker']);
    expect(result.exitCode).toBe(0);
  });
});
