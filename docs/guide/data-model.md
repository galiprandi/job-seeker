# Data Model

All candidate-specific data lives in Postgres. The repo contains zero personal data. This page documents what tables exist, what keys live in JSONB, and which flow owns each piece of data.

## Tables

### `users`

Single row. Structured columns plus `data` JSONB for semi-structured profile info.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | Always 1 (single user) |
| `name` | TEXT | User's full name |
| `email` | TEXT | User's email (unique) |
| `data` | JSONB | All semi-structured data (see below) |

### `users.data` JSONB keys

| Key | What it holds | Written by | Read by |
|---|---|---|---|
| `profile` | CV extraction: name, title, summary, skills, experience, education, languages, projects, github, blog, cv_url, cv_path | `profile` | `apply`, `targets`, `news`, `daily` |
| `job_preferences` | 30 questionnaire answers with Must/Strong/Nice weights | `profile` | `apply`, `targets`, `news`, `daily` |
| `form_answers` | Standard answers for Easy Apply and other job forms | `onboarding`, `apply` | `linkedin-easy-apply.js`, `apply` flow |
| `style_profile` | Communication style: tone, language, length, greeting, closing, emojis, samples | `profile` | `news` (drafting replies), all flows (language) |
| `platforms` | Platform tier assignment: tier_1, tier_2, tier_3, discarded | `profile` | `radar`, `apply`, `news` |
| `target_companies` | Curated target companies by region | `profile` or manual | `targets`, `apply` |
| `strategy` | Job search strategy parameters (level, batch sizes, thresholds, etc.) | `onboarding`, `strategy` flow, `memory` | All flows (pre-flight) |
| `availability` | Interview time preferences (preferred hours, timezone, blocked slots) | `onboarding` | `news` (scheduling) |

### `applications`

Every job application registered.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER FK | Always 1 |
| `platform` | TEXT | linkedin, email, teamtailor, etc. |
| `company` | TEXT | Company name |
| `role` | TEXT | Job title |
| `url` | TEXT | Job posting URL (used for dedup) |
| `status` | TEXT | Pipeline stage (discovered, contacted, applied, in_review, screening, interview, offer, hired, rejected, withdrawn, skipped) |
| `applied_at` | TIMESTAMPTZ | Default NOW() |
| `data` | JSONB | Match reason, method, location, stage_history |

### `company_registrations`

Tracks registration and application status per target company. Enables resumability for the `targets` flow.

### `messages`

Recruiter and contact messages, with drafts and send tracking.

### `preferences`

Autonomous preference storage. Populated by the `memory` skill from conversation signals.

| Category | Key | Values | Purpose |
|---|---|---|---|
| `tooling` | `browser_mode` | headless, headed, headed_logins_only, ask_each_time | Controls browser visibility. Default: headed_logins_only |
| `workflow` | `strategy_level` | passive, selective, active, aggressive | Controls job search aggressiveness. Default: selective |

## Pipeline stages

Active stages (left to right in the kanban):
`discovered` -> `contacted` -> `applied` -> `in_review` -> `screening` -> `interview` -> `offer` -> `hired`

Closed stages: `rejected`, `withdrawn`, `skipped`
