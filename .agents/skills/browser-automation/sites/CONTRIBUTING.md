# Contributing to sites/

This directory contains automation guides for specific web applications. Each guide documents validated selectors, API endpoints, flows, and gotchas for automating a particular site with `playwright-cli`.

## Who this is for

Both humans and AI agents. An agent reading a guide should be able to automate the site without prior knowledge. A human should be able to verify, debug, and extend the guide.

## What belongs here

- Automation guides for specific web apps (LinkedIn, Gmail, Jira, Teamtailor, etc.)
- Validated selectors, API endpoints, and request/response structures
- Step-by-step flows that reproduce reliably
- Gotchas, anti-patterns, and edge cases discovered through real automation
- Platform-specific patterns (form fields, auth flows, rate limits, captchas)

## What does NOT belong here

- Personal data (names, emails, phone numbers, real URLs with tokens)
- Project-specific business logic (job search strategies, candidate profiles)
- Hardcoded values that should come from a database or config
- One-off hacks that won't reproduce for other users
- Generic browser patterns (those go in the parent `SKILL.md` or `references/`)

## Contribution principles

### 1. Generic and agnostic

Guides must work for any user, any project, any agent. No assumptions about who is running the automation or why.

**Bad:** "Send a message to Gustavo asking what he wants"
**Good:** "Send a message to a conversation by participant name using the bulk inbox fetch to resolve the thread ID"

**Bad:** "Fill the form with salary 5000 USD"
**Good:** "Fill the salary field from your data source. If the value is missing, stop and ask."

### 2. Reproducible

Every flow must be reproducible by another agent from scratch. Include:
- The exact URL to navigate to
- The selectors or API endpoints to use
- The verification step (how to confirm success)
- What to do when it fails

### 3. Validated

Only document what has been tested against the live site. Include the validation date. If a selector or endpoint stops working, update the guide or mark it as deprecated.

**Example:** "Validated 2026-08-12 against live API"

### 4. API-first when possible

Prefer internal APIs over UI scraping. APIs are more stable, faster, and eliminate UI-related errors (clicks that don't navigate, overlays that intercept events, dynamic content that hasn't loaded).

When documenting an API:
- Show the full request (URL, method, headers, body)
- Document the response structure (key fields, types, where to find what)
- Include the verification step (what field in the response confirms success)
- Note when the API structure changed and how to detect it

When UI is the only option:
- Document the exact selector
- Include a verification step that checks the DOM, not just the URL
- Note known failure modes (overlays, timing, dynamic content)

### 5. Safe by default

Guides must prevent irreversible errors. Messages sent to the wrong person, forms submitted with wrong data, emails sent to wrong recipients — these cannot be undone.

Principles:
- **Identify by ID, not by UI position.** Thread IDs, profile IDs, form field names. Never "click the third item in the list."
- **Verify before acting.** Confirm the target is correct before typing, clicking send, or submitting.
- **Show drafts before sending.** When the action has real-world side effects, the flow must include a human-in-the-loop checkpoint.
- **Document failure modes.** What happens when the click doesn't navigate? What does the error response look like? How do you detect it?

### 6. No secrets, no personal data

Guides are public artifacts. Never include:
- Real credentials, tokens, or cookies
- Real names, emails, phone numbers, or profile URLs
- Real thread IDs or conversation content
- Real company names tied to a specific user's history

Use placeholders: `<THREAD_ID>`, `<RECIPIENT_NAME>`, `<company>.teamtailor.com`, `ACoAA...`.

## File structure

Each app has its own directory named after the domain slug (underscore-separated, no dots or hyphens). The main guide is always `guide.md`. Additional reference files live alongside it in the same directory.

```
sites/
  gmail_com/
    guide.md              # Gmail automation guide
  linkedin_com/
    guide.md              # LinkedIn automation guide
    voyager-api.md        # Detailed API endpoint documentation
  jira_com/
    guide.md
  teamtailor_com/
    guide.md
  CONTRIBUTING.md         # This file
```

### Domain slug convention

Derive the directory name from the site's canonical domain:
- Lowercase, replace `.` and `-` with `_`
- Strip `www.` prefix
- Example: `mail.google.com` → `gmail_com`, `www.linkedin.com` → `linkedin_com`, `humand.co` → `humand_co`

