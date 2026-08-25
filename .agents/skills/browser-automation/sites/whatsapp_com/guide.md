---
name: whatsapp
description: Automate WhatsApp Web for messaging, conversation monitoring, and bulk scanning.
---

# WhatsApp Web Automation Guide

> **Prerequisite:** Read the parent [SKILL.md](../../SKILL.md) for golden rules, wrapper usage, and session management.

## Setup

### Open WhatsApp Web

```bash
node scripts/browser.js goto "https://web.whatsapp.com/"
```

Wait 5-8 seconds for the chat list to load. WhatsApp Web is a SPA that needs time to hydrate.

### Login

WhatsApp Web requires QR code scanning from a phone. If the session is expired, open in headed mode so the user can scan:

```bash
node scripts/browser.js open "https://web.whatsapp.com/" --headed
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

### Usage with playwright-cli

```bash
# New chat
playwright-cli press Control+Alt+n

# Extended search (most useful for finding chats)
playwright-cli press Alt+k
# Then type and Enter to open

# Emoji panel (compose must be focused)
playwright-cli press Control+Alt+e

# Profile
playwright-cli press Control+Alt+p

# Settings
playwright-cli press Control+Alt+Comma

# Close any panel
playwright-cli press Escape
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
node scripts/browser.js exec snapshot | head -20
# Look for: dialog, second banner, application with grid
```

## Core flows

### Open a conversation by phone number

Navigate directly to a chat by phone number (international format, no `+`, no spaces):

```bash
node scripts/browser.js goto "https://web.whatsapp.com/send?phone=<PHONE>"
```

Example: `https://web.whatsapp.com/send?phone=5491112345678`

This creates or opens the conversation and focuses the compose box. Useful for starting new conversations without searching.

### Open a conversation by name

**Do not use `eval` + `click()` to open chats** — it often fails silently. Use playwright's `click` command with a text selector instead:

```bash
# Most reliable method
node scripts/browser.js exec click "div[role=\"row\"] >> text=<CHAT_NAME>"
```

**Alternative:** Use `Alt+K` to search, type the name, and press Enter:

```bash
playwright-cli press Alt+k
playwright-cli type "<chat name>"
playwright-cli press Enter
```

### Send a message

1. Find the compose box: `[data-testid="conversation-compose-box-input"]`
2. Fill it with `fill <ref>`
3. Find the send button: `button "Enviar"` or `[data-testid="compose-box"] button`
4. Click it

```bash
node scripts/browser.js exec fill <compose_ref> "<message>"
node scripts/browser.js exec click <send_button_ref>
```

### Read messages in a conversation

Open the conversation, then extract messages from the panel. WhatsApp uses virtual scrolling — only ~15 messages are in the DOM at any time. To get the full conversation, scroll up and collect.

**Basic (visible messages only):**

```javascript
async () => {
  const panel = document.querySelector('[data-testid="conversation-panel-messages"]');
  if (!panel) return 'no panel';
  const msgs = [];
  panel.querySelectorAll('[data-testid="msg-container"]').forEach(m => {
    const text = m.querySelector('.copyable-text, span.selectable-text')?.textContent || '';
    const isOut = m.querySelector('.message-out') !== null;
    msgs.push({dir: isOut ? 'out' : 'in', text: text.substring(0, 300)});
  });
  return JSON.stringify(msgs.slice(-10));
}
```

Direction detection: `.message-out` = sent by user, absence = received.

**Full conversation (scroll-up collection):**

Each message has a unique `data-testid="conv-msg-<ID>"`. Use a `Set` to deduplicate while scrolling up.

```javascript
async () => {
  const panel = document.querySelector('[data-testid="conversation-panel-messages"]');
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
}
```

**Tuning:** Increase the loop count for longer conversations. Each iteration loads ~15-20 more messages. 10 iterations ≈ 189 messages. For very long chats, use 30-50 iterations.

### Detect image/audio/video messages

```javascript
async () => {
  const panel = document.querySelector('[data-testid="conversation-panel-messages"]');
  if (!panel) return 'no panel';
  const msgs = [];
  panel.querySelectorAll('[data-testid="msg-container"]').forEach(m => {
    const hasImg = m.querySelector('img') !== null;
    const hasAudio = m.querySelector('audio') !== null;
    const hasVideo = m.querySelector('video') !== null;
    const text = m.textContent?.substring(0, 100);
    msgs.push({hasImg, hasAudio, hasVideo, text});
  });
  return JSON.stringify(msgs.slice(-5));
}
```

