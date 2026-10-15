---
name: facebook
description: Automate Facebook groups for post scraping, member directory extraction, and content monitoring.
verified: 2026-09-02
---

# Facebook Groups Automation Guide

## Setup

### Open Facebook

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.facebook.com/"
```

Wait 5-8 seconds for the feed to load. Facebook is a SPA that hydrates progressively.

### Login

Facebook requires manual login (email + password + possible 2FA). If the session is expired, open in headed mode:

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://www.facebook.com/" --headed
```

The session persists in `.browser-profile`. Do NOT attempt to log in programmatically with user credentials.

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster, more reliable, and don't depend on generated CSS classes that change between updates.

**Show all shortcuts:** `Shift+?` or `F1` — opens `dialog "Todos los métodos abreviados de teclado de Facebook"`.

**Important:** Single-character shortcuts (`j`, `k`, `l`, `c`, `p`, `s`, `o`, `q`, `r`, `f`, `x`, `e`) are **disabled by default**. They require enabling "Métodos abreviados de un solo carácter" in the shortcuts dialog (there's a switch at the bottom). Shortcuts with modifiers (Alt, Ctrl, Shift) work without enabling this setting.

### Global

| Shortcut | Action |
|---|---|
| `Shift+?` or `F1` | Show keyboard shortcuts dialog |
| `Ctrl+B` | Report a problem |
| `/` | Search Facebook (requires single-char enabled) |

### Chat / Messenger

| Shortcut | Action |
|---|---|
| `Alt+Ctrl+W` | Write message in current chat |
| `Alt+Ctrl+C` | Go to chat list |
| `Ctrl+Shift+M` | Go to current chat messages |
| `Alt+Down` | Next chat |
| `Alt+Up` | Previous chat |
| `Alt+Ctrl+N` | New chat |
| `Alt+Ctrl+S` | Search Messenger |
| `l` | React to message (single-char) |
| `r` | Reply to message (single-char) |
| `f` | Forward message (single-char) |
| `x` | Delete message (single-char) |

### Feed

| Shortcut | Action |
|---|---|
| `Enter` | See more of selected story |
| `c` | Comment (single-char) |
| `j` | Next post (single-char) |
| `k` | Previous post (single-char) |
| `l` | Like/unlike (single-char) |
| `o` | Open attachment (single-char) |
| `p` | New post (single-char) |
| `q` | Search Messenger contacts (single-char) |
| `s` | Share post (single-char) |

### Photo albums

| Shortcut | Action |
|---|---|
| `f` | Toggle fullscreen (single-char) |
| `j` | Previous photo (single-char) |
| `k` | Next photo (single-char) |
| `l` | Like photo (single-char) |

### Communities / Groups

| Shortcut | Action |
|---|---|
| `Alt+Left` | Previous video |
| `Alt+Right` | Next video |
| `Alt+Up` | Previous pinned group |
| `Alt+Down` | Next pinned group |
| `Ctrl+/` | Search communities |
| `e` | Create event (single-char) |

### Usage with the wrapper

```bash
# Show keyboard shortcuts
node .agents/skills/browser-automation/scripts/browser.js exec press Shift+?

# New chat
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+Control+n

# Search Messenger
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+Control+s

# Next/previous chat
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+ArrowDown
node .agents/skills/browser-automation/scripts/browser.js exec press Alt+ArrowUp

# Search communities
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Slash
```

### Enabling single-character shortcuts

Single-character shortcuts are disabled by default. To enable:

1. Open the shortcuts dialog (`Shift+?`)
2. Find the switch "Métodos abreviados de un solo carácter" at the bottom
3. Toggle it on

```bash
# Open shortcuts dialog
node .agents/skills/browser-automation/scripts/browser.js exec press Shift+?
# The switch is at the bottom of the dialog — click it via snapshot ref
```

## Detecting modals

Facebook uses `dialog` role for the shortcuts panel:

| Modal | Snapshot pattern |
|---|---|
| Keyboard shortcuts (`Shift+?`) | `dialog "Todos los métodos abreviados de teclado de Facebook"` |

```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot | grep "dialog"
```

## Core flows

### Open a group

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.facebook.com/groups/<GROUP_ID>"
```

Wait 6-8 seconds for the group feed to load.

### Check group status

**Problem:** Groups can be paused by admins. A paused group shows a banner like:

> "Este grupo se pausó temporalmente por X días. Un administrador pausó este grupo el DD de mes de YYYY. Se reanudará el DD de mes de YYYY."

**Solution:** Before scraping posts, check `document.body.innerText` for "pausó" or "reanudará". If paused, skip scraping and note the resume date.

```javascript
async () => {
  const text = document.body.innerText;
  const paused = text.includes('pausó') || text.includes('reanudará');
  return JSON.stringify({paused, snippet: text.substring(0, 500)});
}
```

### Sort posts by recency

By default, Facebook shows "Más relevantes" (algorithmic sort). To see recent posts:

1. Click the sort button: `button "ordenar feed del grupo por Más relevantes"`
2. Select "Publicaciones nuevas": `menuitemradio "Publicaciones nuevas"`

**Preferred (using `find` — more robust than parsing snapshot text):**

```bash
# Find the sort button by text
node .agents/skills/browser-automation/scripts/browser.js exec find "ordenar feed del grupo por"
# Click the ref returned by find
node .agents/skills/browser-automation/scripts/browser.js exec click <sort_ref>
# Wait for the dropdown, then find the recency option
node .agents/skills/browser-automation/scripts/browser.js exec find "Publicaciones nuevas"
node .agents/skills/browser-automation/scripts/browser.js exec click <recent_ref>
```

**Alternative (fragile — relies on `sed` parsing of snapshot output, breaks if ref format changes):**

```bash
SORT_REF=$(node .agents/skills/browser-automation/scripts/browser.js exec snapshot 2>/dev/null | grep 'ordenar feed del grupo por' | sed 's/.*\[ref=\(f[0-9a-f]*\)\].*/\1/')
node .agents/skills/browser-automation/scripts/browser.js exec click $SORT_REF
sleep 2
RECENT_REF=$(node .agents/skills/browser-automation/scripts/browser.js exec snapshot 2>/dev/null | grep "Publicaciones nuevas" | sed 's/.*\[ref=\(f[0-9a-f]*\)\].*/\1/')
node .agents/skills/browser-automation/scripts/browser.js exec click $RECENT_REF
```

### Extract posts

Facebook does not use stable `data-testid` attributes for posts. Use `[role="article"]` or text-based extraction:

```javascript
async () => {
  const all = document.body.innerText;
  const lines = all.split('\n').filter(l =>
    l.length > 25 &&
    !l.includes('Facebook') &&
    !l.includes('Escribe') &&
    !l.includes('comentario') &&
    !l.includes('Cualquier') &&
    !l.includes('Grupo de')
  );
  return JSON.stringify(lines.slice(0, 40));
}
```

### Scroll to load more posts

Facebook lazy-loads posts. Scroll gradually to trigger loading:

```javascript
async () => {
  window.scrollBy(0, 2000);
  return 'scrolled';
}
```

Wait 3-4 seconds after each scroll for new posts to render. Repeat as needed.

**Gotcha:** Facebook may load unrelated content (spam, religious posts, ads) in mixed groups. Filter by keywords relevant to your search.

### Extract post author and content

Posts appear as: `<Author Name>` followed by the post text. Parse consecutive lines:

```javascript
async () => {
  const lines = document.body.innerText.split('\n');
  const posts = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('<KEYWORD>')) {
      const author = lines[i-1] || '';
      posts.push({author, content: l.substring(0, 200)});
    }
  }
  return JSON.stringify(posts);
}
```

## Gotchas and anti-patterns

### Groups can be paused

**Problem:** Admins can pause groups for any duration. A paused group shows no new posts and has a banner explaining the pause.

**Solution:** Check for pause banners before scraping. Note the resume date and return later.

### Heavy spam in open groups

**Problem:** Public groups with no moderation fill with spam (religious posts, unrelated ads, motivational content). Relevant posts are buried.

**Solution:** Use keyword filtering on extracted text. Do not assume every `role="article"` is a relevant post. Filter by topic-specific keywords.

### DOM changes frequently

**Problem:** Facebook updates its DOM structure frequently. Selectors like `[data-testid="feed-post-container"]` may work one day and fail the next.

**Solution:** Prefer `document.body.innerText` text extraction over DOM selectors. Parse text content with string matching. This is more resilient to DOM changes.

### Multiple tabs accumulate

**Problem:** Navigating to Facebook groups often opens new tabs (e.g. group search results, suggested groups). These accumulate and consume memory.

**Solution:** Periodically check open tabs and close unnecessary ones. Focus on the target group tab.

### Scroll does not always load more

**Problem:** Sometimes scrolling does not trigger lazy loading. The page appears stuck.

**Solution:** Try scrolling in smaller increments (500-1000px). Wait longer between scrolls (4-5 seconds). If still stuck, the group may have no more posts to load.

## Validation

**Validated:** 2026-08-21 against live Facebook Groups.
