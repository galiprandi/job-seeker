# Discord Web Automation Guide

> **Prerequisite:** Read the parent [SKILL.md](../../SKILL.md) for golden rules, wrapper usage, and session management.

## Setup

```bash
node scripts/browser.js goto "https://discord.com/app"
```

Wait 5-8 seconds for the SPA to load. Discord Web is a React SPA that needs time to hydrate.

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster, more reliable, and don't depend on generated CSS classes that change between updates.

**Show all shortcuts:** `Ctrl+/` — opens the "Atajos de teclado" dialog with the full list.

### General

| Shortcut | Action |
|---|---|
| `Ctrl+/` | Show keyboard shortcuts dialog |
| `Ctrl+,` | Open User Settings |
| `Ctrl+K` | Quick Switcher (channels/DMs) |
| `Ctrl+F` | Search within current channel |
| `Ctrl+Shift+F` | Search across all channels |
| `Esc` | Close modal / mark channel as read |

### Navigation

| Shortcut | Action |
|---|---|
| `Alt+Up` | Previous channel |
| `Alt+Down` | Next channel |
| `Ctrl+Alt+Up` | Previous server |
| `Ctrl+Alt+Down` | Next server |
| `Ctrl+Alt+Right` | Toggle between last server and DMs |
| `Alt+Left` | Navigate back |
| `Alt+Right` | Navigate forward |
| `Alt+Shift+Up` | Previous unread channel |
| `Alt+Shift+Down` | Next unread channel |
| `Shift+PageUp` | Jump to oldest unread message |

### Messages (hover over a message first)

| Shortcut | Action |
|---|---|
| `E` | Edit message |
| `Backspace` | Delete message |
| `P` | Pin message |
| `+` | Add reaction |
| `R` | Reply |
| `F` | Forward message |
| `S` | Record voice message |
| `Ctrl+C` | Copy text |
| `Alt+Enter` | Mark as unread |

### Compose

| Shortcut | Action |
|---|---|
| `Ctrl+E` | Emoji picker (requires compose focused) |
| `Ctrl+G` | GIF picker |
| `Ctrl+S` | Sticker picker |
| `Ctrl+Shift+U` | Upload file |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+I` | Strikethrough |
| `Ctrl+K` | Insert link |

### Chat actions

| Shortcut | Action |
|---|---|
| `Shift+Esc` | Mark server as read |
| `Esc` | Mark channel as read |
| `Ctrl+P` | Toggle pins popout |
| `Ctrl+I` | Toggle mentions/inbox popout |
| `Ctrl+U` | Toggle channel member list |
| `Ctrl+Shift+T` | Create private group |
| `Ctrl+Shift+L` | Copy channel link |
| `PageUp` / `PageDown` | Scroll chat up/down |

### Voice

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+M` | Toggle mute |
| `Ctrl+Shift+D` | Toggle deafen |
| `Ctrl+Enter` | Answer incoming call |
| `Esc` | Decline incoming call |
| `Ctrl+'` | Start call in DM/group |

### Usage with playwright-cli

```bash
# Show keyboard shortcuts
playwright-cli press Control+Slash

# Quick Switcher (find any channel/DM)
playwright-cli press Control+k
# Then type and Enter to open

# Search in current channel
playwright-cli press Control+f

# Emoji picker (compose must be focused)
playwright-cli press Control+e

# Navigate channels
playwright-cli press Alt+ArrowUp
playwright-cli press Alt+ArrowDown

# Mark channel as read
playwright-cli press Escape
```

## Detecting modals

Discord uses `dialog` role consistently for modals. Check the accessibility snapshot:

| Modal | Snapshot pattern |
|---|---|
| Keyboard shortcuts (`Ctrl+/`) | `dialog "Atajos de teclado"` |
| Quick Switcher (`Ctrl+K`) | `dialog "Cambio Rápido"` + `textbox "Buscar"` |
| Emoji picker (`Ctrl+E`) | `dialog "Selector de expresiones"` + `tab "Emojis"` |
| Settings (`Ctrl+,`) | `dialog` with settings sections |