### Learnings vs guides

- **`guide.md`** is the curated, validated guide for the app. It documents selectors, API endpoints, flows, and gotchas that have been tested against the live site.
- **Other `.md` files** in the same directory (e.g. `login-bypass.md`, `2fa-flow.md`) are **learnings** — smaller, topic-specific files that document a single shortcut, workaround, or failure recovery discovered during real automation.
- Learnings are documentation only. They are never auto-applied by the agent. A human must review and promote useful learnings into `guide.md` or the core `SKILL.md`.

### No scripts

**Do not contribute executable scripts (`.js`, `.py`, `.sh`, `.ts`) to `sites/`.** This directory is markdown-only documentation. Scripts are executable code that runs with the user's privileges — accepting them as contributions would expand the attack surface from prompt injection (text-only) to remote code execution. If a flow is universally reusable and deterministic enough to justify a script, it belongs in the skill's `scripts/` directory (core infrastructure, like `browser.js`), not in `sites/`. That promotion is a manual, human-reviewed decision — never automatic.

## Required sections

Each app guide must include:

1. **Frontmatter** — `name` and `description` for skill discovery
2. **Prerequisite** — link to parent `SKILL.md` for golden rules and wrapper
3. **Setup** — how to open the site, handle login, save state
4. **Keyboard shortcuts** — **Mandatory.** Every site that has keyboard shortcuts must document them in full. Before writing a guide for a site, investigate whether it has shortcuts: check the app's help/FAQ, search "keyboard shortcuts <app name>", or try common patterns (`?`, `Ctrl+/`, `Shift+?`, `F1`). If the site has shortcuts, document the complete list in a dedicated section with tables grouped by category. Only document shortcuts that have been validated against the live site — do not include shortcuts from documentation that were not tested. Mark shortcuts that require enabling a setting (e.g. LinkedIn's hotkey toggle, Facebook's single-character switch) clearly.
5. **Core flows** — the main automation tasks (messaging, applying, reading, etc.)
6. **API reference** — when internal APIs are available, document endpoints, headers, request/response structures
7. **Anti-patterns** — what NOT to do, with explanations of why it fails
8. **Validation date** — when the guide was last validated against the live site

## When the site changes

Web apps change. Selectors break. APIs evolve. When you discover a change:

1. **Update the guide** with the new selectors or API structure
2. **Note the change** with a date and what broke
3. **Keep the old pattern** as a fallback if it still partially works, marked as deprecated
4. **Add to anti-patterns** if the old approach is now dangerous

Example:
```
**Deprecated (2026-08-10):** `innerText` assignment no longer enables the Send button.
Use `innerHTML` + `beforeinput` with `insertFromPaste` instead.
```

## Review checklist before committing

- [ ] No personal data (names, emails, tokens, real URLs with IDs)
- [ ] Uses placeholders for all user-specific values
- [ ] Flows are reproducible from scratch by another agent
- [ ] Includes verification steps (not just "click and hope")
- [ ] API-first when possible, UI fallback documented
- [ ] Anti-patterns section documents known failure modes
- [ ] Validation date included
- [ ] Generic enough to work for any user, not just the author
- [ ] No executable scripts (`.js`, `.py`, `.sh`, `.ts`) — markdown only

## Security review checklist (for PR reviewers)

When reviewing a PR that modifies files under `sites/`, check for these supply-chain attack indicators:

- [ ] No instructions that tell the agent to read env vars, credentials, or secret files (`.env`, `~/.ssh`, `~/.aws`)
- [ ] No network calls to undocumented or external URLs (telemetry, analytics, exfiltration endpoints)
- [ ] No instructions to open PRs or perform git operations without user confirmation
- [ ] No base64-encoded blobs, hex strings, or obfuscated content
- [ ] No instructions that override the scrub/privacy rules in `SKILL.md`
- [ ] No instructions that tell the agent to auto-apply learnings (learnings are documentation only)
- [ ] No modifications to `SKILL.md`, `scripts/`, `references/`, or this file (PRs to `sites/` should only touch `sites/`)
- [ ] Content is paraphrased, not transcribed verbatim from a site (prevents prompt injection)
- [ ] SkillSpector CI check passes with no high/critical findings
