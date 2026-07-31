# DATA.md — Data map

Single source of truth for what data lives where. The agent reads this to know what resources exist without having to discover them by querying.

All access via `scripts/db.js` (see `db` skill). All tables in `public` schema. Single user (`user_id = 1`).

## Tables

### `users`

Single row. Structured columns + `data` JSONB for semi-structured profile info.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | Always 1 (single user) |
| `name` | TEXT | User's full name |
| `email` | TEXT | User's email (unique) |
| `data` | JSONB | All semi-structured data (see below) |

#### `users.data` JSONB keys

| Key | Type | What it holds | Written by | Read by |
|---|---|---|---|---|
| `profile` | object | CV extraction: name, title, summary, skills, experience, education, languages, projects, github, blog, cv_url | `profile` | `apply`, `news`, `daily` |
| `job_preferences` | object | 30 questionnaire answers with Must/Strong/Nice weights: role_types, seniority, location, modalities, salary, equity, stack, ai_focus, ai_role_type, deal_breakers, industries_preferred, industries_avoid, etc. | `profile` | `apply`, `news`, `daily` |
| `style_profile` | object | Communication style: tone, language, length, greeting, closing, emojis, bullet_lists, characteristics, samples, preferences_confirmed | `profile` | `news` (drafting replies), all flows (language) |
| `platforms` | object | Platform tier assignment (output of analysis, not user input): `tier_1`, `tier_2`, `tier_3`, `discarded`. Each tier is an array of `{name, reason}` | `profile` | `radar`, `apply`, `news` |
| `target_companies` | object | Curated target companies by region: `latam`, `argentina`, etc. Each is an array of `{name, url, sector}` | `profile` or manual | `apply` (priority targets) |
| `linkedin_profile` | string | LinkedIn profile URL | `onboarding` | `apply`, `news` |
| `last_review_at` | string (ISO) | Timestamp of last `news` run. Used to filter emails since last review | `news` | `news`, `daily` |

Access:
```bash
node scripts/db.js "SELECT data->'<key>' AS <key> FROM users WHERE id = 1"
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{<key>}', '<json>'::jsonb) WHERE id = 1" --write
```

### `applications`

Every job application registered.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER FK → users | Always 1 |
| `platform` | TEXT | e.g. `linkedin`, `torre`, `builtin` |
| `company` | TEXT | Company name |
| `role` | TEXT | Job title |
| `url` | TEXT | Job posting URL (used for dedup) |
| `status` | TEXT | `applied`, `interviewing`, `offered`, `rejected`, `withdrawn`, `follow_up_sent` |
| `applied_at` | TIMESTAMPTZ | Default NOW() |
| `data` | JSONB | Match reason, method (easy_apply), location, questions_answered count |

Access:
```bash
node scripts/db.js "SELECT * FROM applications WHERE user_id = 1 ORDER BY applied_at DESC"
node scripts/db.js "SELECT url FROM applications WHERE user_id = 1"  # dedup check
node scripts/db.js "SELECT max(applied_at) AS last_application FROM applications WHERE user_id = 1"  # daily decision
node scripts/db.js "INSERT INTO applications (user_id, platform, company, role, url, status, data) VALUES (1, '<platform>', '<company>', '<role>', '<url>', 'applied', '<json>'::jsonb)" --write
```

Written by: `apply`. Read by: `apply` (dedup), `news` (status updates), `daily` (last application date).

### `messages`

Recruiter and contact messages, with drafts and send tracking.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | |
| `application_id` | INTEGER FK → applications (nullable) | Linked application if any |
| `user_id` | INTEGER FK → users | Always 1 |
| `channel` | TEXT | `gmail`, `linkedin`, `platform` |
| `direction` | TEXT | `inbound`, `outbound` |
| `sender` | TEXT | Sender name/email |
| `subject` | TEXT | Message subject |
| `body` | TEXT | Message body |
| `draft` | TEXT | Draft prepared by agent (pre-approval) |
| `status` | TEXT | `pending`, `approved`, `sent`, `ignored`, `draft` |
| `received_at` | TIMESTAMPTZ | When inbound message arrived |
| `sent_at` | TIMESTAMPTZ | When outbound message was sent |
| `data` | JSONB | Extra metadata |

Access:
```bash
node scripts/db.js "SELECT * FROM messages WHERE user_id = 1 AND status = 'draft' ORDER BY received_at DESC"
node scripts/db.js "INSERT INTO messages (user_id, channel, direction, sender, subject, body, draft, status, received_at) VALUES (1, '<channel>', '<direction>', '<sender>', '<subject>', '<body>', '<draft>', 'draft', NOW())" --write
node scripts/db.js "UPDATE messages SET status = 'sent', sent_at = NOW() WHERE id = <id>" --write
```

Written by: `news`. Read by: `news`, `daily`.

### `preferences`

Autonomous preference storage. Populated by the `memory` skill from conversation signals.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER FK → users | Always 1 |
| `category` | TEXT | `job_search`, `communication`, `compensation`, `tooling`, `workflow` |
| `key` | TEXT | e.g. `avoid_industries`, `reply_language`, `salary_min` |
| `value` | TEXT | e.g. `crypto,gambling`, `spanish`, `5000` |
| `confidence` | REAL | 1.0 explicit, 0.7 inferred, 0.5 auto-summarized |
| `source` | TEXT | `explicit_statement`, `inferred`, `correction` |
| `status` | TEXT | `active`, `superseded` |
| `created_at` | TIMESTAMPTZ | Default NOW() |
| `updated_at` | TIMESTAMPTZ | Default NOW() |
| | | UNIQUE(user_id, category, key) |

Access:
```bash
node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
node scripts/db.js "INSERT INTO preferences (user_id, category, key, value, confidence, source) VALUES (1, '<category>', '<key>', '<value>', <confidence>, '<source>') ON CONFLICT (user_id, category, key) DO UPDATE SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, source = EXCLUDED.source, updated_at = NOW()" --write
```

Written by: `memory` (cross-cutting). Read by: every flow at pre-flight.

## Data ownership by flow

| Flow | Writes | Reads |
|---|---|---|
| `onboarding` | `users` (row + `data.linkedin_profile` + `data` collected info) | — |
| `profile` | `users.data.profile`, `users.data.job_preferences`, `users.data.style_profile`, `users.data.platforms`, `users.data.target_companies` | `users.data` (validate before overwrite) |
| `radar` | `users.data.platforms` (alert status), `PLATFORMS.md` | `users.data.platforms`, `PLATFORMS.md`, `preferences` |
| `news` | `messages`, `applications` (status updates), `users.data.last_review_at` | `applications`, `users.data.style_profile`, `users.data.profile`, `preferences` |
| `apply` | `applications` | `users.data.profile`, `users.data.job_preferences`, `users.data.target_companies`, `applications` (dedup), `preferences` |
| `daily` | (delegates to `news` + `apply`) | `applications` (max applied_at), `preferences` |
| `memory` | `preferences` | `preferences` (injection at every pre-flight) |

## File-based data (not in DB)

| File | What it holds | Written by | Read by |
|---|---|---|---|
| `PLATFORMS.md` | Platform catalog (35 platforms) + alert tracking table (which platforms have alerts configured) | `radar` (alert tracking section), manual | `radar`, `profile` (platform tiering), `apply` |
| `AGENTS.md` | Operational rules, flow map, this data map reference | manual | agent (every session) |
| `ADR.md` | Architecture decisions (append-only) | manual | agent (when needed) |