```bash
# Check if a modal is open
node scripts/browser.js exec snapshot | grep "dialog"
```

## Opening a DM or channel

**Use `Ctrl+K` (Quick Switcher) — most reliable:**

```bash
# 1. Open Quick Switcher
playwright-cli press Control+k

# 2. Type the name
playwright-cli type "santituc"

# 3. Wait for results, press Enter
playwright-cli press Enter
```

**Alternative:** Click the server/DM in the sidebar:

```bash
# Click a server by name (use eval — Discord servers have complex DOM)
node scripts/browser.js exec eval "(function(){
  const item = Array.from(document.querySelectorAll('[role=\"treeitem\"]'))
    .find(i => i.getAttribute('aria-label') && i.getAttribute('aria-label').includes('Hermes'));
  if (item) { item.click(); return 'clicked'; }
  return 'not found';
})()"
```

## Reading messages

Discord renders messages in a scrollable list. Unlike WhatsApp, Discord does NOT use virtual scrolling as aggressively — more messages are in the DOM.

```javascript
async () => {
  const messages = Array.from(document.querySelectorAll('[id^="chat-messages-"] li, [role="article"]'));
  const result = messages.map(m => ({
    text: m.innerText.trim().substring(0, 300),
    author: m.querySelector('[class*="username"]')?.textContent || ''
  }));
  return JSON.stringify({ count: result.length, messages: result });
}
```

**For long conversations:** Use `PageUp` to scroll up and load older messages, then collect:

```javascript
async () => {
  const container = document.querySelector('[class*="scrollerInner"]') || document.querySelector('main');
  if (!container) return 'no container';

  const allMsgs = new Set();

  function collect() {
    const msgs = container.querySelectorAll('[id^="chat-messages-"] [id^="message-content"]');
    msgs.forEach(m => {
      const id = m.id;
      const text = m.innerText.trim();
      if (text) allMsgs.add(id + '::' + text);
    });
  }

  collect();
  for (let i = 0; i < 10; i++) {
    container.scrollTop = 0;
    await new Promise(r => setTimeout(r, 800));
    collect();
  }

  return JSON.stringify({ total: allMsgs.size });
}
```

## Sending a message

1. Focus the compose box: `div[role="textbox"]`
2. Type the message
3. Press Enter to send

```bash
# Focus compose
node scripts/browser.js exec eval "document.querySelector('div[role=\"textbox\"]').focus()"

# Type message
node scripts/browser.js exec type "Hello world"

# Send
node scripts/browser.js exec press Enter
```

**For multi-line messages:** Use `Shift+Enter` for line breaks instead of `\n` in type.

## Gotchas

- **`Ctrl+E` (emoji picker) requires compose focus** — if the textbox isn't focused, the shortcut does nothing. Focus the compose box first.
- **Message shortcuts (E, R, F, etc.) require hovering over a message** — the message must be the focused/hovered element. In headless mode, this may not work; use the context menu via eval instead.
- **Discord class names are obfuscated** — they change between builds. Never rely on class names like `scrollerInner_d38b50`. Use `[role]`, `[aria-label]`, or `[data-testid]` attributes instead.
- **`Ctrl+F` opens Discord's search, not the browser's** — Discord intercepts the shortcut. Use `Alt+Ctrl+F` or the browser menu if you need browser find.
- **Sidebar items are `[role="treeitem"]`** but the `aria-label` may be null for some items. Check text content as fallback.

## Anti-patterns

- **Don't** click buttons when a keyboard shortcut exists — prefer `press` over `eval` + click
- **Don't** rely on obfuscated class names — they change between Discord builds
- **Don't** try to use message shortcuts (E, R, F) without hovering the message first
- **Don't** use `Ctrl+F` expecting browser find — Discord intercepts it for channel search
- **Don't** assume the compose box is focused — always focus it before typing or using compose shortcuts
