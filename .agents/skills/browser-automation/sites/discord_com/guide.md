---
name: discord
description: Automate Discord Web for messaging, navigation, and voice.
verified: 2026-09-02
domains:
  - discord.com
  - www.discord.com
  - discordapp.com
  - ptb.discord.com
  - canary.discord.com
---

# Discord Web Automation Guide

All commands go through the wrapper from the repo root:

```bash
node .agents/skills/browser-automation/scripts/browser.js <command>
```

## Interaction order (semantic-first)

1. **Keyboard shortcuts** -- `exec press` / `exec batch` (`Ctrl+K` quick switcher, `Enter` send, `Esc` mark read, navigation).
2. **`exec find`** -- `find role|text|label <value> <action>`.
3. **`exec snapshot -i`** -- inspect refs, then `click`/`fill` by `@eN`.
4. **`exec eval`** -- LAST RESORT for message-list extraction, scroll loading, focus.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js navigate "https://discord.com/app"
```

Wait 5-8 seconds for the SPA to load. Discord Web is a React SPA that needs time to hydrate:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('div[role=\"textbox\"], [data-list-id=\"chat-messages\"], nav')"
```

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster, more reliable, and don't depend on generated CSS classes that change between updates.

**Show all shortcuts:** `Ctrl+/` opens the "Atajos de teclado" dialog with the full list.

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

### Usage with the wrapper

```bash
# Show keyboard shortcuts
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Slash

# Quick Switcher (find any channel/DM)
node .agents/skills/browser-automation/scripts/browser.js exec press Control+k

# Search in current channel
node .agents/skills/browser-automation/scripts/browser.js exec press Control+f

# Emoji picker (compose must be focused)
node .agents/skills/browser-automation/scripts/browser.js exec press Control+e

# Navigate channels
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+ArrowUp
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+ArrowDown

# Mark channel as read
node .agents/skills/browser-automation/scripts/browser.js exec press Escape
```

## Detecting modals

Discord uses `dialog` role consistently for modals. Check the accessibility snapshot:

| Modal | Snapshot pattern |
|---|---|
| Keyboard shortcuts (`Ctrl+/`) | `dialog "Atajos de teclado"` |
| Quick Switcher (`Ctrl+K`) | `dialog "Cambio Rápido"` + `combobox "Cambio Rápido"` |
| Emoji picker (`Ctrl+E`) | `dialog "Selector de expresiones"` + `tab "Emojis"` |
| Settings (`Ctrl+,`) | `dialog` with settings sections |

```bash
# Check if a modal is open
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i | grep "dialog"
```

## Opening a DM or channel

**Use `Ctrl+K` (Quick Switcher) -- most reliable:**

```bash
# 1. Open Quick Switcher
node .agents/skills/browser-automation/scripts/browser.js exec press Control+k

# 2. Type the name into the focused combobox
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "santituc"
# (if focus fails: exec snapshot -i to find the combobox "Cambio Rápido" ref, then exec fill "@eN" "santituc")

# 3. Wait for results
node .agents/skills/browser-automation/scripts/browser.js exec wait 800

# 4. Click the matching option by ref (safer than blind Enter -- see notes below)
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i | grep -i "santituc"
node .agents/skills/browser-automation/scripts/browser.js exec click "@eN"
```

**Alternative:** Click the server/DM in the sidebar via `find`:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find role treeitem "Hermes" click
```

Fallback eval (Discord servers have complex DOM; aria-label match verified 2026-09-02):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const item = Array.from(document.querySelectorAll('[role=\"treeitem\"]'))
    .find(i => i.getAttribute('aria-label') && i.getAttribute('aria-label').includes('Hermes'));
  if (item) { item.click(); return 'clicked'; }
  return 'not found';
})()"
```

## Reading messages

Discord renders messages in a scrollable list. Unlike WhatsApp, Discord does NOT use virtual scrolling as aggressively -- more messages are in the DOM.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const messages = Array.from(document.querySelectorAll('[id^=\"chat-messages-\"] li, [role=\"article\"]'));
  const result = messages.map(m => ({
    text: m.innerText.trim().substring(0, 300),
    author: m.querySelector('[class*=\"username\"]') ? m.querySelector('[class*=\"username\"]').textContent : ''
  }));
  return JSON.stringify({ count: result.length, messages: result });
})()"
```

**For long conversations:** Use `PageUp` (`exec press PageUp`) to scroll up and load older messages, then collect:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  const container = document.querySelector('[class*=\"scrollerInner\"]') || document.querySelector('main');
  if (!container) return 'no container';

  const allMsgs = new Set();

  function collect() {
    const msgs = container.querySelectorAll('[id^=\"chat-messages-\"] [id^=\"message-content\"]');
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
})()"
```

## Sending a message

1. Focus the compose box: `div[role="textbox"]`
2. Type the message
3. **Verify BEFORE send:** read the compose box back -- a blank or wrong message to a human is irreversible
4. Press `Enter` to send

```bash
# Focus compose (semantic first)
node .agents/skills/browser-automation/scripts/browser.js exec find role textbox click

# Type message
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "Hello world"
# (or, via ref: exec snapshot -i, then exec fill "@eN" "Hello world")

# VERIFY BEFORE SEND
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('div[role=\"textbox\"]').innerText"

# Send
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**For multi-line messages:** use `Shift+Enter` for line breaks instead of `\n` in the typed text. Chain via `exec batch "keyboard type Line one" "press Shift+Enter" "keyboard type Line two"`.

## Gotchas

- **`Ctrl+E` (emoji picker) requires compose focus** -- if the textbox isn't focused, the shortcut does nothing. Focus the compose box first.
- **Message shortcuts (E, R, F, etc.) require hovering over a message** -- the message must be the focused/hovered element. In headless mode this may not work; use the context menu via `find`/`eval` instead.
- **Discord class names are obfuscated** -- they change between builds. Never rely on class names like `scrollerInner_d38b50`. Use `[role]`, `[aria-label]`, or `[data-testid]` attributes instead.
- **`Ctrl+F` opens Discord's search, not the browser's** -- Discord intercepts the shortcut. Use `Alt+Ctrl+F` or the browser menu if you need browser find.
- **Sidebar items are `[role="treeitem"]`** but the `aria-label` may be null for some items. Check text content as fallback.

## agent-browser notes (verified 2026-10-24)

- Quick Switcher: the input is `combobox "Cambio Rápido"`, not a textbox. `Enter` after typing is risky (fuzzy match / external link) -- prefer clicking the `option` by ref from `snapshot -i`.
- `exec keyboard type` types into the currently focused element; there is no free typing. If it fails, focus a snapshot ref first via `click` or use `exec fill "@eN" "text"`.
- `state-save`/`state-load` do not exist: the session persists in `.browser-profile/`.
- `exec eval` takes an IIFE `(()=>{...})()` or plain expression.
