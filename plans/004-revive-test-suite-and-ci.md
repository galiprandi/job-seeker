> **Note (agent-browser migration, 2026):** playwright-cli has been replaced by agent-browser behind the same `browser.js` wrapper. Where this plan references `playwright-cli`, `.playwright-cli/`, `ref=eN`, `attach`/`detach`/`ensure`, or Page-object APIs, read them as their agent-browser equivalents (`exec` passthrough, `@eN` refs, implicit `--session`, eval-based helpers).
# Plan 004: Revive the test suite and make CI actually verify something

> **Executor instructions**: Follow step by step. Run every verification and
> confirm expected output. On STOP conditions, report — do not improvise.
> Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 8dfd5ce..HEAD -- tests/ .github/workflows/ vitest.config.mjs package.json`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED (fixing tests may surface real bugs — that's the point; report them, don't fix beyond test scope)
- **Depends on**: plans/003 (wrapper path fix in non-test files) — can technically run first, but 003 is a prerequisite for sane state
- **Category**: tests / dx
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

`npm test` is fully red: every test funnels through `helpers.mjs` which points at the deleted `scripts/browser.js`, and asserts a config path (`.playwright/cli.config.json`) that doesn't exist on a clean clone. CI runs only `docs:build` — a syntax error in any of ~40 scripts ships silently. There is currently no one-command way to know the repo works. This is the prerequisite for every refactor plan that follows.

## Current state

`tests/browser/helpers.mjs`:

```js
// :13
const BROWSER_JS = path.join(REPO_ROOT, 'scripts', 'browser.js');   // doesn't exist
// :15
const CONFIG_PATH = path.join(REPO_ROOT, '.playwright', 'cli.config.json'); // gitignored, onboarding-created
```

- Real wrapper: `.agents/skills/browser-automation/scripts/browser.js`
- Real browser config: `.browser-config.json` (repo root) — verify which file the wrapper actually reads before fixing the assertion
- `vitest.config.mjs` includes `tests/**/*.test.mjs`, sequential pool, 60s timeouts
- `tests/browser/09-warm-sourcing.test.mjs` is a real fixture-based test (model pattern) but spawns `python3 -m http.server` — undocumented prerequisite
- `.github/workflows/ci.yml` currently: `npm install` → `npm run docs:build` on `macos-latest`

```yaml
      - run: npm install
      - run: npm run docs:build
```

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `npm test` | vitest run; green after fix |
| Syntax sweep | `find scripts lib -name "*.js" -exec node --check {} +` | exit 0 (or list of files that were already broken — report them, don't fix) |
| CI file | `cat .github/workflows/ci.yml` | shows new steps |

## Scope

**In scope:** `tests/**`, `.github/workflows/ci.yml`, `vitest.config.mjs`, `package.json` (scripts only), optionally `CONTRIBUTING.md` (document python3 prerequisite OR drop it per step 4)

**Out of scope:** fixing bugs the revived suite uncovers in `scripts/` (report them as follow-ups); docs/ VitePress content.

## Steps

### Step 1: Repoint helpers.mjs

```js
const BROWSER_JS = path.join(REPO_ROOT, '.agents', 'skills', 'browser-automation', 'scripts', 'browser.js');
```

Fix `CONFIG_PATH` assertion: find what the wrapper actually reads (`grep -n "browser-config\|cli.config" .agents/skills/browser-automation/scripts/browser.js`) and update `01-syntax-config.test.mjs` accordingly — config may not exist pre-onboarding; make the test tolerate absence or create a fixture config in `beforeAll`.

**Verify**: `node --check tests/browser/helpers.mjs` → 0.

### Step 2: Split browser tests from hermetic tests

Browser tests need a real browser + profile — they can't run on clean CI reliably. Establish:
- `tests/unit/` for hermetic tests (start with `node --check` sweep as a test: assert `node --check` exits 0 for every `scripts/**/*.js` — ~20 lines, catches the syntax-error class immediately)
- Keep `tests/browser/` under `test:browser` script (already exists in package.json)
- Update `vitest.config.mjs` `include` to `tests/**/*.test.mjs` but set `npm test` to run only `tests/unit/` (`"test": "vitest run tests/unit/"`); `test:browser` keeps the full suite.

**Verify**: `npm test` runs the unit subset only and passes.

### Step 3: Write the syntax-sweep unit test

`tests/unit/scripts-syntax.test.mjs`: glob all `scripts/**/*.js` + `lib/**/*.js`, `spawnSync('node', ['--check', f])`, assert exit 0, collect failures into one assertion message. Follow ESM + vitest style of existing tests (`.test.mjs`, `import { test, expect } from 'vitest'`).

**Verify**: `npm test` → passes; if it fails because a script is genuinely broken, record the file list in the report and mark those expectations with a TODO list constant at the top of the test (documented debt, not silence).

### Step 4: Resolve the python3 prerequisite

`09-warm-sourcing.test.mjs` needs `python3 -m http.server` for the fixture. Either swap to Node `http.createServer` (preferred — one less dep; the old comment about timeouts is from an earlier era, re-verify) or document `python3` in CONTRIBUTING.md under test prerequisites.

### Step 5: CI

Update `.github/workflows/ci.yml`:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run docs:build
```

Optionally switch runner to `ubuntu-latest` (cheaper; browser tests don't run here anyway).

**Verify**: `npm ci` and `npm test` pass locally.

## Test plan

- The new unit test IS the test plan artifact.
- Coverage next-step (out of scope but note in report): `db.js` read-only gate classification, `pipeline.js moveCard` transitions, `social.js` interpolation — flagged by plan 002/005.

## Done criteria

- [ ] `npm test` exits 0 on a clean checkout
- [ ] `npm run test:browser` still exists and targets `tests/browser/`
- [ ] CI runs `npm ci` + `npm test`
- [ ] No `scripts/browser.js` references in `tests/`
- [ ] `plans/README.md` updated

## STOP conditions

- The wrapper reads a different config file than expected and no candidate config file exists in-repo → STOP, report which file it actually reads.
- Browser tests can't be made non-red without a real browser environment → keep them under `test:browser` only; that IS the resolution, not a stop.
- `npm test` reveals genuine script bugs (e.g. `node --check` failures) → record them, TODO-list them in the test, don't fix here.

## Maintenance notes

- Once green, keep `npm test` as the pre-commit gate. The `node --check` sweep is deliberately coarse — expand `tests/unit/` opportunistically (db.js gate is the next candidate per plan 005).
