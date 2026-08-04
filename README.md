# Job Seeker

> Automate your job search with your favorite coding agent.

Job Seeker is a set of **skills, guides and scripts** that any coding agent (Devin, Claude, opencode, Cursor) consumes to search, apply and track jobs on your behalf. It's not an agent — it's the knowledge you give your agent so it works the way you would.

## How it works

1. Clone the repo
2. Tell your agent: *"run the onboarding skill"*
3. The agent opens a browser, asks you to log into Gmail and LinkedIn, creates your DB, and profiles your CV
4. You say: *"apply to 5 jobs"* and the agent searches, filters, applies and records everything

Your profile, preferences, writing style and history live in Postgres (Neon). Your browser session persists in a dedicated profile. Nothing sensitive is committed to the repo. The repo is **candidate-agnostic**: clone it, run onboarding, and everything you need is stored in your DB. No file in the repo contains personal data.

## Flows

| Flow | Trigger | What it does |
|---|---|---|
| `onboarding` | `onboarding` | Bootstrap: browser with dedicated profile, Gmail + LinkedIn login, Neon DB, user data |
| `profile` | `profile` | Profiling: CV + questionnaire (30 preferences with weights) + voice/style + platform selection |
| `radar` | `radar` | Passive sourcing: register on job boards, configure alerts, Gmail filter to Job Alerts folder |
| `news` | `news` | Review updates in Gmail, LinkedIn and platforms. Prepare drafts, executive summary by priority, hybrid validation and auto-send |
| `apply` | `apply` | Search jobs on LinkedIn, filter by Must-haves, apply via Easy Apply, register in DB |
| `daily` | `daily` | Periodic routine: runs `news` → inbox cleanup → applies if no recent activity |
| `playwright-cli` | — | Browser automation: commands, headless by default, anti-ban, automation detection |

## Platforms

`PLATFORMS.md` is a catalog of 35 platforms in 5 categories (general, tech, AI, executive, latam), community-maintained. The agent consults it to decide where to search based on your profile — you don't choose platforms, the agent deduces them.

## Stack

- **Browser:** `@playwright/cli` via npx. Persistent profile, headless by default
- **DB:** PostgreSQL via Neon (cloud). Portable across machines
- **Node:** `pg` for DB access
- **Skills:** Markdown in `.agents/skills/`. Universal, not tied to one agent

## Prerequisites

- Node.js 18+
- npx
- Neon account (free) or any Postgres cloud

## Bootstrap

```bash
git clone https://github.com/<your-username>/job-seeker.git
cd job-seeker
npm install
```

Create `.env` with your connection string:

```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
```

Open your coding agent in the repo and say: *"run the onboarding skill"*

## Structure

```
.agents/skills/          # Skills consumed by any agent
  onboarding/SKILL.md    # Onboarding
  profile/SKILL.md       # Profiling
  radar/SKILL.md         # Passive sourcing (alerts)
  news/SKILL.md          # Updates review and follow-up
  apply/SKILL.md         # Job search and application
  daily/SKILL.md         # Periodic routine
  playwright-cli/SKILL.md # Browser automation
.playwright/
  cli.config.json        # playwright-cli config (headless: true)
.env                     # DATABASE_URL (not tracked)
.browser-profile/        # Chrome profile with sessions (not tracked)
.playwright-cli/         # Snapshots and logs (not tracked)
PLATFORMS.md             # Platform catalog (community)
STRATEGIES.md            # Job search & networking strategies (ordered by effectiveness, data-backed)
DATA.md                  # Data map: tables, JSONB keys, flow ownership
ADR.md                   # Architecture decisions
AGENTS.md                # Operational rules + Gold Rules
DESIGN.md                # Design tokens (placeholder, no UI yet)
LICENSE                  # MIT
```

## Key decisions

See `ADR.md` for details. Summary:

- **playwright-cli** over MCP: native CLI, no JSON config, token-efficient
- **Postgres** over Mongo: 70% of data is relational. JSONB for semi-structured
- **Neon** for portability: clone on another machine, same `DATABASE_URL`, same profile
- **npx** over global installs: zero friction on clone
- **Headless** by default: headed only for manual login and 2FA
- **Skills in `.agents/skills/`**: universal format, works with any agent

## License

MIT — use it, fork it, contribute.

## Contributing

- `PLATFORMS.md`: add platforms with the fields from the existing table
- Skills: improve existing checklists and rules
- ADR: append-only. To reverse a decision, add a new ADR that supersedes it
