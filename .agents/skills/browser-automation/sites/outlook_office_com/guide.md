---
name: outlook
description: Automate Outlook on the web (Microsoft 365) with agent-browser. Covers reading inbox, archiving, replying, composing, searching, folder navigation, and keyboard shortcuts. Use when checking email, sending messages, managing inbox, or extracting email data in Outlook Web. Part of the browser-automation skill.
verified: 2026-09-02
domains:
  - outlook.office.com
  - outlook.live.com
  - outlook.com
  - outlook.office365.com
---

# Outlook (Web) Automation

Automate Outlook on the web (Microsoft 365 / Exchange) via `agent-browser`.

All commands go through the wrapper from the repo root:

```bash
node .agents/skills/browser-automation/scripts/browser.js <command>
```

## Interaction order (semantic-first)

1. **Keyboard shortcuts** -- Outlook has a rich shortcut layer. Use `exec press` / `exec batch` first.
2. **`exec find`** -- `find role|text|label <value> <action>` for buttons, links, options.
3. **`exec snapshot -i`** -- inspect the interactive tree, then `click`/`fill` by `@eN` ref.
4. **`exec eval`** -- LAST RESORT for list extraction and React-controlled inputs.

## Setup

```bash
# Open Outlook (headed for login)
node .agents/skills/browser-automation/scripts/browser.js open "https://outlook.office.com/mail/" --headed

# User logs in manually (SSO/OAuth). The session persists in .browser-profile/.

# Next sessions: headless reuse
node .agents/skills/browser-automation/scripts/browser.js open "https://outlook.office.com/mail/"
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

### Usage with agent-browser

`exec press` sends a single key or chord (`+` = simultaneous). For multi-key sequences (e.g. `G` then `I`), use `exec batch` so both keys go in one call:

```bash
# Archive the currently open or selected email
node .agents/skills/browser-automation/scripts/browser.js exec press e

# Mark as read
node .agents/skills/browser-automation/scripts/browser.js exec press q

# Reply to current email
node .agents/skills/browser-automation/scripts/browser.js exec press r

# New message
node .agents/skills/browser-automation/scripts/browser.js exec press n

# Go to inbox (two-key shortcut, one batch call)
node .agents/skills/browser-automation/scripts/browser.js exec batch "press g" "press i"

# Search mail
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+q
```

**Note:** Two-key shortcuts (like `G` then `I`) need a small delay between keys -- `exec batch` handles the sequencing in a single call.

## Reading inbox

### UI: list messages

Outlook Web uses `[role="option"]` for message list items. Classes are generated and unreliable.

```bash
node .agents/skills/browser-automation/scripts/browser.js navigate "https://outlook.office.com/mail/inbox"

# Wait for messages to load
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "document.querySelectorAll('[role=\"option\"]').length > 0"

# Extract message list (eval -- no semantic equivalent for bulk extraction)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const items = Array.from(document.querySelectorAll('[role=\"option\"]')).filter(o => o.offsetParent !== null);
  return JSON.stringify(items.slice(0, 20).map(o => ({
    aria: o.getAttribute('aria-label') || '',
    text: o.textContent.replace(/\s+/g, ' ').trim().substring(0, 120),
  })));
})()"
```

### UI: open a specific email

Prefer `find` by visible text (sender or subject):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find text "OTC-7376" click
```

Or use `snapshot -i` and click the matching `option` ref, or keyboard-navigate with `Ctrl+.` / `Ctrl+,` then `Enter` to open.

Fallback eval (only if `find` misses -- e.g. text split across nodes):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const items = Array.from(document.querySelectorAll('[role=\"option\"]')).filter(o => o.offsetParent !== null);
  const target = items.find(o => o.textContent.includes('OTC-7376'));
  if (target) { target.click(); return 'clicked'; }
  return 'not_found';
})()"
```

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

### Fallback: semantic click on the Archive button

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find label "Archivar" click
# or, if the UI is in English:
node .agents/skills/browser-automation/scripts/browser.js exec find label "Archive" click
```

