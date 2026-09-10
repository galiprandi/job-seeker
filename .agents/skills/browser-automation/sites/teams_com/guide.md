---
name: teams
description: Send and delete messages in Microsoft Teams web via keyboard automation. Markdown supported.
verified: 2026-09-03
---

# Microsoft Teams Web Automation

Send and delete messages in Teams via keyboard automation. Teams web supports Markdown in the compose box. No API token extraction needed.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Helper script:** For long or multiline messages, use `scripts/teams.js` (see [scripts/README.md](../scripts/README.md)). For short messages, use the manual commands below.

## Send message (keyboard method)

### Short messages (single line)

```bash
# 1. Navigate to the chat
node scripts/browser.js goto "https://teams.microsoft.com/v2/chat/<chatId>"

# 2. Wait for textbox to appear (Teams takes 5-10s to render)
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 20; i++) {
    if (document.querySelector('div[role=textbox]')) return 'ready';
    await new Promise(r => setTimeout(r, 500));
  }
  return 'timeout';
})()"

# 3. Focus the textbox
node scripts/browser.js exec eval "document.querySelector('div[role=textbox]').focus()"

# 4. Type the message
node scripts/browser.js exec type -- "your message here"

# 5. Send with Meta+Enter (Cmd+Enter on macOS)
node scripts/browser.js exec press "Meta+Enter"
```

### Multiline messages (manual)

Type each line separately with `Shift+Enter` between lines:

```bash
node scripts/browser.js exec type -- "First line"
node scripts/browser.js exec press "Shift+Enter"
node scripts/browser.js exec type -- "Second line"
node scripts/browser.js exec press "Meta+Enter"
```

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
# 1. Find the message and focus it
node scripts/browser.js exec eval "(function(){
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
node scripts/browser.js exec press "Shift+F10"

# 3. Click the Delete menu item
node scripts/browser.js exec eval "document.querySelector('[data-tid=\"message-actions-delete\"]').click()"
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

Teams v2 does not reliably navigate via URL (`goto` may open the wrong chat). Use the search box instead.

```bash
# 1. Escape to close any open modal/dropdown
node scripts/browser.js exec press "Escape"

# 2. Focus and clear the search box
node scripts/browser.js exec eval "(function(){
  const s = document.getElementById('ms-searchux-input');
  if (!s) return 'no search input';
  s.focus();
  s.value = '';
  s.dispatchEvent(new Event('input', {bubbles: true}));
  return 'cleared';
})()"

# 3. Type the chat name
node scripts/browser.js exec type -- "chat name here"

# 4. Poll for search results to appear
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 15; i++) {
    const list = document.querySelector('[data-tid=\"search-results-list\"], [role=\"listbox\"], [data-tid*=\"autosuggest\"]');
    if (list && list.innerText.trim().length > 10) return 'ok';
    await new Promise(x => setTimeout(x, 200));
  }
  return 'timeout';
})()"

# 5. Click the TOPHITS option that matches the chat name
node scripts/browser.js exec eval "(function(){
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
node scripts/browser.js exec eval "(function(){
  const t = document.title;
  if (t.includes('expected chat name')) return 'ok: ' + t;
  return 'WRONG: ' + t;
})()"
```

**Important:** Always validate `document.title` before sending a message. The URL may show a different chatId than the one actually active.

### Read chat messages

```bash
node scripts/browser.js exec eval "(function(){
  const text = document.body.innerText;
  const idx = text.indexOf('Message List');
  if (idx !== -1) return text.substring(idx, idx + 4000);
  return 'no messages found';
})()"
```

## Setup

```bash
# Open Teams (headed for first login)
node scripts/browser.js open "https://teams.microsoft.com" --headed

# User logs in manually, then close and reopen
node scripts/browser.js close
node scripts/browser.js open "https://teams.microsoft.com"
```

Session persists in the browser profile. Re-login needed every ~30 days.

## What does NOT work (validated empirically)

- **`Enter` to send:** Enter is a newline in Teams v2. Use `Meta+Enter`.
- **HTML tags via keyboard:** `<a href="...">` is typed as literal text. Use Markdown instead.
- **`execCommand insertText`:** Teams uses Trusted Types policy, blocks it.
- **Clipboard paste (Ctrl+V):** Pastes previous clipboard content, not what you set.
- **`Meta+V` for multiline:** `\n` becomes literal `\\n` text.
- **`keyboard.type` with `\n`:** Newlines are interpreted as Enter (newline), not as send. Use line-by-line typing with `Shift+Enter`.
- **chatsvc API:** Teams v2 encrypts tokens in localStorage. Token extraction returns encrypted blobs that 401.

## Anti-patterns

- **Don't** use `Enter` to send — use `Meta+Enter`
- **Don't** type HTML tags — use Markdown
- **Don't** use clipboard paste — type line by line with `Shift+Enter`
- **Don't** use `execCommand` — blocked by Trusted Types
- **Don't** try to log in programmatically — open headed and let the user log in
