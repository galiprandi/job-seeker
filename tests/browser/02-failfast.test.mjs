/**
 * Tests de fail-fast: todos los comandos deben fallar claramente cuando
 * no hay una sesión activa del browser.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { run, cleanup } from './helpers.mjs';

describe('fail-fast without session', () => {
  beforeAll(() => cleanup());

  it('goto fails with clear error', () => {
    const result = run(['goto', 'https://example.com']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No active session');
  });

  it('close fails with clear error', () => {
    const result = run(['close']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No active session');
  });

  it('ensure fails with clear error', () => {
    const result = run(['ensure']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No healthy session');
  });

  it('exec fails with clear error', () => {
    const result = run(['exec', 'snapshot']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No active session');
  });

  it('tab-list fails without session', () => {
    const result = run(['tab-list']);
    expect(result.exitCode).toBe(1);
  });

  it('save-state fails without session', () => {
    const result = run(['save-state']);
    expect(result.exitCode).toBe(1);
  });

  it('load-state fails without session', () => {
    const result = run(['load-state']);
    expect(result.exitCode).toBe(1);
  });

  it('tab-new fails without session', () => {
    const result = run(['tab-new', 'https://example.com', '--name', 'test']);
    expect(result.exitCode).toBe(1);
  });

  it('tab-select fails without session', () => {
    const result = run(['tab-select', 'test']);
    expect(result.exitCode).toBe(1);
  });

  it('trace-start fails without session', () => {
    const result = run(['trace-start']);
    expect(result.exitCode).toBe(1);
  });

  it('console fails without session', () => {
    const result = run(['console', 'error']);
    expect(result.exitCode).toBe(1);
  });

  it('requests fails without session', () => {
    const result = run(['requests']);
    expect(result.exitCode).toBe(1);
  });
});
