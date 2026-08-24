---
name: whatsapp-web-message-extraction
description: Fast bulk extraction of messages from an open WhatsApp Web conversation using a single DOM query. Use when you need to read or summarize a chat without scrolling step-by-step.
---

# WhatsApp Web — Bulk Message Extraction

## When to use

You need to read or summarize the messages of an open conversation (individual or group) without scrolling one screen at a time. This replaces the slow pattern of taking an accessibility snapshot per scroll batch.

## Prerequisite

- A WhatsApp Web session is already authenticated and a conversation is open in `#main`.
- If the conversation is not open yet, search by name and click the chat row first.

## Fast extraction (single DOM query)

Run one `eval` that pulls every visible `div[role="row"]` inside `#main` and returns its `innerText`:

```js
() => {
  const main = document.querySelector('#main');
  if (!main) return 'no main';
  const rows = main.querySelectorAll('div[role="row"]');
  const results = Array.from(rows).map(r => {
    const text = r.innerText?.replace(/\n/g, ' | ') || '';
    return text.substring(0, 500);
  });
  return JSON.stringify({count: results.length, msgs: results});
}
```

This returns a JSON array with sender, text, and timestamp for each visible message in a single call — no snapshot parsing needed.

## Loading older messages

WhatsApp Web only renders the most recent ~20–30 messages in the DOM. To read a longer history:

1. Click the button `Haz clic aquí para obtener mensajes anteriores de tu teléfono.` (ref appears at the top of the message panel as `button` with that accessible name).
2. Wait 2–3 seconds for older messages to load.
3. Repeat the bulk extraction `eval` above. The new rows will include the older messages.

For very long histories, repeat click + extract 2–3 times rather than scrolling manually.

## Search-based extraction (no need to open the chat)

WhatsApp Web's search box (`textbox "Buscar un chat o iniciar uno nuevo"`) returns matching messages across all chats in a single list. Each result row shows chat name, timestamp, sender, and message preview.

**Important:** Setting `input.value` directly does NOT trigger WhatsApp's search filter. You must use keyboard typing via `playwright-cli`:

```bash
# Click the search textbox and type the term
node scripts/browser.js exec click "[role='textbox']"
node scripts/browser.js exec type "<SEARCH_TERM>"
```

After typing, wait 2–3 seconds and extract results:

```js
() => {
  const grid = document.querySelector('div[role="grid"]');
  if (!grid) return 'no grid';
  const rows = grid.querySelectorAll('div[role="row"]');
  const results = Array.from(rows).map(r => r.innerText?.replace(/\n/g, ' | ').substring(0, 300));
  return JSON.stringify(results.filter(t => t && t.length > 0));
}
```

This is useful for finding messages about a specific topic across all conversations without opening each one.

## Opening a chat from search results

**Do not** use `element.click()` via JS on the grid row — it does not reliably open the conversation. Instead, capture a snapshot and use the `ref` from the search result row:

```bash
node scripts/browser.js exec snapshot
# Find the ref for the chat row, e.g. f86e2369
node scripts/browser.js exec click <REF>
```

After the chat opens, wait 2–3 seconds for messages to render, then run the bulk extraction `eval` on `#main`.

## Why this is faster than snapshots

- **Accessibility snapshots** parse the entire page tree (hundreds of lines) and require post-processing to find message rows.
- **Bulk `eval`** runs in-page, returns only the relevant text, and completes in one tool call.
- For a 20-message conversation, snapshot approach can take 4–5 tool calls; bulk extraction takes 1.

## Anti-patterns

- **Do not** scroll the panel with `scrollTop` and re-snapshot each time — this is the slow pattern this method replaces.
- **Do not** rely on `div[contenteditable="true"]` to find the search box; use `input[id="_r_a_"]` or the accessible textbox role instead.
- **Do not** assume all history is in the DOM after opening a chat; only recent messages are rendered. Use the "load older" button for longer ranges.

## Notes

- `div[role="row"]` inside `#main` corresponds to individual messages in the open conversation.
- `div[role="row"]` inside the chat list `div[role="grid"]` corresponds to chat previews in the sidebar — different context, same role. Always scope your query to `#main` for messages or to the sidebar grid for chat list.
- Voice notes appear as rows with `Mensaje de voz` and a duration like `0:31`; the audio content is not extractable via DOM (see `voice-notes.md`).
- Message timestamps appear as `HH:MM` for today's messages or `DD/MM/YYYY` for older ones.

## Validation results (2026-08-21)

Tested against the live site with a 30+ message group conversation:

- **Bulk extraction:** 17 messages in 1 eval call. After loading older messages: 33 messages in 2 eval calls total.
- **Search:** `keyboard.type()` triggers the filter correctly; `input.value=` does not.
- **Chat opening:** `element.click()` on grid row via JS does not open the chat. Using `playwright-cli exec click <REF>` from a snapshot works reliably.
- **Older messages button:** Found by text content (`mensajes anteriores`) and clicked via JS — works correctly.

**Validated:** 2026-08-21 against live `web.whatsapp.com`.
