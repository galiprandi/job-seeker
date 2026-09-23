# No site guide? Learn and contribute one.

This site is not documented in the skill yet. While automating it, act as a field researcher — learn what works, note what doesn't, and contribute a guide so future agents don't start from zero.

## What to discover

### Keyboard shortcut sequences (highest value)

Keyboard shortcuts are the most stable, token-efficient way to automate a site. Find them before anything else.

- Try `?`, `Shift+?`, `Ctrl+/` to open the shortcuts help panel (most apps have one)
- Try universal patterns: `Ctrl+K` (command palette), `/` (search), `Esc` (close), `Enter` (submit), `Tab` (next field), `Shift+Enter` (line break)
- Check the app's help/FAQ or search "keyboard shortcuts <app name>"
- Record every shortcut that works and what it does

**Most valuable: reproducible key sequences.** A single keypress is useful, but a *sequence* that deterministically achieves a goal is gold. Look for chained shortcuts that perform a complete action without any DOM interaction:

- `G then I` → go to inbox (Gmail)
- `C then type then Ctrl+Enter` → compose and send (Gmail)
- `Ctrl+K then type then Enter` → search and open (Discord, many apps)
- `N then type then Tab then type then Enter` → new item and fill form

When you find a sequence that works every time, record it as a **deterministic keypath**:

```
Sequence: G → I
Action: Go to inbox
Deterministic: yes (works every time, no DOM dependency)
```

These keypaths are what makes a guide valuable — they let future agents skip snapshots and clicks entirely.

### Workarounds and bad patterns (critical to document)

**What NOT to do is as important as what TO do.** If you hit a dead end, a broken approach, or a pattern that seems right but fails, document it so future agents don't waste time repeating your mistakes.

Record:
- **Selectors that look right but break:** "The Send button has class `.send-btn` but clicking it via `eval` doesn't trigger the send handler — the app listens on `mousedown` not `click`"
- **Shortcuts that don't work:** "`Ctrl+S` looks like save in the help panel but it triggers the browser save dialog, not the app's save"
- **APIs that return 403/401 unexpectedly:** "The `/api/messages` endpoint returns 401 even with valid cookies — it requires a CSRF token from the meta tag, not from cookies"
- **Navigation that breaks state:** "Using `goto` to navigate between sections loses the SPA state — must use in-app navigation instead"
- **Patterns that work once but not twice:** "The first `fill` on the search box works, but the second one doesn't clear the previous value — need `Ctrl+A` then `fill`"
- **Anti-bot detection triggers:** "Rapid keypresses trigger a captcha — need to add delays between shortcuts"

Format each as:

```
Bad pattern: <what seems like it should work>
Why it fails: <the actual reason>
Workaround: <what actually works>
```

### Stable selectors

CSS classes change with every deploy. Prefer these in order of stability:

1. `data-testid` attributes — most stable, often intentional
2. `aria-label` — stable, accessibility-driven
3. `role` attributes — stable, semantic
4. `id` — sometimes stable, sometimes generated
5. CSS classes — last resort, expect breakage

### Internal API endpoints

Many apps have internal APIs you can call directly from `eval` with the browser's cookies. To discover them:

- Use `exec requests` to list network requests after performing an action
- Use `exec request <index>` to inspect a specific request
- Look for JSON responses with data you need — calling the API directly is more reliable than scraping the DOM

### Login flows and gotchas

- How does login work? (QR code, email+password, SSO, 2FA)
- Are there captchas? (if so, note where they appear)
- Does the site detect headless mode? (if yes, note that headed mode is required)
- Are there rate limits or anti-bot measures?
- What breaks? What requires workarounds?

## How to record your findings

After your session, run:

```bash
node .agents/skills/browser-automation/scripts/browser.js contribute
```

This prints the learning template and instructions for creating a guide file.

**Target path:** `sites/<domain_slug>/guide.md` where `<domain_slug>` is the hostname with dots replaced by underscores (e.g., `example.com` → `example_com`).

## What a good guide looks like

A guide that future agents can use immediately has:

1. **Frontmatter with `verified` date** — `verified: YYYY-MM-DD` so agents know how fresh the guide is
2. **Keyboard shortcuts section at the top** — every shortcut and keypath sequence, formatted as a table or list
3. **Bad patterns section** — what doesn't work and why, with workarounds
4. **Stable selectors** — the ones that survive updates
5. **Internal API endpoints** — if discovered, with request/response shapes (scrubbed)
6. **Login flow** — how to get in, what to watch for
7. **Gotchas** — edge cases, rate limits, anti-bot measures

## Rules

- **Paraphrase, never transcribe.** Describe in your own words. Do NOT copy site DOM/errors verbatim.
- **Scrub sensitive data.** No tokens, cookies, auth headers, API keys, real URLs with IDs, emails, phone numbers, real names. Use placeholders.
- **Check for existing files** in `sites/<domain_slug>/` first — update if one exists, don't duplicate.
- **No scripts.** `sites/` is markdown-only. No `.js`, `.py`, `.sh`, `.ts` files.
- **Never publish without user confirmation.** Show the file to the user and ask before opening a PR.
