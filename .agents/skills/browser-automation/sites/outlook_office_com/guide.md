---
name: outlook
description: Automate Outlook on the web (Microsoft 365) with playwright-cli. Covers reading inbox, archiving, replying, composing, searching, folder navigation, and keyboard shortcuts. Use when checking email, sending messages, managing inbox, or extracting email data in Outlook Web. Part of the browser-automation skill.
verified: 2026-09-02
---

# Outlook (Web) Automation

Automate Outlook on the web (Microsoft 365 / Exchange) via `playwright-cli`.

## Setup

```bash
# Open Outlook (headed for login)
node .agents/skills/browser-automation/scripts/browser.js open "https://outlook.office.com/mail/" --headed

# User logs in manually (SSO/OAuth), then save state
node .agents/skills/browser-automation/scripts/browser.js save-state

# Next sessions: load state and go headless
node .agents/skills/browser-automation/scripts/browser.js open "https://outlook.office.com/mail/"
node .agents/skills/browser-automation/scripts/browser.js load-state
```

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster, more reliable, and don't depend on generated CSS classes or DOM structure that changes between updates.

**Must be enabled:** Settings → General → Accessibility → Keyboard shortcuts: ON (choose "Outlook" layout). Press `?` anytime to open the shortcuts help dialog and verify they're active.

### Compose / Reply

| Shortcut | Action |
|---|---|
| `N` | New message |
| `Ctrl+Enter` / `Alt+S` | Send |
| `R` / `Ctrl+R` | Reply |
| `Shift+R` / `Ctrl+Shift+R` | Reply all |
| `Shift+F` / `Ctrl+Shift+F` | Forward |
| `Ctrl+S` | Save draft |
| `Esc` | Discard draft / close |
| `Ctrl+K` | Insert hyperlink |

### Read mail

| Shortcut | Action |
|---|---|
| `O` / `Enter` / `Space` | Open message |
| `Shift+Enter` | Open in new window |
| `Ctrl+.` | Next message |
| `Ctrl+,` | Previous message |
| `.` | Next in reading pane |
| `,` | Previous in reading pane |
| `X` | Expand/collapse conversation |
| `Right` / `Left` | Expand / collapse |

### Mail actions

| Shortcut | Action |
|---|---|
| `E` | Archive |
| `Delete` | Delete |
| `Shift+Delete` | Delete permanently |
| `Q` / `Ctrl+Q` | Mark as read |
| `U` / `Ctrl+U` | Mark as unread |
| `Insert` | Flag / mark complete |
| `J` | Mark as junk |
| `V` | Move to folder |
| `C` | Categorize |
| `Ctrl+Delete` | Ignore conversation |
| `B` | Snooze |
| `Shift+E` | Create new folder |
| `Ctrl+Z` / `Alt+Backspace` | Undo |
| `Ctrl+P` | Print |
| `Ctrl+F` | Find text in message |
| `F9` | Sync mail |

### Go to

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+1` | Go to Mail |
| `Ctrl+Shift+2` | Go to Calendar |
| `G` then `I` | Go to Inbox |
| `G` then `D` | Go to Drafts |
| `G` then `S` | Go to Sent |
| `Alt+Q` | Search mail |
| `Alt+F1` | Toggle left pane |
| `Ctrl+Y` | Navigate to folder pane |
| `Alt+C` | Go to Copilot |
| `?` | Show keyboard shortcuts help |

### Message list

| Shortcut | Action |
|---|---|
| `Ctrl+Space` | Select/deselect message |
| `Ctrl+A` | Select all |
| `Home` / `Ctrl+Home` | First message |
| `End` / `Ctrl+End` | Last message |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste messages |

### Usage with playwright-cli

```bash
# Archive the currently open or selected email
node .agents/skills/browser-automation/scripts/browser.js exec press e

# Mark as read
node .agents/skills/browser-automation/scripts/browser.js exec press q

# Reply to current email
node .agents/skills/browser-automation/scripts/browser.js exec press r

# New message
node .agents/skills/browser-automation/scripts/browser.js exec press n

# Go to inbox (two-key shortcut with small delay)
node .agents/skills/browser-automation/scripts/browser.js exec press g
node .agents/skills/browser-automation/scripts/browser.js exec press i

# Search mail
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+q
```

**Note:** Two-key shortcuts (like `G` then `I`) require a small delay between keys.

## Reading inbox

### UI: list messages

Outlook Web uses `[role="option"]` for message list items. Classes are generated and unreliable.

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://outlook.office.com/mail/inbox"

# Wait for messages to load
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelectorAll('[role=\"option\"]').length > 0) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Extract message list
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const items = Array.from(document.querySelectorAll('[role=\"option\"]')).filter(o => o.offsetParent !== null);
  return JSON.stringify(items.slice(0, 20).map(o => ({
    aria: o.getAttribute('aria-label') || '',
    text: o.textContent.replace(/\s+/g, ' ').trim().substring(0, 120),
  })));
})()"
```