## Folder navigation

### PREFERRED: keyboard shortcuts

```bash
# Go to inbox / sent / drafts (two-key sequences via batch)
node .agents/skills/browser-automation/scripts/browser.js exec batch "press g" "press i"
node .agents/skills/browser-automation/scripts/browser.js exec batch "press g" "press s"
node .agents/skills/browser-automation/scripts/browser.js exec batch "press g" "press d"
```

### Fallback: click folder in tree

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find role treeitem "Mi Local Argentina" click
```

If `find` misses (partial text, nested structure), fall back to eval:

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
node .agents/skills/browser-automation/scripts/browser.js exec find text "Correo nuevo" click
# or
node .agents/skills/browser-automation/scripts/browser.js exec find text "New mail" click
```

### Fill compose fields

Outlook compose uses React-controlled inputs. Try `snapshot -i` + `fill "@eN" "text"` first; if `fill` doesn't stick (React swallows it), use the native value setter via `exec eval`:

```bash
# To (recipients) -- eval fallback for React input (verified)
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

# Body -- focus the contenteditable and type
node .agents/skills/browser-automation/scripts/browser.js exec find role textbox click
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "Body text here"
```

### Verify BEFORE send

Always read back the compose box content before pressing the send shortcut. A blank or wrong message to a human is irreversible.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const el = document.querySelector('div[contenteditable=\"true\"]');
  return el ? el.innerText : 'no compose box';
})()"
```

Confirm To / Subject / Body match the intent, THEN send.

### Send email

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Enter
```

### Verify AFTER send

Wait for the compose dialog to close and the message to appear in Sent:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!document.querySelector('[role=\"dialog\"]')"
```

## Replying

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press r        # reply
node .agents/skills/browser-automation/scripts/browser.js exec press Shift+r  # reply all
```

The reply body is a contenteditable div. Prefer focusing it and typing:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find role textbox click
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "YOUR REPLY TEXT"
```

If typing doesn't register (React contenteditable), fall back to eval:

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

**Verify BEFORE send** (see above), then `exec press Control+Enter`.

## Search

```bash
# PREFERRED: keyboard shortcut
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+q

# Then type the query into the focused search box and submit
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "from:juan subject:OTC"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

If focus doesn't land in the search box, use `snapshot -i` to get the ref and `fill "@eN" "query"`.

## Calendar

```bash
# Go to calendar
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Shift+2

# Create new event
node .agents/skills/browser-automation/scripts/browser.js exec press n

# Save appointment
node .agents/skills/browser-automation/scripts/browser.js exec press Control+s

# Send meeting invite
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Enter
```

For pre-filling events, prefer the deeplink in `calendar-deeplink.md` -- it skips most of this UI.

## Multiple accounts

Outlook Web supports multiple accounts. The URL may include the account index:
- `outlook.office.com/mail/` -- default account
- `outlook.cloud.microsoft/mail/` -- alternative domain (redirects to same UI)

## Anti-patterns

- **Don't** rely on CSS class names -- Outlook uses generated classes; use `[role]` attributes and `aria-label`
- **Don't** send or delete emails without explicit user confirmation
- **Don't** archive emails without explicit user confirmation
- **Don't** press send shortcuts blind -- always read back the compose box first

## agent-browser notes (verified 2026-10-24)

- `save-state`/`load-state` do not exist in the wrapper -- the session persists automatically in `.browser-profile/`.
- Federated Microsoft session: outlook.office.com → adfscl.cencosud.com. If `location.host` is `adfscl.cencosud.com`, the session expired → ask for manual login in `--headed`.
- `exec keyboard type` needs a focused element -- focus via `find`/`click` on a snapshot ref first; if it fails, use `exec fill "@eN" "text"`.
- Final URL after login: `outlook.cloud.microsoft`, not outlook.office.com.
