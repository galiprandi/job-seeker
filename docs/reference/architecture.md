# Architecture

Key technical decisions for the project. See `ADR.md` in the repository for the full append-only record.

## Architecture

- **Skills in `.agents/skills/`** - one per task. Universal format, not tied to one agent. Reason: portability.
- **Multi-user** - generic onboarding from scratch. Anyone clones, runs onboarding, it works.

## Browser

- **playwright-cli** with `--profile=&lt;path&gt;` for persistent session. Installed as devDependency via `npm install`. Reason: native CLI, no MCP or JSON config, token-efficient.
- **Headless by default.** Headed only when user intervention is required (manual login, 2FA). Reason: speed and fewer resources.
- **Initial login headed**, rest headless. If captcha detected, switch to headed. Reason: speed when safe, safety when blocked.

## Persistence

- **Postgres** via cloud (Neon recommended). Reason: user clones on another machine, points to same DATABASE_URL, doesn't lose profile or history.
- **Postgres over Mongo** - 70% of data is relational (applications, companies, messages, interviews). Native joins. JSONB for semi-structured CV/style profile.
- **`.env` with `DATABASE_URL`**, not tracked. No docker-compose.

## Conventions

- **`npx` over global installs** - mitigate friction. No `npm install -g`.
- **playwright-cli as devDependency** - installed via `npm install`, not globally.

## Operation

- **On-demand.** User says "apply to X" or "check updates".
- **Language:** the user's, always.
- **2FA:** pause and notify user.
- **Cover letters:** agent LLM + style profile from DB.
- **Rejections/follow-ups:** user decides, remembered in DB.
