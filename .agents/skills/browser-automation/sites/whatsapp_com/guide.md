---
name: whatsapp
description: Automate WhatsApp Web for messaging, conversation monitoring, and bulk scanning.
verified: 2026-09-02
domains:
  - web.whatsapp.com
  - whatsapp.com
  - www.whatsapp.com
---

# WhatsApp Web Automation Guide

## Setup

### Open WhatsApp Web

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://web.whatsapp.com/"
```

Wait 5-8 seconds for the chat list to load. WhatsApp Web is a SPA that needs time to hydrate.

### Login

WhatsApp Web requires QR code scanning from a phone. If the session is expired, open in headed mode so the user can scan:

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://web.whatsapp.com/" --headed
```

The session persists in `.browser-profile` so subsequent opens are headless.

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster, more reliable, and don't depend on generated CSS classes or DOM structure that changes between updates.

### Shortcuts (Windows/Linux)

| Shortcut | Action | Notes |
|---|---|---|
| `Ctrl+Alt+N` | New chat | Opens "Nuevo chat" panel |
| `Ctrl+Alt+Shift+N` | New group | |
| `Ctrl+Alt+E` | Emoji panel | Requires compose box focused |
| `Ctrl+Alt+G` | GIF panel | |
| `Ctrl+Alt+S` | Sticker panel | |
| `Ctrl+Alt+P` | Profile and About | Opens "Editar perfil" |
| `Ctrl+Alt+,` | Settings | Opens settings panel |
| `Ctrl+Alt+/` | Search | Focuses chat list search |
| `Alt+K` | Extended search | Opens dialog "Busca chats, contactos y ajustes" |
| `Ctrl+Alt+Shift+U` | Mark as unread | |
| `Ctrl+Alt+Shift+M` | Mute chat | |
| `Ctrl+Alt+Shift+E` | Archive chat | |
| `Ctrl+Alt+Shift+P` | Pin chat | |
| `Ctrl+Alt+L` | Lock screen | |
| `Esc` | Close chat/panel | Closes any open dialog or panel |

**Not working:**
- `Ctrl+Alt+Shift+F` (Search in chat) — does not respond. Use the "Buscar" button in the conversation header instead.

### Usage with the wrapper

```bash
# New chat
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Alt+n

# Extended search (most useful for finding chats)
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+k
# Then type and Enter to open

# Emoji panel (compose must be focused)
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Alt+e

# Profile
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Alt+p

# Settings
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Alt+Comma

# Close any panel
node .agents/skills/browser-automation/scripts/browser.js exec press Escape
```

## Detecting modals and panels

**WhatsApp does not use `role="dialog"` or `innerText` consistently.** Using `eval` + `innerText` to detect if a modal opened is unreliable. Use the accessibility `snapshot` command instead.

### Patterns in the accessibility snapshot

| Modal/Panel | Snapshot pattern |
|---|---|
| Extended search (`Alt+K`) | `dialog` > `textbox "Busca chats, contactos y ajustes"` `[active]` |
| Emoji panel (`Ctrl+Alt+E`) | `application` > `list` > `grid` + `textbox "Buscar emoji"` `[active]` |
| Profile (`Ctrl+Alt+P`) | Second `banner` with `heading "Editar perfil"` |
| New chat (`Ctrl+Alt+N`) | Second `banner` with `heading "Nuevo chat"` + `textbox` |
| Settings (`Ctrl+Alt+,`) | Second `banner` with `heading "<user name>"` + `textbox "Buscar"` |

**Key insight:** WhatsApp panels appear as a second `banner` element outside the main `banner` (which contains the nav). The `dialog` role is only used for Extended search.

```bash
# Check if a modal is open via snapshot
node .agents/skills/browser-automation/scripts/browser.js exec snapshot | head -20
# Look for: dialog, second banner, application with grid
```

## Core flows

### Open a conversation by phone number

Navigate directly to a chat by phone number (international format, no `+`, no spaces):

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://web.whatsapp.com/send?phone=<PHONE>"
```

Example: `https://web.whatsapp.com/send?phone=5491112345678`

This creates or opens the conversation and focuses the compose box. Useful for starting new conversations without searching.

### Open a conversation by name

**Do not use `eval` + `click()` to open chats** — it often fails silently. Use semantic locators instead:

```bash
# Most reliable method: find by text and click
node .agents/skills/browser-automation/scripts/browser.js exec find text "<CHAT_NAME>" click
```

**Alternative:** Use `Alt+K` to search, type the name, and press Enter:

```bash
# Alt+K focuses the search field — then type with real keystrokes (no selector needed)
node .agents/skills/browser-automation/scripts/browser.js exec batch "press Alt+k" "keyboard type <CHAT_NAME>" "wait 800" "press Enter"
```

### Send a message

