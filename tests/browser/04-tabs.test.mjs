/**
 * Tests de gestión de tabs: tab-new, tab-list, tab-select, tab-close, tab-close-all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { run, cleanup, HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D } from './helpers.mjs';

describe('tab management', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('tab-new creates a named tab', () => {
    const result = run(['tab-new', TEST_URL_B, '--name', 'tab-b']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Tab 'tab-b' created");
  });

  it('tab-new creates a second tab', () => {
    const result = run(['tab-new', TEST_URL_C, '--name', 'tab-c']);
    expect(result.exitCode).toBe(0);
  });

  it('tab-list shows all named tabs', () => {
    const result = run(['tab-list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('tab-b');
    expect(result.stdout).toContain('tab-c');
  });

  it('tab-list --json returns valid JSON with tabs array', () => {
    const result = run(['tab-list', '--json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed.tabs)).toBe(true);
    expect(parsed.tabs.length).toBeGreaterThanOrEqual(3);
  });

  it('tab-select selects a tab by name', () => {
    const result = run(['tab-select', 'tab-b']);
    expect(result.exitCode).toBe(0);
  });

  it('tab-select fails for nonexistent tab', () => {
    const result = run(['tab-select', 'nonexistent']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it('tab-close closes a tab by name', () => {
    const result = run(['tab-close', 'tab-c']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Tab 'tab-c' closed");
  });

  it('closed tab is removed from list', () => {
    const result = run(['tab-list']);
    expect(result.stdout).not.toContain('tab-c');
  });

  it('tab-close-all leaves only one tab', () => {
    run(['tab-new', TEST_URL_D, '--name', 'tab-d']);
    const result = run(['tab-close-all']);
    expect(result.exitCode).toBe(0);

    const listJson = JSON.parse(run(['tab-list', '--json']).stdout);
    expect(listJson.tabs.length).toBe(1);
  });
});
