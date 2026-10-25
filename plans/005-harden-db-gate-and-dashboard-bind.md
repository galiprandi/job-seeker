# Plan 005: Harden db.js write gate + bind dashboard to localhost

> **Executor instructions**: Follow step by step, verify each command.
> On STOP conditions, report — do not improvise. Update `plans/README.md`.
>
> **Drift check**: `git diff --stat 8dfd5ce..HEAD -- scripts/db.js scripts/dashboard.js`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

Two independent, one-line-class fixes:

1. `db.js` is the agent-facing SQL CLI whose only write protection is a start-of-string regex. Multi-statement input (`SELECT 1; DELETE …`), CTE writes (`WITH x AS (DELETE …)`), and `EXPLAIN ANALYZE <write>` all pass the gate without `--write`. LLM agents compose these queries — the gate should be real, not advisory.
2. `dashboard.js` binds `0.0.0.0`, exposing the full pipeline (companies, applications, strategy, user name) unauthenticated to anyone on the LAN — sensitive for a currently-employed user.

## Current state

`scripts/db.js`:

```js
// :74
const READ_ONLY_RE = /^\s*(select|with|show|explain|values|describe)\b/i;
// :164-166
const isReadOnly = READ_ONLY_RE.test(sql);
if (!isReadOnly && !flags.write) {
  fail('Refusing to run a write without --write. Add --write to confirm.');
}
// :174 — client.query(sql) accepts multi-statement input; r.command is undefined for it
```

`scripts/dashboard.js`:

```js
// :206
server.listen(port, () => { ... });   // binds 0.0.0.0
// :183-192 — /api/data returns the full pipeline unauthenticated
```

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Syntax | `node --check scripts/db.js scripts/dashboard.js` | 0 |
| Live check (if DB available) | `node scripts/db.js "SELECT 1"` | JSON rows; `node scripts/db.js "SELECT 1; SELECT 2"` → rejected |
| Dashboard | `node scripts/dashboard.js &` then `ss -tlnp \| grep <port>` or `lsof -i` | bound to 127.0.0.1 only |

## Scope

**In scope:** `scripts/db.js` (gate logic only), `scripts/dashboard.js` (listen host only).

**Out of scope:** the `${sql}` shell-interpolation inside callers (plan 007); dashboard auth beyond localhost bind; tests for the gate (plan 004 owns the suite — but if `tests/unit/` exists after 004, add the gate classification test there).

## Steps

### Step 1: Reject multi-statement input

In `db.js`, before the read-only check: reject any `;` that is not a single trailing `;` at end of input:

```js
const normalized = sql.trim().replace(/;$/, '');
if (normalized.includes(';')) fail('Multi-statement input is not allowed. Run one statement at a time.');
const isReadOnly = READ_ONLY_RE.test(normalized);
```

### Step 2: Tighten the read-only allowlist

`WITH` can contain `INSERT/UPDATE/DELETE`; `EXPLAIN ANALYZE` executes writes; `describe`/`values` are fine to keep but harmless to tighten. Minimal safe allowlist:

```js
const READ_ONLY_RE = /^\s*(select|show|explain(?!.*\banalyze\b)|values)\b/i;
```

Keep `with` OUT (CTE writes), keep `explain` only without `analyze`. Comment the reason in one line.

**Verify**:
```bash
node scripts/db.js "SELECT 1; SELECT 2"        # → refusal
node scripts/db.js "WITH x AS (SELECT 1) SELECT * FROM x"   # → refusal (requires --write; acceptable cost)
node scripts/db.js "SELECT 1"                  # → works
```

If a legitimate `WITH SELECT …` read is needed, agents can still run it with `--write` (it's only a gate flag, not a block). Document this tradeoff in the db.js usage string if it exists.

### Step 3: Localhost bind

```js
server.listen(port, '127.0.0.1', () => { ... });
```

Update the printed URL line if it says something else.

**Verify**: `node --check` clean; if the dashboard can run (DATABASE_URL set), `curl http://127.0.0.1:<port>/` works and the port is not on `0.0.0.0`.

## Test plan

- If `tests/unit/` exists (plan 004), add `db-gate.test.mjs`: spawn `node scripts/db.js` for cases: `SELECT 1` (allowed shape), `SELECT 1; SELECT 2` (refused), `WITH x AS (DELETE FROM t) SELECT 1` (refused unless --write), `EXPLAIN ANALYZE DELETE …` (refused). Gate may need DB connectivity — if unavailable, extract the classification into a pure function and unit-test that.
- If no test dir exists yet, the verification commands above suffice; note the deferral.

## Done criteria

- [ ] Multi-statement input rejected without `--write`
- [ ] `WITH`/`EXPLAIN ANALYZE` no longer in read-only fast path
- [ ] `node --check scripts/db.js scripts/dashboard.js` → 0
- [ ] Dashboard binds 127.0.0.1
- [ ] `plans/README.md` updated

## STOP conditions

- `client.query` signature/pool usage differs from excerpts → re-read the file; if the gate is elsewhere, adapt but keep semantics (single statement, strict read-only start).
- Legit multi-statement usage is found in callers (grep for `;.*;` in script-built SQL) → fix callers to split statements; if widespread, STOP and report scope growth.

## Maintenance notes

- The real fix for SQL-from-agents is parameterized access or a narrower API — out of scope, note as future direction.
- `fail()` calls `process.exit` inside `catch` before `client.end()` in `finally` — cosmetic, leave as is.
