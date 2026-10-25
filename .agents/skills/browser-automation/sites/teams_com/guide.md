---
name: teams
description: Send and delete messages in Microsoft Teams web via keyboard automation. Markdown supported.
verified: 2026-09-03
domains:
  - teams.microsoft.com
  - teams.live.com
---

# Microsoft Teams Web Automation

Send and delete messages in Teams via keyboard automation. Teams web supports Markdown in the compose box. No API token extraction needed.

All commands go through the wrapper from the repo root:

```bash
node .agents/skills/browser-automation/scripts/browser.js <command>
```

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Helper script:** For long or multiline messages, use `scripts/teams.js` (see [scripts/README.md](../scripts/README.md)). For short messages, use the manual commands below.

## Interaction order (semantic-first)

1. **Keyboard shortcuts** -- `exec press` / `exec batch` (send, new line, context menu).
2. **`exec find`** -- `find role|text|label <value> <action>` for textbox, menu items.
3. **`exec snapshot -i`** -- inspect refs, then `click`/`fill` by `@eN`.
4. **`exec eval`** -- LAST RESORT for waits, focus, and message-list extraction.

## Send message (keyboard method)

### Short messages (single line)

```bash
# 1. Navigate to the chat
node .agents/skills/browser-automation/scripts/browser.js navigate "https://teams.microsoft.com/v2/chat/<chatId>"

# 2. Wait for the textbox to appear (Teams takes 5-10s to render)
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('div[role=textbox]')"

# 3. Focus the textbox
node .agents/skills/browser-automation/scripts/browser.js exec find role textbox click

# 4. Type the message into the focused element
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "your message here"

# 5. VERIFY BEFORE SEND: read the compose box back
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('div[role=textbox]').innerText"

# 6. Send with Meta+Enter (Cmd+Enter on macOS)
node .agents/skills/browser-automation/scripts/browser.js exec press "Meta+Enter"
```

**Verify BEFORE send:** always read back the compose box content before the send keystroke. A blank or wrong message to a human is irreversible.

### Multiline messages (manual)

Type each line separately with `Shift+Enter` between lines. `exec batch` sends the whole sequence in one call:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec batch \
  "keyboard type First line" \
  "press Shift+Enter" \
  "keyboard type Second line"
# verify the compose box, then:
node .agents/skills/browser-automation/scripts/browser.js exec press "Meta+Enter"
```

If `keyboard type` needs a target, get the textbox ref via `exec snapshot -i` and use `exec fill "@eN" "text"` per line instead.

### Multiline messages (helper script)

For long messages, use the helper script. It handles the line-by-line loop automatically:

```bash
# Via heredoc
node scripts/teams.js send <chatId> << 'EOF'
📊 Triage report

46 tickets · 27 overdue