Preferred: focus the compose box (it usually has focus after opening a chat — otherwise `click` on it once), then `keyboard type` + `Enter`. Multi-line: `Shift+Enter` for line breaks.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec batch "click [data-testid=\"conversation-compose-box-input\"]" "keyboard type <MESSAGE>" "press Enter"
```

**Verify BEFORE send (non-negotiable):** always read back the compose box before pressing Enter — a wrong or empty message to a human is irreversible.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const b = document.querySelector('[data-testid=\"conversation-compose-box-input\"] div[contenteditable=true], footer div[contenteditable=true]');
  return b ? 'BOX: ' + b.innerText.substring(0,150) : 'EMPTY_OR_NOT_FOUND';
})()"
```

If output is `EMPTY_OR_NOT_FOUND` or the text differs from intended, do NOT send.

### Read messages in a conversation

Open the conversation, then extract messages from the panel. WhatsApp uses virtual scrolling — only ~15 messages are in the DOM at any time. To get the full conversation, scroll up and collect.

**Basic (visible messages only):**

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => {
  const panel = document.querySelector('[data-testid=\"conversation-panel-messages\"]');
  if (!panel) return 'no panel';
  const msgs = [];
  panel.querySelectorAll('[data-testid=\"msg-container\"]').forEach(m => {
    const text = m.querySelector('.copyable-text, span.selectable-text')?.textContent || '';
    const isOut = m.querySelector('.message-out') !== null;
    msgs.push({dir: isOut ? 'out' : 'in', text: text.substring(0, 300)});
  });
  return JSON.stringify(msgs.slice(-10));
})()"
```

Direction detection: `.message-out` = sent by user, absence = received.

**Full conversation (scroll-up collection):**

Each message has a unique `data-testid="conv-msg-<ID>"`. Use a `Set` to deduplicate while scrolling up.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => {
  const panel = document.querySelector('[data-testid=\"conversation-panel-messages\"]');
  if (!panel) return 'no panel';

  const allMsgs = new Set();

  function collect() {
    const msgs = panel.querySelectorAll('[data-testid^="conv-msg-"]');
    msgs.forEach(m => {
      const id = m.getAttribute('data-testid');
      const text = m.innerText.trim();
      if (text) allMsgs.add(id + '::' + text);
    });
  }

  collect();

  // Scroll up to load older messages
  // 10 iterations × 800ms = ~8 seconds for ~189 messages
  for (let i = 0; i < 10; i++) {
    panel.scrollTop = 0;
    await new Promise(r => setTimeout(r, 800));
    collect();
  }

  // Parse back to array
  const result = Array.from(allMsgs).map(m => {
    const [id, ...textParts] = m.split('::');
    return { id, text: textParts.join('::') };
  });

  return JSON.stringify({ total: result.length, messages: result });
})()"
```

**Tuning:** Increase the loop count for longer conversations. Each iteration loads ~15-20 more messages. 10 iterations ≈ 189 messages. For very long chats, use 30-50 iterations.

### Detect image/audio/video messages

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => {
  const panel = document.querySelector('[data-testid=\"conversation-panel-messages\"]');
  if (!panel) return 'no panel';
  const msgs = [];
  panel.querySelectorAll('[data-testid=\"msg-container\"]').forEach(m => {
    const hasImg = m.querySelector('img') !== null;
    const hasAudio = m.querySelector('audio') !== null;
    const hasVideo = m.querySelector('video') !== null;
    const text = m.textContent?.substring(0, 100);
    msgs.push({hasImg, hasAudio, hasVideo, text});
  });
  return JSON.stringify(msgs.slice(-5));
})()"
```

### Scan for unread messages

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const rows = document.querySelectorAll('[role=\"row\"]');
  const results = [];
  rows.forEach(r => {
    const text = r.textContent || '';
    if (text.includes('no leído')) {
      const name = r.querySelector('span[title]')?.getAttribute('title') || text.substring(0, 100);
      results.push(name);
    }
  });
  return JSON.stringify(results);
})()"
```

### Find conversations by name or number

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const rows = document.querySelectorAll('[role=\"row\"]');
  const results = [];
  rows.forEach(r => {
    const name = r.querySelector('span[title]')?.getAttribute('title') || '';
    if (name.includes('<SEARCH_TERM>')) {
      results.push({name, preview: r.textContent?.substring(0, 150)});
    }
  });
  return JSON.stringify(results);
})()"
```

## Sending images and files

(unverified after agent-browser migration)

### The problem with native file dialogs

**Problem:** WhatsApp Web's "Adjuntar > Fotos y videos" button triggers a native OS file dialog. When this dialog opens, the automation session loses control of the browser (it becomes a zombie and gets cleaned up).

**Solution:** Inject the file into WhatsApp's hidden `input[type="file"]` via `exec eval` + a `DataTransfer` object, bypassing the native dialog entirely. (unverified after agent-browser migration — previously done via playwright `setInputFiles`)

```bash
# 1. Open the conversation first
node .agents/skills/browser-automation/scripts/browser.js exec find text "<CHAT_NAME>" click

