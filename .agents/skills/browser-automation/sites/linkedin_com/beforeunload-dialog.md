# beforeunload dialog blocks navigation from messaging — linkedin.com

**Date:** 2026-08-13
**Type:** gotcha
**Site:** linkedin.com

## What was expected

After typing a draft in the LinkedIn messaging composer and navigating away (e.g. `goto https://www.linkedin.com/feed/`), the browser would navigate to the new page, leaving the draft behind in LinkedIn's draft storage.

## What was found

LinkedIn registers a `beforeunload` event handler on the messaging page. When there is **unsent text in the composer**, navigating away triggers a native `beforeunload` dialog that blocks all Playwright operations:

```
Error: Tool "browser_snapshot" does not handle the modal state.
Modal state: ["beforeunload" dialog with message ""]: can be handled by dialog-accept or dialog-dismiss
```

The `goto` command itself times out (30s) because the navigation is blocked by the dialog. Every subsequent command fails with the modal state error until the dialog is handled.

When the composer is **empty** (no draft text), navigating away works normally — no dialog appears.

## Reproduction

### 1. Open a messaging thread and type a draft

```bash
node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/<THREAD_ID>/"
# wait for composer to load
playwright-cli fill <composer_ref> "test draft"
```

### 2. Attempt to navigate away

```bash
node scripts/browser.js goto "https://www.linkedin.com/feed/"
# Times out after 30s. Page stays on the messaging thread.
# Error: Tool "browser_snapshot" does not handle the modal state.
```

### 3. Accept the dialog to unblock

```bash
playwright-cli dialog-accept
# Navigation proceeds to the feed page.
# Snapshot works normally after this.
```

## Notes

- The dialog only appears when there is **unsent text** in the composer. An empty composer does not trigger it.
- `dialog-accept` discards the draft and proceeds with navigation.
- `dialog-dismiss` cancels navigation and stays on the messaging page.
- The `goto` timeout (30s) is consumed while the dialog is open. After `dialog-accept`, the navigation completes immediately.
- If you need to preserve the draft, use `dialog-dismiss` and send or clear the message before navigating.

## Suggested guide update

Add to `linkedin_com/guide.md` under "Messaging" or "Anti-patterns":

> When navigating away from `/messaging/` with unsent text in the composer, LinkedIn triggers a `beforeunload` dialog that blocks all commands. Run `playwright-cli dialog-accept` (to discard the draft and navigate) or `dialog-dismiss` (to stay) before any other action. If you need to leave the page cleanly, clear the composer first.
