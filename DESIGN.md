# DESIGN.md

## Principles

This repo has no UI. It's consumed by coding agents via skills (markdown) and scripts (Node.js). The "users" are agents, not humans.

## Skill format

- YAML frontmatter: `name`, `description`
- Plain markdown, no HTML
- Checklists with `- [ ]` for actionable steps
- Tables for structured data
- Code blocks for commands and SQL
- Maximum density per token: brief, direct, no decorative prose

## Naming conventions

- Skills: kebab-case (`playwright-cli`, `job-search`)
- SQL tables: snake_case (`users`, `applications`)
- JSONB keys: snake_case (`job_preferences`, `style_profile`)
- Doc files: UPPERCASE (`ADR.md`, `PLATFORMS.md`)

## If UI is added in the future

Define here:
- Tokens (color, typography, spacing)
- Component catalog
- State patterns (loading, error, empty)
- Accessibility criteria