# 2. Set the file on the hidden input (no native dialog needed)
#    Fetch the local file as bytes, build a File, assign via DataTransfer
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => {
  const res = await fetch('file:///absolute/path/to/file.png');
  const blob = await res.blob();
  const file = new File([blob], 'file.png', {type: blob.type});
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.querySelector('input[type=\"file\"]');
  if (!input) return 'no input';
  input.files = dt.files;
  input.dispatchEvent(new Event('change', {bubbles: true}));
  return 'file set';
})()"

# 3. Wait for the preview + caption box to appear
node .agents/skills/browser-automation/scripts/browser.js exec wait 3000

# 4. Write the caption (use Shift+Enter for line breaks, NOT Enter)
node .agents/skills/browser-automation/scripts/browser.js exec batch "click 'div[contenteditable][data-tab=\"10\"]'" "keyboard type First line." "press Shift+Enter" "keyboard type Second line."

# 5. Send (snapshot first to get fresh ref)
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i
# Look for: button "Enviar 1 seleccionado" or button "Enviar"
node .agents/skills/browser-automation/scripts/browser.js exec click <@eN>
```

**Key details:**
- WhatsApp has one hidden `input[type="file"]` with `accept="image/*"`. For documents, the accept attribute changes.
- After the file is set, WhatsApp shows a preview with a caption box (`div[contenteditable][data-tab="10"]`) and an "Enviar" button.
- Use `Shift+Enter` for line breaks in the caption. Plain `Enter` may send the message prematurely or lose the first line.
- The send button text changes: "Enviar 1 seleccionado" when a file is attached, "Enviar" when only text.
- Note: `fetch('file://...')` may be blocked by page security policy. If it fails, base64-encode the file into the eval payload or check whether agent-browser exposes a dedicated upload command. (unverified)

**Anti-pattern:**
- Do NOT click "Adjuntar" > "Fotos y videos" via `eval` + `click()`. The native file dialog crashes the session.

## Gotchas and anti-patterns

### Unread badges are NOT reliable for monitoring

**Problem:** Conversations opened on the phone lose their unread badge on Web. Relying only on `no leído` badges misses messages that were already seen on mobile.

**Solution:** Maintain your own list of contacts being monitored. Open each conversation periodically and check the last message direction and timestamp, regardless of unread state.

### Refs become stale after navigation or time

**Problem:** Interactive refs (e.g. `@e5` from `snapshot -i`) become invalid after:
- Navigating to a new URL
- The page re-rendering (WhatsApp is a live SPA)
- Other tabs stealing focus

**Solution:** Always capture a fresh `snapshot -i` before clicking a ref. If a ref error occurs, re-snapshot and find the ref again.

### Other tabs steal focus

**Problem:** If multiple tabs are open, navigating with `goto` may switch to a different tab (e.g. LinkedIn, YouTube). WhatsApp actions then fail silently or target the wrong page.

**Solution:** Before any WhatsApp action, verify the URL is `https://web.whatsapp.com/`. If not, navigate back:
```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://web.whatsapp.com/"
```

### beforeunload dialogs block navigation

**Problem:** Navigating away from WhatsApp can trigger a `beforeunload` dialog that blocks `goto`.

**Solution:** Press `Enter` to accept the native dialog, or check agent-browser's dialog handling if it exposes one. (unverified after agent-browser migration)
```bash
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

### Scroll the chat list to find older conversations

**Problem:** The chat list only renders visible rows. Older conversations are not in the DOM until scrolled into view.

**Solution:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const list = document.querySelector('[role=\"grid\"]') || document.querySelector('[data-testid=\"chat-list\"]');
  if (list) { list.scrollTop = 0; } // scroll to top (most recent)
  // or: list.scrollTop = list.scrollHeight; // scroll to bottom (older)
  return 'scrolled';
})()"
```

### Drafts vs sent messages

**Problem:** Typing into the compose box may leave the message as a draft without sending it. The conversation list shows `Borrador:` prefix for drafts.

**Solution:** After typing, always press `Enter` (or click the send button) explicitly. Do not assume the message was sent just because the text appears in the compose box.

### Typing indicator

**Problem:** The conversation list shows `escribiendo...` when the other person is typing. This is not a message and cannot be read.

**Solution:** Wait 15-30 seconds and re-scan. The indicator disappears when the message is sent (or if they cancel).

### Message timestamps

Messages include timestamps in the text content (e.g. `21:43`). When extracting message text, the timestamp is appended. Parse it to determine message recency.

## Validation

**Validated:** 2026-08-24 against live WhatsApp Web.

## Adding a contact to a WhatsApp list

