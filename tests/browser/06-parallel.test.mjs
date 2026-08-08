/**
 * Tests de paralelismo: ejecución concurrente con attached sessions.
 * Verifica que cada worker opera en su tab correcto sin interferencia.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { run, runShell, cleanup, tmpDir, BROWSER_JS,
  HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D } from './helpers.mjs';

describe('parallel read', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
    run(['tab-new', TEST_URL_B, '--name', 'gmail']);
    run(['tab-new', TEST_URL_C, '--name', 'linkedin']);
    run(['attach', '--session', 'gmail-worker']);
    run(['attach', '--session', 'linkedin-worker']);
  });
  afterAll(() => {
    run(['detach', '--session', 'gmail-worker']);
    run(['detach', '--session', 'linkedin-worker']);
    cleanup();
  });

  it('each worker reads its own tab correctly in parallel', () => {
    const dir = tmpDir();
    const gmailFile = path.join(dir, 'g.txt');
    const linkedinFile = path.join(dir, 'l.txt');

    runShell(
      `node ${BROWSER_JS} exec eval "window.location.href" --tab gmail --session gmail-worker > "${gmailFile}" 2>&1 & ` +
      `node ${BROWSER_JS} exec eval "window.location.href" --tab linkedin --session linkedin-worker > "${linkedinFile}" 2>&1 & ` +
      `wait`
    );

    const gmailOutput = fs.readFileSync(gmailFile, 'utf8');
    const linkedinOutput = fs.readFileSync(linkedinFile, 'utf8');

    expect(gmailOutput).toContain(TEST_URL_B);
    expect(linkedinOutput).toContain(TEST_URL_C);

    fs.rmSync(dir, { recursive: true });
  });
});

describe('parallel write + no interference', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
    run(['tab-new', TEST_URL_B, '--name', 'gmail']);
    run(['tab-new', TEST_URL_C, '--name', 'linkedin']);
    run(['attach', '--session', 'gmail-worker']);
    run(['attach', '--session', 'linkedin-worker']);
  });
  afterAll(() => {
    run(['detach', '--session', 'gmail-worker']);
    run(['detach', '--session', 'linkedin-worker']);
    cleanup();
  });

  it('each worker navigates to a different URL in parallel', () => {
    const dir = tmpDir();
    const gmailFile = path.join(dir, 'g.txt');
    const linkedinFile = path.join(dir, 'l.txt');

    runShell(
      `node ${BROWSER_JS} goto "${TEST_URL_D}" --tab gmail --session gmail-worker > "${gmailFile}" 2>&1 & ` +
      `node ${BROWSER_JS} goto "${TEST_URL_A}" --tab linkedin --session linkedin-worker > "${linkedinFile}" 2>&1 & ` +
      `wait`
    );

    const gmailNav = fs.readFileSync(gmailFile, 'utf8');
    const linkedinNav = fs.readFileSync(linkedinFile, 'utf8');

    expect(gmailNav).toContain(TEST_URL_D);
    expect(linkedinNav).toContain(TEST_URL_A);

    fs.rmSync(dir, { recursive: true });
  });

  it('no interference: each worker still on its navigated URL', () => {
    const gmailVerify = run(['exec', 'eval', 'window.location.href', '--tab', 'gmail', '--session', 'gmail-worker']);
    const linkedinVerify = run(['exec', 'eval', 'window.location.href', '--tab', 'linkedin', '--session', 'linkedin-worker']);

    expect(gmailVerify.stdout).toContain(TEST_URL_D);
    expect(linkedinVerify.stdout).toContain(TEST_URL_A);
  });
});
