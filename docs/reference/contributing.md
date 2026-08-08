# Contributing

Thanks for your interest in contributing. This project aims to help anyone automate their job search with AI agents.

## Ways to contribute

### Platforms catalog (`PLATFORMS.md`)

Add new job platforms following the existing table format. Include all columns. Place the platform in the correct category (General, Tech, AI, Executive, Latam).

### Skills (`.agents/skills/`)

Improve existing skills by refining checklists, adding edge cases, or clarifying steps. Skills are markdown files with YAML frontmatter and plain markdown body.

### Scripts (`scripts/`)

Fix bugs, add features, or improve robustness. All scripts must:
- Read candidate data from DB at runtime (never hardcode personal data)
- Use `scripts/browser.js` wrapper for browser open/close/goto
- Register actions in DB via `scripts/db.js`

### Strategies (`STRATEGIES.md`)

Add new strategies or update data. Every strategy must cite sources with URLs. Order by effectiveness (highest first).

### Architecture decisions (`ADR.md`)

Append-only. To reverse a decision, add a new ADR that supersedes the previous one.

## Rules

1. **No personal data in the repo.** Use `&lt;placeholder&gt;` syntax in examples.
2. **English only.** All tracked files must be in English.
3. **Test your changes.** Run `npm test` before submitting.
4. **Keep skills agent-agnostic.** Don't tie them to one agent's API.

## Pull request process

1. Fork the repo and create a branch from `main`
2. Make your changes following the rules above
3. Run `npm test` and ensure it passes
4. Open a PR with a clear description of what changed and why

## Development setup

```bash
git clone https://github.com/galiprandi/job-seeker.git
cd job-seeker
npm install
npm test
```