[#1234](https://example.com/tickets/1234)
EOF

# Via pipe from a file
cat /tmp/report.md | node scripts/teams.js send <chatId>
```

See [scripts/README.md](../scripts/README.md) for full documentation.

### Critical keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Meta+Enter` | **Send message** |
| `Shift+Enter` | New line (does NOT send) |
| `Enter` | New line in contenteditable (does NOT send) |
| `Meta+a` | Select all in compose box |
| `Delete` | Delete selection |

**Common mistake:** pressing `Enter` to send. In Teams v2, `Enter` is a newline. Use `Meta+Enter` to send.

## Delete message (keyboard method)

```bash
# 1. Find the message and focus it (eval -- no semantic equivalent for TreeWalker search)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.includes('text of the message')) {
      let el = node.parentElement;
      while (el && el.getAttribute('data-tid') !== 'chat-pane-message') el = el.parentElement;
      if (el) { el.setAttribute('tabindex', '0'); el.focus(); return 'focused'; }
    }
  }
  return 'not found';
})()"

# 2. Open context menu with Shift+F10
node .agents/skills/browser-automation/scripts/browser.js exec press "Shift+F10"

# 3. Click the Delete menu item
node .agents/skills/browser-automation/scripts/browser.js exec find role menuitem "Delete" click
# Fallback selector (verified 2026-09-03):
# exec eval "document.querySelector('[data-tid=\"message-actions-delete\"]').click()"
```

No confirmation dialog appears for own messages. The message is soft-deleted immediately with an "Undo" option.

## Markdown support

Teams web parses Markdown in the compose box. Use Markdown instead of HTML tags (HTML is typed as literal text via keyboard).

| Format | Markdown | Result |
|---|---|---|
| Link with text | `[#1234](https://example.com)` | Clickable link showing `#1234` |
| Bold | `**text**` | **text** |
| Italic | `*text*` | *text* |
| Strikethrough | `~~text~~` | ~~text~~ |
| Inline code | `` `code` `` | `code` |
| Heading | `# H1`, `## H2`, `### H3` | Rendered as headings |
| Bullet list | `- item` | Bullet list |
| Numbered list | `1. item` | Numbered list |
| Blockquote | `> quote` | Blockquote |
| Link (no text) | `https://example.com` | Auto-linked URL |

**Important:** Markdown link syntax must not have spaces inside the parentheses:
- Works: `[#1234](https://example.com)`
- Does NOT work: `[#1234]( https://example.com )`

## chatId formats

| Chat type | Format | Example |
|---|---|---|
| Personal notes | `48:notes` | `48:notes` |
| Meeting chat | `19:meeting_xxx@thread.v2` | `19:meeting_NDQ2Nz...@thread.v2` |
| 1:1 chat | `19:*@unq.gbl.spaces` | `19:8:orgid:xxx@unq.gbl.spaces` |
| Group chat | `19:*@thread.v2` | `19:xxx_yyy@thread.v2` |

URL format: `https://teams.microsoft.com/v2/chat/<chatId>`

**Finding the chatId:** look in the DOM for elements with `id` containing `19:`. Alternatively, capture it from the URL bar when you open a chat in Teams web.

## Navigating chats

### Open a specific chat by name (search method)

Teams v2 does not reliably navigate via URL (`navigate` may open the wrong chat). Use the search box instead.

```bash
# 1. Escape to close any open modal/dropdown
node .agents/skills/browser-automation/scripts/browser.js exec press "Escape"

# 2. Focus the search box (id verified 2026-09-03)
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.getElementById('ms-searchux-input').focus()"

# 3. Type the chat name
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "chat name here"

# 4. Wait for search results
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "(function(){ const l = document.querySelector('[data-tid=\"search-results-list\"], [role=\"listbox\"], [data-tid*=\"autosuggest\"]'); return l && l.innerText.trim().length > 10; })()"

# 5. Click the TOPHITS option that matches the chat name.
# Prefer snapshot -i to get the option ref, then exec click "@eN".
# Fallback eval (verified 2026-09-03):
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const options = document.querySelectorAll('[role=\"option\"]');
  for (const opt of options) {
    if (opt.offsetParent !== null && opt.innerText.includes('CHAT NAME HERE') && opt.getAttribute('data-tid') && opt.getAttribute('data-tid').includes('TOPHITS')) {
      opt.click();
      return 'clicked';
    }
  }
  return 'not found';
})()"

# 6. Validate the correct chat is active (check document.title)
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.title"
```

**Important:** Always validate `document.title` before sending a message. The URL may show a different chatId than the one actually active.

### Read chat messages

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const text = document.body.innerText;
  const idx = text.indexOf('Message List');
  if (idx !== -1) return text.substring(idx, idx + 4000);
  return 'no messages found';
})()"
```

## Setup

```bash
# Open Teams (headed for first login)
node .agents/skills/browser-automation/scripts/browser.js open "https://teams.microsoft.com" --headed

# User logs in manually, then close and reopen
node .agents/skills/browser-automation/scripts/browser.js close
node .agents/skills/browser-automation/scripts/browser.js open "https://teams.microsoft.com"
```

Session persists in `.browser-profile/`. Re-login needed every ~30 days.

## What does NOT work (validated empirically)

- **`Enter` to send:** Enter is a newline in Teams v2. Use `Meta+Enter`.
- **HTML tags via keyboard:** `<a href="...">` is typed as literal text. Use Markdown instead.
- **`execCommand insertText`:** Teams uses Trusted Types policy, blocks it.
- **Clipboard paste (Ctrl+V):** Pastes previous clipboard content, not what you set.
- **`Meta+V` for multiline:** `\n` becomes literal `\n` text.
- **`keyboard type` with `\n`:** Newlines are interpreted as Enter (newline), not as send. Use line-by-line typing with `Shift+Enter` (via `exec batch`).
- **chatsvc API:** Teams v2 encrypts tokens in localStorage. Token extraction returns encrypted blobs that 401.

## Anti-patterns

- **Don't** use `Enter` to send -- use `Meta+Enter`
- **Don't** send blind -- always read back the compose box before `Meta+Enter`
- **Don't** type HTML tags -- use Markdown
- **Don't** use clipboard paste -- type line by line with `Shift+Enter`
- **Don't** use `execCommand` -- blocked by Trusted Types
- **Don't** try to log in programmatically -- open headed and let the user log in

## agent-browser notes (verified 2026-10-24)

- Expired-session detection: if `location.hostname` includes `adfs` or `login` (e.g. `adfscl.cencosud.com`, title "Iniciar sesión") the session is dead; ask for manual re-login in `--headed`. Cencosud realm: `cencosud\<network user>`.
- `navigate` to Teams needs ~10s before any eval (heavy landing page).
- `exec` runs from the repo cwd -- always use the full path `.agents/skills/browser-automation/scripts/browser.js`, never `cd` into `scripts/`.
- `exec keyboard type` types into the currently focused element; if it fails with "Element not found", focus via `find`/`click` on a snapshot ref first.
- teams.live.com (personal) is not covered: no validated session.
