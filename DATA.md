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
| `profile` | object | CV extraction: name, title, summary, skills, experience, education, languages, projects, github, blog, cv_url | `profile` | `apply`, `targets`, `news`, `daily` |
| `job_preferences` | object | 30 questionnaire answers with Must/Strong/Nice weights: role_types, seniority, location, modalities, salary, equity, stack, ai_focus, ai_role_type, deal_breakers, industries_preferred, industries_avoid, etc. | `profile` | `apply`, `targets`, `news`, `daily` |
| `style_profile` | object | Communication style: tone, language, length, greeting, closing, emojis, bullet_lists, characteristics, samples, preferences_confirmed | `profile` | `news` (drafting replies), all flows (language) |
| `platforms` | object | Platform tier assignment (output of analysis, not user input): `tier_1`, `tier_2`, `tier_3`, `discarded`. Each tier is an array of `{name, reason}` | `profile` | `radar`, `apply`, `news` |
| `target_companies` | object | Curated target companies by region: `latam`, `argentina`, etc. Each is an array of `{name, url, sector}` | `profile` or manual | `targets` (company list), `apply` (priority targets) |
| `cv_path` | string | Absolute path to CV PDF on local machine | `onboarding` or manual | `targets` (upload to career sites) |
| `photo_path` | string | Absolute path to profile photo on local machine | `onboarding` or manual | `targets` (upload to career sites) |
| `linkedin_profile` | string | LinkedIn profile URL | `onboarding` | `apply`, `targets`, `news` |
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

Written by: `apply`, `targets`. Read by: `apply` (dedup), `targets` (dedup), `news` (status updates), `daily` (last application date).

### `company_registrations`

Tracks registration and application status per target company. Enables resumability for the `targets` flow.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER FK → users | Always 1 |
| `company` | TEXT | Company name (unique per user) |
| `region` | TEXT | `latam` or `argentina` |
| `sector` | TEXT | Industry sector |
| `careers_url` | TEXT | Direct URL to careers page |
| `ats_platform` | TEXT | Detected ATS: `Greenhouse`, `Lever`, `Ashby`, `Workday`, `SmartRecruiters`, `Teamtailor`, `Eightfold`, `SuccessFactors`, `Workable`, `Phenom`, `Attrax`, `Gupy`, `Custom`, `Unknown` |
| `registration_status` | TEXT | `pending`, `registered`, `no_fit`, `manual_login_needed`, `manual_apply_needed`, `alert_only` (radar sets up alerts without full registration) |
| `profile_completed` | BOOLEAN | Whether profile was fully filled |
| `profile_url` | TEXT | URL to user's profile on the platform (if available) |
| `login_method` | TEXT | `google`, `linkedin`, `email` |
| `applied_jobs_count` | INTEGER | How many jobs applied to via this flow |
| `last_visit_at` | TIMESTAMPTZ | Last time the careers page was visited |
| `last_applied_at` | TIMESTAMPTZ | Last time an application was submitted |
| `notes` | TEXT | Free-form notes (ATS details, role observations, no_fit reasons) |
| `data` | JSONB | Credentials (if email login), extra metadata |
| `created_at` | TIMESTAMPTZ | Default NOW() |
| `updated_at` | TIMESTAMPTZ | Default NOW() |
| | | UNIQUE(user_id, company) |

Access:
```bash
node scripts/db.js "SELECT id, company, region, registration_status, ats_platform, profile_completed, applied_jobs_count, notes FROM company_registrations WHERE user_id = 1 ORDER BY registration_status, region, company"
node scripts/db.js "SELECT * FROM company_registrations WHERE user_id = 1 AND registration_status = 'pending' ORDER BY region, company"
node scripts/db.js "UPDATE company_registrations SET registration_status = 'registered', profile_completed = true, ats_platform = '<ats>', login_method = '<method>', last_visit_at = NOW(), updated_at = NOW() WHERE id = <id>" --write
node scripts/db.js "UPDATE company_registrations SET applied_jobs_count = applied_jobs_count + <N>, last_applied_at = NOW(), updated_at = NOW() WHERE id = <id>" --write
```

Written by: `targets`. Read by: `targets` (resumability), `daily` (can check if targets flow needs running).

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

Written by: `memory` (cross-cutting), `onboarding` (sets `tooling.browser_mode`). Read by: every flow at pre-flight.

#### Known preference keys

| Category | Key | Values | Set by | Purpose |
|---|---|---|---|---|
| `tooling` | `browser_mode` | `headless`, `headed`, `headed_logins_only`, `ask_each_time` | `onboarding` (step 4), `memory` (if user changes it later) | Controls browser visibility across all flows. Default: `headed_logins_only`. Manual login/2FA is always headed (Gold Rule 5) |

## Data ownership by flow

| Flow | Writes | Reads |
|---|---|---|
| `onboarding` | `users` (row + `data.linkedin_profile` + `data` collected info), `preferences` (`tooling.browser_mode`) | — |
| `profile` | `users.data.profile`, `users.data.job_preferences`, `users.data.style_profile`, `users.data.platforms`, `users.data.target_companies` | `users.data` (validate before overwrite) |
| `radar` | `users.data.platforms` (alert status), `PLATFORMS.md`, `company_registrations` (`alert_only` for big tech career sites) | `users.data.platforms`, `PLATFORMS.md`, `preferences` |
| `targets` | `company_registrations`, `applications` | `users.data.profile`, `users.data.job_preferences`, `users.data.target_companies`, `users.data.cv_path`, `users.data.photo_path`, `company_registrations` (resumability), `applications` (dedup), `preferences` |
| `news` | `messages`, `applications` (status updates), `users.data.last_review_at` | `applications`, `users.data.style_profile`, `users.data.profile`, `preferences` |
| `apply` | `applications` | `users.data.profile`, `users.data.job_preferences`, `users.data.target_companies`, `applications` (dedup), `preferences` |
| `daily` | (delegates to `news` + `apply`/`targets`) | `applications` (max applied_at), `company_registrations` (pending count), `preferences` |
| `memory` | `preferences` | `preferences` (injection at every pre-flight) |

## File-based data (not in DB)

| File | What it holds | Written by | Read by |
|---|---|---|---|
| `PLATFORMS.md` | Platform catalog (35 platforms) + alert tracking table (which platforms have alerts configured) | `radar` (alert tracking section), manual | `radar`, `profile` (platform tiering), `apply` |
| `AGENTS.md` | Operational rules, flow map, this data map reference | manual | agent (every session) |
| `ADR.md` | Architecture decisions (append-only) | manual | agent (when needed) |
| `.playwright/cli.config.json` | Playwright-cli config: `channel: chrome` only. Profile is NOT here (requires `launchPersistentContext`, passed via wrapper `--profile` flag) | `onboarding` (initial setup) | `playwright-cli` (auto-loaded from repo root) |

## Scripts

| Script | Purpose | Used by |
|---|---|---|
| `scripts/db.js` | Safe Postgres CLI. Reads `DATABASE_URL` from `.env`, JSON output, read-only by default (`--write` for writes) | All flows (see `db` skill) |
| `scripts/browser.js` | Browser wrapper. Guarantees `--profile=.browser-profile` is always used. Reads `preferences.tooling.browser_mode` from DB to decide headed/headless. Reuses existing sessions automatically. All flows that need to open/navigate/close the browser must use this instead of `playwright-cli open` directly | All flows that use the browser (see AGENTS.md "Browser session") |