WhatsApp Web supports custom lists (e.g. for organizing contacts by topic). To add an open conversation to a list:

1. Open the conversation (via `send?phone=` URL or clicking the chat row)
2. Click the **Menú** button in the conversation header (`[data-testid="conversation-header"]`) — via `find text "Menú" click` or its `@eN` ref
3. Click the **Añadir a la lista** menu item — `find text "Añadir a la lista" click`
4. If multiple lists exist, select the target list from the dialog

```bash
# Open conversation
node .agents/skills/browser-automation/scripts/browser.js goto "https://web.whatsapp.com/send?phone=<PHONE>"
# Wait for panel to load
node .agents/skills/browser-automation/scripts/browser.js exec wait 5000
# Click Menú in conversation header — prefer find; fallback to snapshot -i ref
node .agents/skills/browser-automation/scripts/browser.js exec find text "Menú" click
# If find hits the wrong Menú (there are two), take a snapshot and pick the header one:
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i
# Look for: button "Menú" inside the conversation header region → click @eN
node .agents/skills/browser-automation/scripts/browser.js exec click <@eN>
# Click "Añadir a la lista"
node .agents/skills/browser-automation/scripts/browser.js exec find text "Añadir a la lista" click
```

**Gotcha:** There are two "Menú" buttons in the snapshot. The one in the conversation header (`[data-testid="conversation-header"]`) is the correct one — pick its `@eN` ref from `snapshot -i`, not the first match.

**Bulk add pattern:** To add multiple contacts to a list, loop through phone numbers with the above flow. Add `sleep 2` between each to let the menu close and the page settle.

## Long message formatting

When sending long messages (more than 2-3 sentences), separate into paragraphs with blank lines for readability on mobile devices. In the compose box, `Shift+Enter` produces the line break (plain `Enter` sends).

```bash
node .agents/skills/browser-automation/scripts/browser.js exec batch \
  "click [data-testid=\"conversation-compose-box-input\"]" \
  "keyboard type Hola! Primer párrafo corto." \
  "press Shift+Enter" "press Shift+Enter" \
  "keyboard type Segundo párrafo corto." \
  "press Shift+Enter" "press Shift+Enter" \
  "keyboard type Tercer párrafo corto."
# Then verify the box contents (see "Verify BEFORE send") and press Enter to send.
```

**Anti-pattern:** Sending a single wall of text. Recipients reading on mobile will struggle. Keep paragraphs to 1-2 sentences each.

## Voice note transcription via Cache Storage

> See also: `voice-notes.md` in this directory for the full transcription flow.

### Cache is shared across ALL conversations

**Problem:** The `lru-media-array-buffer-cache` Cache Storage is shared across all WhatsApp conversations. When you play a voice note, the audio blob is cached, but you cannot tell which conversation it came from by cache key alone.

**Solution:** Before transcribing, note the voice note duration from the accessibility snapshot (`Mensaje de voz 0:00/0:11`). After playing, extract all Ogg blobs and transcribe them. Match by content, not by cache index.

### LRU eviction

**Problem:** The cache has a limited size and uses LRU eviction. Playing a new voice note may overwrite an existing cached blob rather than adding a new entry.

**Solution:** Extract and transcribe immediately after playing each voice note. Do not play multiple notes and then try to extract them all at once; earlier ones may be evicted.

### Identifying the correct audio

1. Play the voice note (click `button "Reproducir mensaje de voz"`)
2. Wait 3-4 seconds for the blob to cache
3. List all Ogg blobs in cache: `caches.open('lru-media-array-buffer-cache').then(cache => cache.keys().then(keys => ...))`
4. Filter by magic bytes `OggS`
5. The most recently added/modified entry is likely the one you just played
6. Extract as base64, save to file, send to Groq Whisper
7. Verify the transcription content matches the expected conversation context

## agent-browser notes (verified 2026-10-24)
- `press "a+b"` = chord (simultaneous), NOT sequence. Sequences = separate `press` calls.
- `Alt+K` opens extended search BUT types a literal `k` in the textbox — select-all + retype, or clear first.
- Chat list rows have no interactive refs: click the **gridcell child** (`gridcell "<name> <time> <preview>"`) or use `find text "<name>" click`.
- Unread filter: `tablist "chat-list-filters"` → `tab "No leídos N"` — click by `@eN` ref from `snapshot -i`.
- `exec type "<text>"` needs a ref; free typing is `exec keyboard type "<text>"` (types into current focus). `exec fill <sel> "text"` sets a field value — prefer `keyboard type` for WhatsApp's contenteditable boxes.
- `eval` snippets must be IIFE: `(() => {...})()` or `(async () => {...})()` — a bare `async () => {...}` returns `{}` silently.
- Search textbox residue: leftover text breaks the unread filter — clear with the "End icon" button or `press Control+a` then `press Delete`.
