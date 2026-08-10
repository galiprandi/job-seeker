/**
 * Tests empiricos: paralelizacion segura con ref-count y tab isolation.
 *
 * Antes de los fixes:
 *   Problema 1: dos agentes en la misma sesion sin --tab se pisan.
 *   Problema 2: close/close-all mata el browser para otros agentes.
 *   Problema 3: open con --session diferente mata el browser primario.
 *
 * Después de los fixes:
 *   - close verifica ref-count: si hay otros agentes, hace detach o falla.
 *   - close-all verifica ref-count: si hay otros agentes, falla salvo --force.
 *   - open con --session diferente hace attach en vez de matar el browser.
 *   - who muestra los agentes activos.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { run, runShell, cleanup, tmpDir,
  HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D } from './helpers.mjs';

describe('PROBLEMA 1: dos agentes en la misma sesion sin --tab se pisan', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('goto sin --tab: el segundo goto sobreescribe el primero (comportamiento documentado)', () => {
    // Agente A navega a example.org
    run(['goto', TEST_URL_B]);
    const afterA = run(['exec', 'eval', 'window.location.href']);
    expect(afterA.stdout).toContain(TEST_URL_B);

    // Agente B navega a example.net (sin --tab, misma sesion)
    run(['goto', TEST_URL_C]);
    const afterB = run(['exec', 'eval', 'window.location.href']);
    expect(afterB.stdout).toContain(TEST_URL_C);

    // El agente A perdio su URL — esto es el comportamiento esperado
    // cuando se usa la sesion primaria sin --tab.
    // La solucion es que cada agente paralelo use su propio tab o session.
    const aNow = run(['exec', 'eval', 'window.location.href']);
    expect(aNow.stdout).toContain(TEST_URL_C);
    expect(aNow.stdout).not.toContain(TEST_URL_B);
  });
});

describe('PROBLEMA 2 fix: close protege a otros agentes con ref-count', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('close de sesion attached con otros agentes activos hace detach (no mata)', () => {
    // Setup: primaria + 2 attached workers
    run(['open', TEST_URL_A, HEADLESS]);
    run(['tab-new', TEST_URL_B, '--name', 'gmail']);
    run(['tab-new', TEST_URL_C, '--name', 'linkedin']);
    run(['attach', '--session', 'gmail-worker']);
    run(['attach', '--session', 'linkedin-worker']);

    // Verificar que los workers estan vivos
    const gmailAlive = run(['exec', 'eval', '1+1', '--session', 'gmail-worker']);
    expect(gmailAlive.exitCode).toBe(0);

    // Cerrar gmail-worker: deberia hacer detach, no matar el browser
    const closeResult = run(['close', '--session', 'gmail-worker']);
    expect(closeResult.exitCode).toBe(0);
    expect(closeResult.stderr).toContain('detached');

    // linkedin-worker deberia seguir vivo
    const linkedinAfter = run(['exec', 'eval', '1+1', '--session', 'linkedin-worker']);
    expect(linkedinAfter.exitCode).toBe(0);
  });

  it('close de sesion primaria con agentes activos falla sin --force', () => {
    // Primaria + 1 worker
    run(['open', TEST_URL_A, HEADLESS]);
    run(['attach', '--session', 'worker-x']);

    // Intentar close de primaria sin --force
    const closeResult = run(['close']);
    expect(closeResult.exitCode).not.toBe(0);
    expect(closeResult.stderr).toContain('Refusing to close');
    expect(closeResult.stderr).toContain('--force');

    // El worker deberia seguir vivo
    const workerAfter = run(['exec', 'eval', '1+1', '--session', 'worker-x']);
    expect(workerAfter.exitCode).toBe(0);
  });

  it('close de sesion primaria con --force mata todo', () => {
    run(['open', TEST_URL_A, HEADLESS]);
    run(['attach', '--session', 'worker-y']);

    const closeResult = run(['close', '--force']);
    expect(closeResult.exitCode).toBe(0);

    // Todo muerto
    const workerAfter = run(['exec', 'eval', '1+1', '--session', 'worker-y']);
    expect(workerAfter.exitCode).not.toBe(0);
  });

  it('close-all con agentes activos falla sin --force', () => {
    run(['open', TEST_URL_A, HEADLESS]);
    run(['attach', '--session', 'worker-z1']);
    run(['attach', '--session', 'worker-z2']);

    const result = run(['close-all']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Refusing to close all');

    // Los workers siguen vivos
    const z1 = run(['exec', 'eval', '1+1', '--session', 'worker-z1']);
    expect(z1.exitCode).toBe(0);
  });

  it('close-all --force mata todo', () => {
    // Ya tenemos workers z1 y z2 del test anterior
    const result = run(['close-all', '--force']);
    expect(result.exitCode).toBe(0);

    const z1 = run(['exec', 'eval', '1+1', '--session', 'worker-z1']);
    expect(z1.exitCode).not.toBe(0);
  });
});

describe('PROBLEMA 3 fix: open con --session diferente hace attach', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('open con sesion ya activa hace goto (no mata)', () => {
    run(['open', TEST_URL_A, HEADLESS]);
    const before = run(['exec', 'eval', 'window.location.href']);
    expect(before.stdout).toContain(TEST_URL_A);

    // Segundo open: deberia hacer goto, no matar
    run(['open', TEST_URL_B, HEADLESS]);
    const after = run(['exec', 'eval', 'window.location.href']);
    expect(after.stdout).toContain(TEST_URL_B);
  });

  it('open con --session diferente hace attach (no mata el primario)', () => {
    run(['open', TEST_URL_A, HEADLESS]);

    // Abrir con sesion nombrada diferente: deberia attach, no matar
    const result = run(['open', TEST_URL_B, HEADLESS, '--session', 'second']);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Attaching');

    // La sesion primaria deberia seguir viva
    const primaryAfter = run(['exec', 'eval', 'window.location.href']);
    expect(primaryAfter.exitCode).toBe(0);
    expect(primaryAfter.stdout).toContain(TEST_URL_A);

    // La sesion second deberia estar viva y en TEST_URL_B
    const secondAfter = run(['exec', 'eval', 'window.location.href', '--session', 'second']);
    expect(secondAfter.exitCode).toBe(0);
    expect(secondAfter.stdout).toContain(TEST_URL_B);
  });
});

describe('SOLUCION: tab isolation con --tab', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
    run(['tab-new', TEST_URL_B, '--name', 'agent-a']);
    run(['tab-new', TEST_URL_C, '--name', 'agent-b']);
  });
  afterAll(() => cleanup());

  it('goto con --tab diferente no interfere', () => {
    run(['goto', TEST_URL_D, '--tab', 'agent-a']);
    run(['goto', TEST_URL_A, '--tab', 'agent-b']);

    const aUrl = run(['exec', 'eval', 'window.location.href', '--tab', 'agent-a']);
    const bUrl = run(['exec', 'eval', 'window.location.href', '--tab', 'agent-b']);

    expect(aUrl.stdout).toContain(TEST_URL_D);
    expect(bUrl.stdout).toContain(TEST_URL_A);
  });
});

describe('who: listar agentes activos', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('who muestra agentes attached activos', () => {
    run(['open', TEST_URL_A, HEADLESS]);
    run(['attach', '--session', 'worker-1']);

    const result = run(['who']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Active attached agents');
    expect(result.stdout).toContain('worker-1');
  });

  it('who muestra "no agents" cuando no hay attached sessions', () => {
    // Ensure clean state: no attached sessions from previous tests
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
    const result = run(['who']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No attached agents');
  });
});
