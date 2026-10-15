# DraftJS editor fill — onstrider.com

**Date:** 2026-08-17
**Type:** shortcut
**Site:** app.onstrider.com

## What was expected

DraftJS editors (`div[role=textbox]` with class `public-DraftEditor-content` or `notranslate`) are typically difficult to fill programmatically. The expectation from prior experience with LinkedIn's tiptap editor and similar rich-text widgets is that `fill` would fail or cause the editor to close, requiring a fallback to `eval` with `innerHTML` + event dispatching or clipboard paste.

## What was found

Playwright's `fill` command works directly on the DraftJS editor used in Strider's work experience description field. No fallback needed.

```bash
# Find the editor via find
node .agents/skills/browser-automation/scripts/browser.js exec find "Description"
# Result: textbox "Description" [ref=eXXX]

# Fill directly
node .agents/skills/browser-automation/scripts/browser.js exec fill <ref> "<long text content>"
```

The text appears in the editor and persists after save. The character counter (`NNN/800`) updates correctly.

This may not generalize to all DraftJS implementations — DraftJS version, wrapper configuration, and focus management vary between sites. But it's worth trying `fill` first before falling back to `eval` patterns.

## Reproduction

1. Navigate to `https://app.onstrider.com/profile`
2. Click "Add new" in the Work experience section
3. Fill company name, title, and other fields to reach the description editor
4. Run `node .agents/skills/browser-automation/scripts/browser.js exec find "Description"` to get the textbox ref
5. Run `node .agents/skills/browser-automation/scripts/browser.js exec fill <ref> "<text>"` — text appears in the editor
6. Save the work experience — text persists

## Suggested guide update

Add a note to `references/key-patterns.md` under "Custom components need eval":

**DraftJS editors:** Try `fill` first. Unlike tiptap/Quill editors, DraftJS editors on some sites (Strider) accept `fill` directly without requiring `innerHTML` hacks or clipboard paste. If `fill` fails, fall back to the `eval` pattern with `innerHTML` + `input` event.
