# ADR — Job Seeker

## Decision

Repo of skills + guides + scripts to automate job search. Not an agent; consumed by any coding agent (Devin, Claude, opencode). MIT.

### Architecture

- **Skills in `.agents/skills/`** — one per task (navigate, write, DB, manage, profile). Universal format, not tied to one agent. Reason: portability.
- **V0 reference** — the original `job-search` skill is a historical reference. Skills are built one at a time per user instruction.
- **Multi-user** — generic onboarding from scratch. Anyone clones, runs onboarding, it works.

### Browser

- **playwright-cli** with `--profile=<path>` for persistent session. Reason: native CLI, no MCP or JSON config, token-efficient.
- **Headless by default.** Headed only when user intervention is required (manual login, 2FA). Config in `.playwright/cli.config.json` with `headless: true`. Override with `--headed` when needed. Reason: speed and fewer resources when no human intervention.
- **Initial login headed**, rest headless. If block/captcha detected → switch to headed and remember. Reason: speed when safe, safety when banned.
- **Anti-ban rules** don't live here. They go in the navigation skill when built.

### Persistence

- **Postgres** via cloud (Neon recommended). Reason: user clones on another machine, points to same `DATABASE_URL`, doesn't lose profile or history.
- **Postgres over Mongo** — 70% of data is relational (applications↔companies↔messages↔interviews). Native joins. JSONB for semi-structured CV/style profile. Mongo forces denormalization or fighting with `$lookup` (worse joins). Atlas free tier exists but doesn't compensate.
- **`.env` with `DATABASE_URL`**, not tracked. No docker-compose.

### Profiling

- Skill that asks for CV (URL/PDF/whatever), LinkedIn profile, questions. Builds profile in DB.
- Initial research of LinkedIn/Gmail messages → style profile in DB → human validation (3 corrected samples).

### Conventions

- **`npx` over global installs** — mitigate friction. No `npm install -g`. Reason: any user clones and runs without touching their global environment.

### Operation

- **On-demand.** User says "apply to X" + optional review of updates.
- **Language:** the user's, always.
- **2FA:** pause + macOS notification if available.
- **Notifications:** in-session only.
- **Cover letters:** user's agent LLM + style profile from DB.
- **Rejections/follow-ups:** user decides, remembered in DB.

## ADR-003: Passive Sourcing via Job Alerts

**Date:** 2026-07-30
**Status:** Accepted

### Context

Active job search (applying to jobs) is the main flow, but depends on the user manually invoking `job-search` or `news`. Job platforms have alerts that can bring opportunities passively, but without filtering they generate inbox noise.

### Decision

Implement **passive sourcing** in 3 layers:

1. **Registration + alerts** (`radar` skill, trigger `radar`): register user on selected platforms, configure alerts with profile keywords, create Gmail filter that routes alerts to a `Job Alerts` folder (skip inbox).
2. **Consumption** (`news` skill, trigger `news`): when running `news`, check the `Job Alerts` folder in addition to inbox, classify alerts by fit (Must/Strong/Nice), and present only relevant ones in the executive summary.
3. **Tracking** (`PLATFORMS.md` + `PROFILE.md`): record which platforms have alerts configured, what keywords are used, and when they were last reviewed.

### Selected platforms (5 initial)

| Platform | Why | Google login |
|---|---|---|
| HireIndex | AI/ML jobs aggregator (1678 roles, 800 companies). Weekly newsletter | N/A (newsletter) |
| Torre | LATAM-focused with AI matching, remote-first | Email + OTP |
| We Work Remotely | Largest remote job board, lots of AI/EM variety | No (Cloudflare) |
| Built In | Tech-focused with cities + remote, serious companies | Yes |
| Y Combinator (workatastartup.com) | YC startups exclusively, many AI startups | Magic link |

> **Note:** Otta was replaced by HireIndex — Otta was acquired by Welcome to the Jungle (Jan 2024) and the platform degraded. HireIndex aggregates 1678 AI/ML roles from 800 companies with weekly refresh.

### Tradeoffs

- **Pros:** passive, source diversification, automatic filtering by agent
- **Cons:** potential noise (mitigated with Gmail filter + agent classification), some platforms without Google login (manual login), maintaining profiles on multiple platforms

### Gmail filter

```
from:(otta.com OR torre.co OR weworkremotely.com OR builtin.com OR workatastartup.com)
→ skip inbox → label:Job Alerts
```

### Relationship with existing skills

- `onboarding` not modified — still initial onboarding
- `radar` is new — handles registration + alerts + filter
- `news` minimally updated — adds `Job Alerts` folder to step 1
- `apply` not modified — still active search + application
