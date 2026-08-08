# Contributing to Job Seeker

Thanks for your interest in contributing. This project aims to help anyone automate their job search with AI agents.

## Ways to contribute

### Platforms catalog (`PLATFORMS.md`)

Add new job platforms following the existing table format. Include all columns: Platform, URL, Role types, Seniority, Industries, Geography, Easy Apply, Anti-bot, Notes. Place the platform in the correct category (General, Tech, AI, Executive, Latam).

### Skills (`.agents/skills/`)

Improve existing skills by refining checklists, adding edge cases, or clarifying steps. Skills are markdown files with YAML frontmatter (`name`, `description`, `trigger`) and plain markdown body.

### Scripts (`scripts/`)

Fix bugs, add features, or improve robustness. All scripts must:
- Read candidate data from DB at runtime (never hardcode personal data)
- Use `scripts/browser.js` wrapper for browser open/close/goto (never `playwright-cli open` directly)
- Register actions in DB via `scripts/db.js`

### Strategies (`STRATEGIES.md`)

Add new strategies or update data. Every strategy must cite sources with URLs. Order by effectiveness (highest first).

### Architecture decisions (`ADR.md`)

Append-only. To reverse a decision, add a new ADR that supersedes the previous one. Never edit or delete existing ADRs.

## Rules

1. **No personal data in the repo.** All candidate-specific data (names, emails, phones, CV paths, salaries, company names from your history) belongs in the database, not in tracked files. Use `<placeholder>` syntax in examples.
2. **English only.** All tracked files must be in English.
3. **Test your changes.** Run `npm test` before submitting. If you add browser features, add tests in `tests/browser/`.
4. **Keep skills agent-agnostic.** Skills should work with any coding agent (Devin, Claude, Cursor, opencode). Don't tie them to one agent's specific API.

## Pull request process

1. Fork the repo and create a branch from `main`
2. Make your changes following the rules above
3. Run `npm test` and ensure it passes
4. Open a PR with a clear description of what changed and why
5. Link any relevant issues

## Development setup

```bash
git clone https://github.com/<your-username>/job-seeker.git
cd job-seeker
npm install
npm test
```

You need a Postgres database (Neon free tier works) to test DB-dependent features. Create a `.env` with `DATABASE_URL`.
