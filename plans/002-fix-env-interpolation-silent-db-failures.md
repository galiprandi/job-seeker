# Plan 002: Fix `${process.env.USER_ID}` in plain strings + silent DB failure swallowing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> If anything in "STOP conditions" occurs, stop and report — do not improvise.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 8dfd5ce..HEAD -- scripts/search-apply.js scripts/batch-easy-apply.js scripts/social.js scripts/generate-cv.js lib/browser-helpers.js`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (note: if plan 006 deleted some of these files first, skip the deleted ones and report)
- **Category**: bug
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

Four scripts embed `${process.env.USER_ID || 1}` inside **plain quoted strings** (not template literals). JS does not interpolate them, so Postgres receives the literal text `${process.env.USER_ID || 1}` as a user id, errors, and the error is swallowed by `catch → []`. Net effect today: `search-apply.js` and `batch-easy-apply.js` run with empty form answers (blank applications); `social.js` returns `{}` so outreach scripts may send placeholder URLs in real DMs; `generate-cv.js` can't load `cv_markdown` from DB. This is a "silently broken in production" bug class — the second half of the plan makes DB failures visible so it can't happen again.

## Current state

The pattern in all four sites (verbatim from `scripts/search-apply.js:56`):

```js
const row = dbQuery("SELECT ... FROM users WHERE id = ${process.env.USER_ID || 1}")[0];
```

The `"`/`'` quoted string means no interpolation — Postgres gets the literal `${…}` and throws.

Call sites:

- `scripts/search-apply.js:56` — `loadUserData()`
- `scripts/batch-easy-apply.js:45` — `loadUserData()`
- `scripts/social.js:9` — `getSocial()` SQL string
- `scripts/generate-cv.js:105` — `getMarkdownFromDB()` SQL string

Silent-swallow pattern (same shape in `search-apply.js:44-52`, `batch-easy-apply.js:37-42`, `social.js:16-18`, `lib/browser-helpers.js:296-309`):

```js
} catch (e) { return []; }   // dbQuery — SQL error invisible
} catch (e) {}               // dbWrite — insert failure invisible
```

Repo convention: DB access shells out to `node scripts/db.js "<sql>"` (read-only) or `--write`, JSON on stdout (see `scripts/db.js`). A correct template-literal example exists in `scripts/linkedin-easy-apply.js` — check `process.env.USER_ID || 1` usage there before editing.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Syntax check | `node --check <file>` | exit 0 |
| Find remaining sites | `grep -rn 'process.env.USER_ID' scripts/ lib/ \| grep -v '\`'` | only backticked/destructured sites remain |
| Verify db.js works | `node scripts/db.js --ping` | JSON pong (needs DATABASE_URL in `.env`; if absent, syntax checks suffice) |

## Scope

**In scope:**
- `scripts/search-apply.js`
- `scripts/batch-easy-apply.js`
- `scripts/social.js`
- `scripts/generate-cv.js`
- `lib/browser-helpers.js` (dbQuery/dbWrite error logging only)

**Out of scope:**
- Deleting dead scripts (plan 006 decides their fate — this plan fixes them in case they stay)
- Changing `db.js` itself (plan 005)
- The injection-shaped `${sql}` command-string pattern (plan 007)

## Steps

### Step 1: Fix the four interpolation sites

For each site, hoist the id into a real variable and interpolate it:

```js
const userId = process.env.USER_ID || 1;
const row = dbQuery(`SELECT ... FROM users WHERE id = ${userId}`)[0];
```

(Or just backtick the existing string — either is fine; hoisted const is clearer.) Apply to `search-apply.js:56`, `batch-easy-apply.js:45`, `social.js:9`, `generate-cv.js:105`.

**Verify**: `grep -rn '"[^`]*\${process.env.USER_ID\|'"'"'[^'"'"']*\${process.env.USER_ID' scripts/ lib/` → no matches. `node --check` on each touched file → exit 0.

### Step 2: Make DB failures visible

In each `dbQuery`/`dbWrite` catch block across the in-scope files AND `lib/browser-helpers.js`, add stderr logging — keep the silent-fallback return (scripts depend on it) but make the error observable:

```js
} catch (e) { console.error('[dbQuery] failed:', (e.stderr || e.message || '').toString().slice(0,300)); return []; }
```

Same for `dbWrite`. One line per catch; do not restructure.

**Verify**: `grep -rn "catch (e) { return \[\]; }\|catch (e) {}\|catch { return {}; }" scripts/ lib/` → no bare-silent catches remain in in-scope files.

### Step 3: Functional check (if DATABASE_URL available)

```bash
node -e "const s=require('./scripts/social.js'); console.log(JSON.stringify(s.getSocial()))"
```

**Verify**: prints an object (possibly `{}` if the key doesn't exist in DB) WITHOUT shell errors like `bad substitution`. If `.env`/`DATABASE_URL` is absent, skip this step and note it.

## Test plan

- No unit tests exist for these scripts (see plan 004 for the baseline effort). Machine checks above are the gate.
- If trivially possible, a `node --check` loop over all `scripts/**/*.js` is a good smoke step; otherwise defer to plan 004.

## Done criteria

- [ ] No `${…}` inside plain-quoted strings in `scripts/` and `lib/`
- [ ] `node --check` passes on all touched files
- [ ] Every `dbQuery`/`dbWrite` catch in touched files logs to stderr
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` updated

## STOP conditions

- Any of the four files was deleted by plan 006 first → skip it, note in the report.
- `social.js` usage pattern differs materially from the excerpt → re-read the file fully before editing; if `getSocial` is used by files outside scope, still fix it (it's a leaf bug) but flag in the report.

## Maintenance notes

- The deeper fix is plan 007 (`execFileSync` arg arrays) which removes the shell layer entirely — this plan is the minimal surgical fix.
- Reviewer: check that no new log line can leak `DATABASE_URL` — log `e.stderr`/`e.message` text only, never env.