### Scan for unread messages

```javascript
async () => {
  const rows = document.querySelectorAll('[role="row"]');
  const results = [];
  rows.forEach(r => {
    const text = r.textContent || '';
    if (text.includes('no leído')) {
      const name = r.querySelector('span[title]')?.getAttribute('title') || text.substring(0, 100);
      results.push(name);
    }
  });
  return JSON.stringify(results);
}
```

### Find conversations by name or number

```javascript
async () => {
  const rows = document.querySelectorAll('[role="row"]');
  const results = [];
  rows.forEach(r => {
    const name = r.querySelector('span[title]')?.getAttribute('title') || '';
    if (name.includes('<SEARCH_TERM>')) {
      results.push({name, preview: r.textContent?.substring(0, 150)});
    }
  });
  return JSON.stringify(results);
}
```

## Sending images and files

### The problem with playwright-cli upload and drop

**Problem:** `playwright-cli upload` requires a native file chooser modal to be open. WhatsApp Web's "Adjuntar > Fotos y videos" button triggers a native OS file dialog. When this dialog opens, playwright-cli loses control of the session and the browser becomes a zombie (unresponsive, gets cleaned up).

`playwright-cli drop` does not work with WhatsApp's hidden `input[type="file"]` element either.

**Solution:** Use `run-code` with `page.locator('input[type="file"]').setInputFiles()` to set the file directly on the hidden input, bypassing the native dialog entirely.

```bash
# 1. Open the conversation first
node scripts/browser.js exec click "div[role=\"row\"] >> text=<CHAT_NAME>"

# 2. Set the file on the hidden input (no native dialog needed)
node scripts/browser.js exec run-code "(async (page) => { const input = await page.locator('input[type=\"file\"]').first(); await input.setInputFiles('/absolute/path/to/file.png'); return 'file set'; })"

# 3. Wait for the preview + caption box to appear
sleep 3

# 4. Write the caption (use Shift+Enter for line breaks, NOT Enter)
node scripts/browser.js exec run-code "(async (page) => { const caption = await page.locator('div[contenteditable][data-tab=\"10\"]'); await caption.focus(); await page.keyboard.type('First line.'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('Second line.'); return 'done'; })"

# 5. Send (snapshot first to get fresh ref)
node scripts/browser.js exec snapshot
# Look for: button "Enviar 1 seleccionado" or button "Enviar"
node scripts/browser.js exec click <send_ref>
```

**Key details:**
- WhatsApp has one hidden `input[type="file"]` with `accept="image/*"`. For documents, the accept attribute changes.
- After `setInputFiles`, WhatsApp shows a preview with a caption box (`div[contenteditable][data-tab="10"]`) and an "Enviar" button.
- Use `Shift+Enter` for line breaks in the caption. Plain `Enter` may send the message prematurely or lose the first line.
- The send button text changes: "Enviar 1 seleccionado" when a file is attached, "Enviar" when only text.

**Anti-pattern:**
- Do NOT click "Adjuntar" > "Fotos y videos" via `eval` + `click()`. The native file dialog crashes playwright-cli.
- Do NOT use `playwright-cli upload` — it requires the native dialog and will zombie the session.
- Do NOT use `playwright-cli drop` on `input[type="file"]` — it silently fails.

## Gotchas and anti-patterns

### Unread badges are NOT reliable for monitoring

**Problem:** Conversations opened on the phone lose their unread badge on Web. Relying only on `no leído` badges misses messages that were already seen on mobile.

**Solution:** Maintain your own list of contacts being monitored. Open each conversation periodically and check the last message direction and timestamp, regardless of unread state.

### Refs become stale after navigation or time

**Problem:** Playwright refs (e.g. `f123e456`) become invalid after:
- Navigating to a new URL
- The page re-rendering (WhatsApp is a live SPA)
- Other tabs stealing focus

**Solution:** Always capture a fresh snapshot before clicking a ref. If `Ref not found` error occurs, re-snapshot and find the ref again.

### Other tabs steal focus

**Problem:** If multiple tabs are open, navigating with `goto` may switch to a different tab (e.g. LinkedIn, YouTube). WhatsApp actions then fail silently or target the wrong page.