### UI: open a specific email

```bash
# Click by sender or subject text
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const items = Array.from(document.querySelectorAll('[role=\"option\"]')).filter(o => o.offsetParent !== null);
  const target = items.find(o => o.textContent.includes('OTC-7376'));
  if (target) { target.click(); return 'clicked'; }
  return 'not_found';
})()"
```

Or use keyboard: navigate with `Ctrl+.` / `Ctrl+,` then `Enter` to open.

### UI: read email content

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  await new Promise(r => setTimeout(r, 2000));
  const reader = document.querySelector('[role=\"document\"], [aria-label*=\"Cuerpo\"], [aria-label*=\"Body\"]');
  if (reader) return reader.innerText.substring(0, 3000);
  return document.body.innerText.substring(0, 3000);
})()"
```

## Archiving

### PREFERRED: keyboard shortcut

```bash
# Select email with Ctrl+Space, or have it open, then:
node .agents/skills/browser-automation/scripts/browser.js exec press e
```

### Fallback: button click

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const btn = Array.from(document.querySelectorAll('button')).find(b =>
    b.offsetParent !== null && b.getAttribute('aria-label')?.includes('Archivar')
  );
  if (btn) { btn.click(); return 'archived'; }
  return 'not_found';
})()"
```

## Folder navigation

### PREFERRED: keyboard shortcuts

```bash
# Go to inbox
node .agents/skills/browser-automation/scripts/browser.js exec press g
node .agents/skills/browser-automation/scripts/browser.js exec press i

# Go to sent
node .agents/skills/browser-automation/scripts/browser.js exec press g
node .agents/skills/browser-automation/scripts/browser.js exec press s

# Go to drafts
node .agents/skills/browser-automation/scripts/browser.js exec press g
node .agents/skills/browser-automation/scripts/browser.js exec press d
```

### Fallback: click folder in tree

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const folder = Array.from(document.querySelectorAll('[role=\"treeitem\"]')).find(f =>
    f.offsetParent !== null && f.textContent.includes('Mi Local Argentina')
  );
  if (folder) { folder.click(); return 'clicked'; }
  return 'not_found';
})()"
```

### Scroll in message list

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const scrollable = Array.from(document.querySelectorAll('*')).find(e =>
    e.scrollHeight > e.clientHeight && e.clientHeight > 200 &&
    e.offsetParent !== null && e.querySelector('[role=\"option\"]')
  );
  if (scrollable) { scrollable.scrollBy(0, 5000); return 'scrolled'; }
  return 'not_found';
})()"
```

## Composing emails

### Open compose

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press n
```

Or click the "Correo nuevo" / "New mail" button:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const btn = Array.from(document.querySelectorAll('button')).find(b =>
    b.offsetParent !== null && (b.textContent.includes('Correo nuevo') || b.textContent.includes('New mail'))
  );
  if (btn) { btn.click(); return 'clicked'; }
  return 'not_found';
})()"
```

### Fill compose fields

Outlook compose uses React-controlled inputs. Use the native value setter pattern.

```bash
# To (recipients)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const input = document.querySelector('input[aria-label=\"Para\"], input[aria-label=\"To\"]');
  if (!input) return 'not_found';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'recipient@example.com');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'set';
})()"

# Subject
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const input = document.querySelector('input[aria-label=\"Asunto\"], input[aria-label=\"Subject\"]');
  if (!input) return 'not_found';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'YOUR SUBJECT');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return 'set';
})()"
```

### Send email

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Enter
```

### Verify send

Wait for the compose dialog to close and the message to appear in Sent:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    const compose = document.querySelector('[role=\"dialog\"]');
    if (!compose) return 'sent';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

## Replying

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press r        # reply
node .agents/skills/browser-automation/scripts/browser.js exec press Shift+r  # reply all
```

The reply body is a contenteditable div. Fill it with:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const el = document.querySelector('div[contenteditable=\"true\"]');
  if (!el) return 'not_found';
  el.focus();
  el.innerText = 'YOUR REPLY TEXT';
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  return 'set';
})()"
```

## Search

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+q

# Then type the search query
node .agents/skills/browser-automation/scripts/browser.js exec type "from:juan subject:OTC"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

## Calendar

```bash
# Go to calendar
node .agents/skills/browser-automation/scripts/browser.js exec press Ctrl+Shift+2

# Create new event
node .agents/skills/browser-automation/scripts/browser.js exec press n

# Save appointment
node .agents/skills/browser-automation/scripts/browser.js exec press Ctrl+s

# Send meeting invite
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Enter
```

## Multiple accounts

Outlook Web supports multiple accounts. The URL may include the account index:
- `outlook.office.com/mail/` — default account
- `outlook.cloud.microsoft/mail/` — alternative domain (redirects to same UI)

## Anti-patterns

- **Don't** rely on CSS class names — Outlook uses generated classes; use `[role]` attributes and `aria-label`
- **Don't** send or delete emails without explicit user confirmation
- **Don't** archive emails without explicit user confirmation
