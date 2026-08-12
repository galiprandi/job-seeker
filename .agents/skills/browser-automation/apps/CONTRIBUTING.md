# Contributing to apps/

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

Each app guide is a single markdown file named after the platform:

```
apps/
  linkedin.md          # LinkedIn automation
  gmail.md             # Gmail automation
  jira.md              # Jira automation
  teamtailor.md        # Teamtailor ATS automation
  CONTRIBUTING.md      # This file
```

If an app needs sub-references (API docs, selector catalogs), create a directory:

```
apps/
  linkedin.md
  linkedin-references/
    voyager-api.md     # Detailed API endpoint documentation
    selectors.md       # Validated selector catalog
```

## Required sections

Each app guide must include:

1. **Frontmatter** — `name` and `description` for skill discovery
2. **Prerequisite** — link to parent `SKILL.md` for golden rules and wrapper
3. **Setup** — how to open the site, handle login, save state
4. **Core flows** — the main automation tasks (messaging, applying, reading, etc.)
5. **API reference** — when internal APIs are available, document endpoints, headers, request/response structures
6. **Anti-patterns** — what NOT to do, with explanations of why it fails
7. **Validation date** — when the guide was last validated against the live site

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
