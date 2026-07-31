---
name: memory
description: Autonomous user preference detection, storage and injection. The agent detects preferences from conversation, saves them to Postgres, and loads active ones at the start of every flow.
trigger: memory
---
# Memory — Autonomous preference management

This skill implements Gold Rule 3 (user preferences always up to date). The agent **proactively** detects, stores, and injects user preferences without being asked.

## When it runs

**Always.** This is not a flow triggered by a keyword. It is a background behavior that runs during every interaction:

1. **Detection**: after every user message, evaluate whether a preference was stated, implied, or corrected
2. **Injection**: at the pre-flight of every flow, load active preferences into context

## Detection

After every user message, scan for 3 signal types:

| Signal | Example | Confidence | Source |
|---|---|---|---|
| **Explicit** | "no quiero empresas de crypto" | 1.0 | `explicit_statement` |
| **Implicit** | "respondeme corto" | 0.7 | `inferred` |
| **Correction** | "actualmente busco roles de IC, no manager" | 1.0 | `correction` |

### Save vs skip checklist

**Save** (proactively, no need to ask):
- Job search preferences (roles, industries, locations, work mode, salary)
- Communication preferences (language, tone, length, format)
- Compensation criteria (range, equity, benefits)
- Tooling/workflow preferences (which platforms, how to apply)
- Corrections to anything previously stored
- Explicit requests: "recordá que..." / "remember that..."
- **Strategy level changes.** When the user's situation changes (employment status, urgency), detect and propose a strategy level change. See AGENTS.md "Strategy levels"

**Skip**:
- Trivial/obvious info ("user asked about Python")
- Already in CV or `users.data.profile` (don't duplicate)
- Already in `users.data.style_profile`
- Re-discoverable facts (can web search)
- Session-specific ephemera (temporary file paths, one-off debugging)
- Already in AGENTS.md or other context files

## Storage

All preferences live in the `preferences` table, accessed via `scripts/db.js`:

```sql
preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  category TEXT NOT NULL,        -- job_search, communication, compensation, tooling, workflow
  key TEXT NOT NULL,             -- e.g. "avoid_industries", "reply_language", "salary_min"
  value TEXT NOT NULL,           -- e.g. "crypto,gambling", "spanish", "5000"
  confidence REAL DEFAULT 1.0,   -- 1.0 explicit, 0.7 inferred, 0.5 auto-summarized
  source TEXT DEFAULT 'explicit_statement', -- explicit_statement | inferred | correction
  status TEXT DEFAULT 'active',  -- active | superseded
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, key)
)
```

### Categories

| Category | Examples |
|---|---|
| `job_search` | avoid_industries, target_roles, location_preference, work_mode, visa_requirements |
| `communication` | reply_language, reply_tone, reply_length, greeting_style, avoid_bullets |
| `compensation` | salary_min, salary_max, currency, equity_expectation, required_benefits |
| `tooling` | preferred_platforms, apply_method, browser_mode |
| `workflow` | application_batch_size, follow_up_timing, auto_apply_threshold, strategy_level |

### Save a new preference

```bash
node scripts/db.js "INSERT INTO preferences (user_id, category, key, value, confidence, source) VALUES (1, '<category>', '<key>', '<value>', <confidence>, '<source>') ON CONFLICT (user_id, category, key) DO UPDATE SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, source = EXCLUDED.source, updated_at = NOW()" --write
```

The `ON CONFLICT` clause handles updates: if the preference already exists, it replaces the value and bumps `updated_at`. No need to check first.

### Correction handling

When a correction is detected (user contradicts a stored preference), the same INSERT with `ON CONFLICT DO UPDATE` handles it. The old value is replaced, `source` becomes `correction`, and `updated_at` is bumped. The old value is not preserved (single user, no audit trail needed).

### Strategy level detection

The agent must detect signals that the user's job search situation has changed and propose a strategy level adjustment. This is Gold Rule 3 applied to urgency/aggressiveness.

| Signal | Example | Proposed level |
|---|---|---|
| Lost job / fired | "me despidieron", "me quedé sin trabajo", "lost my job" | `active` |
| About to lose job | "me van a despedir", "termina mi contrato en X", "my contract ends" | `active` |
| Desperation | "necesito algo ya", "urgentísimo", "need a job now" | `aggressive` |
| Found a job | "encontré trabajo", "acepté una oferta", "got the job" | `passive` |
| Employed, casually looking | "estoy viendo opciones", "open to opportunities" | `selective` |
| Wants more aggressive | "aplica más agresivo", "send more applications" | bump up one level |
| Wants less aggressive | "frená un poco", "too many applications" | bump down one level |

**When a strategy change is detected:**
1. Propose the change to the user (never change without asking)
2. Explain what will change (batch sizes, match threshold, relax rules)
3. Wait for confirmation
4. Save to `preferences` (`workflow.strategy_level`) and `users.data.strategy`
5. Report: "Estrategia actualizada: <level>"

## Injection

At the **pre-flight of every flow**, load active preferences:

```bash
node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
```

Inject the result into the flow's context. Treat preferences as constraints:
- `job_search.*` → filter jobs, discard non-matching
- `communication.*` → shape drafts (language, tone, length)
- `compensation.*` → filter by salary, negotiate
- `tooling.*` → choose platforms and methods
- `tooling.browser_mode` → controls browser visibility in all flows that use playwright-cli. Valid values: `headless` (always headless except manual login/2FA), `headed` (always headed), `headed_logins_only` (headed only for logins/2FA, headless otherwise), `ask_each_time` (agent asks before each browser session). Default if not set: `headed_logins_only`. Manual login/2FA is always headed regardless of this preference (Gold Rule 5)
- `workflow.*` → tune batch sizes and timing

**Confidence-aware**: preferences with `confidence < 1.0` (inferred) can be overridden by explicit user instructions in the current session. Preferences with `confidence = 1.0` (explicit) hold unless the user explicitly changes them.

## Rules

- **Proactive, not reactive.** Save when detected, don't wait to be asked
- **All DB access via `scripts/db.js`** (see `db` skill)
- **Don't duplicate.** If a preference is already in `users.data.profile` or `users.data.style_profile`, skip it. The `preferences` table is for things said in conversation that aren't captured by the structured profile
- **Single source of truth per (category, key).** Use `ON CONFLICT DO UPDATE`, never insert duplicates
- **Corrections replace, not append.** "actually I want X" updates the existing value
- **Inferred preferences are weaker.** Mark `confidence = 0.7` and `source = 'inferred'`. They can be overridden by explicit statements
- **Never ask "should I save this?".** If it passes the save checklist, save it silently
- **Report what was saved.** After saving, briefly mention: "Guardé que preferís X" / "Saved preference: X". One line, no ceremony

## Dependencies

- Depends on `onboarding` (DB + `users` table must exist)
- Uses `db` skill for all DB access
- Consumed by every flow via pre-flight injection