**Solution:** Before any WhatsApp action, verify the URL is `https://web.whatsapp.com/`. If not, navigate back:
```bash
node scripts/browser.js goto "https://web.whatsapp.com/"
```

### beforeunload dialogs block navigation

**Problem:** Navigating away from WhatsApp can trigger a `beforeunload` dialog that blocks `goto`.

**Solution:** Accept the dialog first:
```bash
node scripts/browser.js exec dialog-accept
```

### Scroll the chat list to find older conversations

**Problem:** The chat list only renders visible rows. Older conversations are not in the DOM until scrolled into view.

**Solution:**
```javascript
async () => {
  const list = document.querySelector('[role="grid"]') || document.querySelector('[data-testid="chat-list"]');
  if (list) { list.scrollTop = 0; } // scroll to top (most recent)
  // or: list.scrollTop = list.scrollHeight; // scroll to bottom (older)
  return 'scrolled';
}
```

### Drafts vs sent messages

**Problem:** Filling the compose box with `fill` may leave the message as a draft without sending it. The conversation list shows `Borrador:` prefix for drafts.

**Solution:** After filling, always click the send button explicitly. Do not assume the message was sent just because the text appears in the compose box.

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
2. Click the **Menú** button in the conversation header: `[data-testid="conversation-header"] button "Menú"`
3. Click the **Añadir a la lista** menu item: `menuitem "Añadir a la lista"`
4. If multiple lists exist, select the target list from the dialog

```bash
# Open conversation
node scripts/browser.js goto "https://web.whatsapp.com/send?phone=<PHONE>"
# Wait for panel to load
sleep 5
# Click Menú in conversation header
MENU_REF=$(node scripts/browser.js exec snapshot 2>/dev/null | grep 'button "Menú"' | tail -1 | sed 's/.*\[ref=\(f[0-9a-f]*\)\].*/\1/')
node scripts/browser.js exec click $MENU_REF
# Click "Añadir a la lista"
ADD_REF=$(node scripts/browser.js exec snapshot 2>/dev/null | grep "Añadir a la lista" | sed 's/.*\[ref=\(f[0-9a-f]*\)\].*/\1/')
node scripts/browser.js exec click $ADD_REF
```

**Gotcha:** There are two "Menú" buttons in the snapshot. The one in the conversation header (`[data-testid="conversation-header"]`) is the correct one. Use `tail -1` or filter by the header testid.

**Bulk add pattern:** To add multiple contacts to a list, loop through phone numbers with the above flow. Add `sleep 2` between each to let the menu close and the page settle.

## Long message formatting

When sending long messages (more than 2-3 sentences), separate into paragraphs with `\n\n` for readability on mobile devices. WhatsApp renders `\n` as line breaks in the compose box.

```bash
node scripts/browser.js exec fill <ref> "Hola! Primer párrafo corto.

Segundo párrafo corto.

Tercer párrafo corto."
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

## Anti-patterns

- **Do NOT rely solely on unread badges** for monitoring. Use a maintained contact list.
- **Do NOT assume a ref is valid** after any navigation or time gap. Re-snapshot.
- **Do NOT use `innerText` assignment** to fill the compose box. Use `fill` on the compose box ref.
- **Do NOT send messages without verifying** the conversation target is correct (wrong number = wrong person).
- **Do NOT forget to handle `beforeunload` dialogs** when navigating away from WhatsApp.
- **Do NOT send long messages as a single wall of text.** Separate into paragraphs with `\n\n`.
- **Do NOT play multiple voice notes and then try to extract them all.** The LRU cache may evict earlier blobs. Extract and transcribe one at a time.
- **Do NOT assume a cache entry belongs to a specific conversation.** The cache is shared across all chats. Match by transcription content, not by cache index.
- **Do NOT use `eval` + `innerText` to detect modals.** WhatsApp doesn't expose modal text via `innerText` reliably. Use `snapshot` instead.
- **Do NOT use `eval` + `click()` to open chats.** It often fails silently. Use `playwright-cli click "div[role=\"row\"] >> text=<NAME>"` or `Alt+K` + search.
- **Do NOT assume all official shortcuts work.** `Ctrl+Alt+Shift+F` (search in chat) does not respond. Test before relying on a shortcut.
- **Do NOT click buttons when a keyboard shortcut exists** — prefer `press` over `eval` + click.
