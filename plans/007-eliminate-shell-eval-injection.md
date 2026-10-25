# Plan 007: Eliminate shell/eval injection surfaces in surviving scripts

> **Executor instructions**: Follow step by step, verify each command.
> On STOP conditions, report — do not improvise. Update `plans/README.md`.
>
> **Drift check**: `git diff --stat 8dfd5ce..HEAD -- scripts/linkedin-easy-apply.js scripts/gmail-send.js lib/browser-helpers.js scripts/generate-cv.js`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches every call site; do it mechanically, keep behavior identical
- **Depends on**: plans/002 (env-interp fixes first), 006 (don't fix files about to be deleted)
- **Category**: security
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

Scraped page content (job titles, company names — attacker-controlled: anyone can post a job) and DB values flow into `execSync("… \"${var}\" …")` strings where `"`, `$()`, and backticks execute shell; and into page-`eval` JS strings where `'` breaks or injects code in the logged-in LinkedIn context (session cookies reachable). Local single-user tool, so impact is bounded — but the injection classes are real and cheap to eliminate.

## Current state

In-scope surviving files (post-006). Confirmed sites:

```js
// lib/browser-helpers.js — dbQuery/dbWrite (~296-309): SQL into "..." arg;
// goto "${url}" (:59); screenshot --filename ${name} unquoted (:357);
// clickByText interpolates selector into JS source (:207-216)
// scripts/linkedin-easy-apply.js:512 — dbWrite interpolates company/role (scraped);
//   :71-76 — fill/selectOption interpolate DB answers; :39 — -s=${SESSION} unquoted
// scripts/gmail-send.js:66 — --body/--subject args interpolated
// scripts/generate-cv.js:512-513 — escapedPath escapes ' but not "/$
```

In-repo proven safe patterns to adopt:

```js
// scripts/easy-apply-one.js:30-31 — eval code via base64: eval(atob('…')) — BUT see note
// scripts/easy-apply-one.js:85 — data via window.__EA = ${JSON.stringify(obj)}
```

Note the base64/atob channel mangles non-ASCII (UTF-8 → Latin-1). When using it, decode with `decodeURIComponent(escape(atob(b64)))` OR use `JSON.stringify` embedding (handles UTF-8 natively) — prefer JSON.stringify.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Syntax | `node --check <file>` | 0 |
| Find remaining sites | `grep -n 'execSync(\`' scripts/ lib/` | only array-form or safe-escaped sites |

## Scope

**In scope:** `lib/browser-helpers.js`, `scripts/linkedin-easy-apply.js`, `scripts/gmail-send.js`, `scripts/generate-cv.js` — and any survivors from plan 006 sharing the pattern.

**Out of scope:** `db.js` internals (plan 005); redesigning the shell-out model to an import-based API (bigger refactor — note as follow-up).

## Steps

### Step 1: Centralize safe SQL passthrough in `lib/browser-helpers.js`

`dbQuery`/`dbWrite` currently build `node db.js "${sql}"`. Replace string interpolation with stdin-based passing — add a `--stdin` flag to `scripts/db.js` (read query from stdin when present) OR switch call sites to `execFileSync('node', [dbPath, sql], {…})` (args never touch a shell — simplest; no db.js change needed). Prefer `execFileSync`.

**Verify**: `node --check` clean; a manual call with SQL containing `'"$()'` survives (if DB available, run a `SELECT` containing a literal apostrophe in a string constant).

### Step 2: Fix browser-command call sites in `lib/browser-helpers.js`

- `goto "${url}"` → `execFileSync(BROWSER, ['exec','goto',url], …)` or quote via `JSON.stringify(url)` — pick ONE convention for the whole module (`execFileSync` preferred).
- `screenshot --filename ${name}` → pass as separate arg.
- `evalJS`/`evalJSON`: keep the string arg but wrap the JS source via `JSON.stringify(src)` so quotes/UTF-8 survive.
- `clickByText`: inject the selector text via `JSON.stringify`, not `'…'` interpolation.

### Step 3: Fix `linkedin-easy-apply.js` and `gmail-send.js` interpolations

- `:512` dbWrite — route through the fixed helper.
- `:71-76` fill/selectOption — `JSON.stringify(value)` when interpolating into eval JS.
- `:39` `-s=${SESSION}` → `['--session', SESSION]` arg form.
- `gmail-send.js:66` — same arg-array treatment for `--body`/`--subject`/`--to`.

**Verify**: `node --check` each; `grep -n 'execSync(\`' <file>` → remaining sites all use a reviewed-safe pattern.

### Step 4: `generate-cv.js` path escaping

`:512-513` — replace hand-rolled escaping with arg-array passing (same convention as step 2).

## Test plan

- If `tests/unit/` exists: unit-test `dbQuery` with SQL containing `"'$()` (spawn real db.js with `--ping`-adjacent harmless input or mock execFileSync) — assert no shell interpretation. Otherwise the grep + `node --check` gates stand.
- Manual smoke (if session available): one `evalJS` call with an apostrophe-containing string.

## Done criteria

- [ ] No `execSync` template string interpolates un-sanitized scraped/DB/argv values in in-scope files
- [ ] `node --check` clean on all touched files
- [ ] UTF-8 text (accents) survives the eval channel — verified by a manual eval writing `áéíóú` and reading it back
- [ ] `plans/README.md` updated

## STOP conditions

- A call site genuinely requires shell semantics (pipes, redirects) — none are expected; if found, STOP and report instead of flattening.
- `lib/browser-helpers.js` consumers diverge from its exported API → STOP, report.

## Maintenance notes

- Long-term direction: drop the shell-to-db.js layer entirely — import a shared `lib/db.js` (pg client) in-process; removes the whole bug class. Deferred: bigger refactor, needs the test baseline from plan 004.
- Reviewer: check every remaining `execSync(` call after this plan — each should either take literal strings or use `execFileSync` arrays.
