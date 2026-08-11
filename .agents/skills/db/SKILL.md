---
name: db
description: Safe Postgres CLI. Reads DATABASE_URL from .env, runs SQL, prints JSON. Read-only by default.
trigger: db
---
# db — Postgres CLI for agents

`scripts/db.js` is the single entry point to the database. Use it instead of `psql` or inline `pg` scripts.

## Why

- Reads `DATABASE_URL` from `.env` automatically. No manual sourcing, no leaked credentials.
- Read-only by default. Writes require explicit `--write`. Prevents accidental destructive SQL.
- JSON output. Easy to parse, token-efficient.
- Portable. Works on any machine that cloned the repo and ran onboarding (no `psql` in PATH required).
- Never prints the connection string. `--ping` shows masked `user@host/db` only.

## Commands

```bash
# Read (default, JSON array out)
node scripts/db.js "SELECT * FROM users WHERE id = 1"
node scripts/db.js "SELECT data->'profile' AS profile FROM users WHERE id = 1"

# Write (requires --write)
node scripts/db.js "INSERT INTO applications (user_id, platform, company, role, url, status, data) VALUES (1, 'linkedin', 'Acme', 'Eng Manager', 'https://...', 'applied', '{}'::jsonb)" --write
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{linkedin_profile}', '\"https://...\"') WHERE id = 1" --write

# Introspection
node scripts/db.js --tables
node scripts/db.js --schema applications
node scripts/db.js --ping
```

## Rules

- **Always use this CLI** for DB access. Never write inline `pg` scripts in skills, never call `psql` directly.
- **Read-only by default.** A statement that does not start with `SELECT/WITH/SHOW/EXPLAIN/VALUES/DESCRIBE` is refused without `--write`.
- **Output is JSON.** SELECTs print `[{...}, ...]`. Writes print `{rowCount, command}`.
- **Never echo `DATABASE_URL`.** If you need to confirm connectivity, use `--ping` (masked).
- **Parametrize when needed** by interpolating safely into the SQL string. This CLI has no parameter binding for CLI args; for user-supplied strings, escape single quotes (`'` -> `''`).
- **JSONB access:** use `data->'key'` (jsonb) or `data->>'key'` (text). Use `jsonb_set` for updates.

## Schema reference

Tables live in `public`. Discover with `--tables` and `--schema <table>`. Known tables:

- `users` — single row (repo owner). `data` JSONB holds `profile`, `job_preferences`, `style_profile`, `platforms`, `linkedin_profile`.
- `applications` — `user_id, platform, company, role, url, status, applied_at, data`.
- `messages` — recruiter / contact messages.

### `applications` table

**Columns:** `id, user_id, platform, company, role, url, status, applied_at, data`

**Platforms used:**
- `linkedin` = Easy Apply jobs
- `linkedin_invite` = connection requests
- `email` = direct emails to recruiters
- `teamtailor` = applications via Teamtailor (with LinkedIn auth, email verification, Connect)
- `humand` = applications via Humand.co
- `<company>_career_site`, etc. = specific career sites

**Status values (pipeline stages, canonical):**

Active stages (left to right in the kanban):
- `discovered` = found but no action taken
- `contacted` = invite/email sent, no formal application
- `applied` = application submitted
- `in_review` = company reviewing, no response
- `screening` = screening call scheduled/done
- `interview` = technical interview in progress
- `offer` = offer received, negotiating
- `hired` = accepted, starting

Closed stages (shown with `--closed`):
- `rejected` = company rejected
- `withdrawn` = user withdrew
- `skipped` = decided not to apply / not a fit

**`data` JSONB:** include `source`, `match` (high/medium/low), `location`, `tech` array, `stage_history` array (audit trail of status changes), and any relevant metadata.

## Helper library

`lib/browser-helpers.js` provides atomic helpers that prevent session death between browser calls:

```js
const {
  goto, evalJS, evalJSON, clickByText,
  waitFor, waitForSelector, waitForText,
  snapshotReliable, dismissModals,
  dbQuery, dbWrite,
  // Atomic helpers (prevent session death between calls)
  openAndEval, openAndEvalJSON,
  gotoAndEval, gotoAndEvalJSON,
} = require('./lib/browser-helpers');
```

**Atomic helpers** chain `open/goto + eval` in a single shell command to prevent session death between calls:

```js
// Open browser + extract in one call (no session death risk)
const jobs = openAndEvalJSON(
  'https://www.linkedin.com/jobs/search/?keywords=...',
  `(function(){ ... return JSON.stringify(...); })()`,
  { session: 'my-session', headed: true }
);

// Navigate + extract in one call (browser already open)
const emails = gotoAndEvalJSON(
  'https://mail.google.com/mail/u/0/#all',
  `(function(){ ... return JSON.stringify(...); })()`,
  { session: 'my-session' }
);
```

## Dependencies

- Depends on `onboarding` (`.env` + DB must exist).
- Consumed by every flow that reads or writes DB: `profile`, `apply`, `news`, `daily`.
