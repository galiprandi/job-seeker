# WhatsApp Web Automation

Automate WhatsApp Web (web.whatsapp.com) with playwright-cli. Covers contact search, message sending, pinned message handling, conversation extraction via internal API, and the virtual scrolling limit.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Validation date:** 2026-08-13

## Setup

```bash
# Open WhatsApp Web (requires prior QR scan in headed mode)
node scripts/browser.js open "https://web.whatsapp.com/" --headed
# After QR scan, close and reopen headless for automation
node scripts/browser.js close
node scripts/browser.js open "https://web.whatsapp.com/"
```

WhatsApp Web is a heavy SPA. After `goto`, wait for the chat list to load:

```bash
node scripts/browser.js goto "https://web.whatsapp.com/"
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('div[role=\"textbox\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

## Contact and chat search

### Search box

The search box is `textbox "Buscar un chat o iniciar uno nuevo"`.

```bash
playwright-cli fill <search_ref> "<query>"
```

### Partial match required

Exact name matches frequently return "No se encontró ningún chat, contacto ni mensaje." WhatsApp's search is fuzzy and does not match full formal names exactly. Use **partial variations** instead.

**Bad:** `"<Full Formal Name>"` → no results
**Good:** `"<First Name> <Last Name>"` → finds the contact

The actual stored name may differ from the expected spelling (accents, alternate spellings, nicknames). Try multiple partial variations if the first one fails.

### Search results

Results appear in `grid "Resultados de la búsqueda."` with `gridcell` entries. Click a result to open the chat:

```bash
playwright-cli click <gridcell_ref>
```

## Sending messages

### Composer

The composer is `textbox "Escribir un mensaje para <contact name>"` with placeholder "Escribe un mensaje". It is a contenteditable div (like LinkedIn's tiptap editor), not a textarea.

```bash
# Fill the composer
playwright-cli fill <composer_ref> "Your message"
```

### Send

The Send button appears as `button "Enviar"` when there is text in the composer. After sending, the button changes to `button "Mensaje de voz"` and the composer clears — this confirms the message was sent.

```bash
playwright-cli click <send_ref>
```

### Send verification

After clicking Send, verify by checking:
1. The composer is empty (placeholder "Escribe un mensaje" visible again)
2. The Send button has been replaced by "Mensaje de voz"
3. The message text appears in the conversation transcript

### Pinned message dialog

Chats with pinned messages show a `dialog` with "Mensaje fijado" at the top. This dialog does **not** block the composer, but can intercept clicks if it expands. To close it:

```bash
playwright-cli press Escape
```

Clicking the pinned dialog button expands it to show the full pinned message. Press Escape to collapse it.

## Conversation extraction

### Method 1: Internal API (structured data, limited to ~308 messages)

WhatsApp Web exposes internal modules via `window.require`. Access chat and message collections directly:

```js
// In page context via eval
(function() {
  const r = window.require;
  const ChatColl = r('WAWebChatCollection').ChatCollection;
  const chat = ChatColl._models.find(m => m.name && m.name.includes('<chat name>'));
  if (!chat) return 'chat not found';
  return JSON.stringify({
    name: chat.name,
    id: chat.id,
    msgCount: chat.msgs._models.length
  });
})()
```

**Available modules:**
- `WAWebChatCollection` → `ChatCollection` (all chats)
- `WAWebChatMsgsCollection` → `ChatMsgsCollection` (messages in a chat)
- `WAWebChatModel` → `Chat` (constructor)
- `WAWebMsgModel` → `Msg` (constructor)
- `WAWebSendMsgChatAction` → `addAndSendMsgToChat`, `resendMsgToChat`
- `WAWebCmd` → `Cmd` (UI commands: openChatAt, scrollMessages, etc.)
- `WAWebSocketModel` → `Socket`

**Message fields (MsgModel):**
- `id.id` — message ID
- `id.fromMe` — boolean, true if sent by the user
- `id.remote` — chat JID
- `id.participant` — sender JID (in groups)
- `type` — "chat", "sticker", "image", "video", "audio", "document", etc.
- `body` — message text (empty for media types)
- `t` — Unix timestamp
- `from` — sender
- `to` — recipient
- `author` — author (in groups)
- `ack` — delivery status

**API + scroll extraction (max ~308 messages in memory):**

```js
(async function() {
  const r = window.require;
  const ChatColl = r('WAWebChatCollection').ChatCollection;
  const chat = ChatColl._models.find(m => m.name && m.name.includes('<chat name>'));
  const msgs = chat.msgs;
  const panel = document.querySelector('[data-testid="conversation-panel-messages"]');
  if (!panel) return 'no panel';

  const allMsgs = new Map();
  const collect = function() {
    msgs._models.forEach(function(m) {
      allMsgs.set(m.id.id, {
        type: m.type,
        body: (m.body || '').substring(0, 200),
        fromMe: m.id.fromMe,
        t: m.t
      });
    });
  };

  collect();
  let prevSize = 0;
  let stable = 0;
  for (let i = 0; i < 100; i++) {
    panel.scrollTop = 0;
    await new Promise(r => setTimeout(r, 2000));
    collect();
    if (allMsgs.size === prevSize) {
      stable++;
      if (stable >= 3) break;
    } else { stable = 0; }
    prevSize = allMsgs.size;
  }
  return JSON.stringify({ total: allMsgs.size, messages: Array.from(allMsgs.values()) });
})()
```

**Limitation:** WhatsApp Web uses virtual scrolling with a memory cap of ~308 messages in `msgs._models`. Scroll up loads older messages but evicts recent ones. There is no `loadEarlierMsgs()` or `getAllMsgs()` method accessible via `require`. The `findQuery()` method exists but fails with `this.findQueryImpl is not a function` (the implementation is compiled and not exposed).

### Method 2: DOM scroll + accumulation (more messages, less structured)

For conversations larger than 308 messages, extract from the DOM by scrolling and accumulating in a Map:

```js
(async function() {
  const panel = document.querySelector('[data-testid="conversation-panel-messages"]');
  if (!panel) return 'no panel';

  const allMsgs = new Map();
  const collect = function() {
    panel.querySelectorAll('[data-testid="msg-container"]').forEach(function(m) {
      const text = m.querySelector('.copyable-text, span.selectable-text')?.textContent || '';
      const isOut = m.querySelector('.message-out') !== null;
      const id = m.getAttribute('data-id') || text + Math.random();
      allMsgs.set(id, { dir: isOut ? 'out' : 'in', text: text.substring(0, 200) });
    });
  };

  // Scroll to top first to load oldest messages
  panel.scrollTop = 0;
  await new Promise(r => setTimeout(r, 3000));
  collect();

  // Scroll down iteratively, accumulating messages
  let prevSize = 0;
  let stable = 0;
  for (let i = 0; i < 200; i++) {
    panel.scrollTop = panel.scrollHeight;
    await new Promise(r => setTimeout(r, 1000));
    collect();
    if (allMsgs.size === prevSize) {
      stable++;
      if (stable >= 5) break;
    } else { stable = 0; }
    prevSize = allMsgs.size;
  }
  return JSON.stringify({ total: allMsgs.size, messages: Array.from(allMsgs.values()) });
})()
```

This method extracted **8847 messages** from a group chat, vs 308 with the API method. The tradeoff is less structured data (no `type`, `t`, `fromMe` fields — only `dir` and `text`).

### Method 3: Hybrid (recommended for large chats)

Combine both: use DOM scroll to accumulate all messages, then enrich with API data for the messages currently in memory:

```js
// 1. DOM scroll accumulation (gets all messages)
// 2. API extraction for current _models (gets structured data for recent ~308)
// 3. Merge by message ID / text content
```

## Anti-patterns

- **Don't** search for contacts by exact full name — use partial variations. `"<Full Formal Name>"` fails; `"<First Name> <Last Name>"` works.
- **Don't** expect the `findQuery()` API method to work — it fails with `this.findQueryImpl is not a function`. The implementation is not exposed via `require`.
- **Don't** expect more than ~308 messages in `msgs._models` — WhatsApp Web has a virtual scrolling memory cap. Use DOM accumulation for larger conversations.
- **Don't** assume the pinned message dialog blocks the composer — it doesn't, but it can intercept clicks. Press Escape to close it.
- **Don't** use `innerText` or `textContent` for the composer — it's a contenteditable div. Use `playwright-cli fill` or dispatch `input` events.
- **Don't** claim a message was sent without verifying — check that the composer cleared and the Send button changed to "Mensaje de voz".

## Gotchas

- **Search spelling:** The stored name may differ from the expected spelling (accents, alternate spellings, nicknames). Try variations.
- **Virtual scrolling:** WhatsApp Web only keeps ~308 messages in memory. The DOM method (scroll + accumulate) is required for full conversation extraction.
- **Pinned dialog:** Chats with pinned messages show a dialog at the top. It doesn't block the composer but can intercept clicks. `Escape` closes it.
- **Heavy SPA:** WhatsApp Web is a heavy SPA. Always wait for elements to appear with in-page polling before interacting.
- **Module names:** The `require` function accepts module names like `WAWebChatCollection`, `WAWebMsgModel`, etc. Not all internal modules are accessible — some compiled implementations (like `findQueryImpl`) are not exposed.
