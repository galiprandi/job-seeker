---
name: reddit
description: Automate Reddit with playwright-cli. Covers navigating posts, reading comments, posting top-level submissions, replying to comments, posting in megathreads, and extracting post/comment data. Use when checking post status, responding to comments, or submitting to subreddits.
---

# Reddit Automation

Automate Reddit via `playwright-cli` using a mix of UI interactions, eval-based content extraction, and direct DOM manipulation for posting.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

## Setup

```bash
# Open Reddit — ALWAYS headed (headless triggers 403 bot detection, see below)
node scripts/browser.js open "https://www.reddit.com" --headed

# If login needed: user logs in manually, then save state
node scripts/browser.js save-state
node scripts/browser.js close

# Next sessions: reopen headed and load state
node scripts/browser.js open "https://www.reddit.com" --headed
node scripts/browser.js load-state
```

## Critical: Reddit access patterns (validated empirically 2026-08-13)

### What works

- **Headed browser**: `node scripts/browser.js open "https://www.reddit.com/..." --headed` works consistently. Subreddit feeds, post pages, user profiles, comment sections, submit pages — all load fully. Reading, clicking, filling editors, submitting comments — all work.
- **eval-based content extraction**: `document.body.innerText`, `document.querySelectorAll()` all work normally in headed mode.
- **Reading posts and comments**: Full access to post text, comment text, author names, timestamps.
- **Replying to comments and posting in megathreads**: Works via contenteditable editor (see below).
- **Navigating user profiles**: `https://www.reddit.com/user/<username>/` and `/submitted/` and `/comments/` all work in headed mode.

### What does NOT work

- **curl/HTTP requests to Reddit JSON API**: `curl https://www.reddit.com/r/<sub>/comments/<id>.json` returns HTTP 403. Reddit blocks non-browser User-Agents on all HTTP endpoints (.json, .rss, profile pages, subreddit pages). Always 403, never returns data.
- **curl to RSS feeds**: `curl https://www.reddit.com/...rss` returns HTTP 403. Same block as JSON.
- **Headless browser**: `node scripts/browser.js open "https://www.reddit.com/..." --headless` is unreliable. Reddit detects the headless browser and returns 403 "You've been blocked by network security". This can happen on the first navigation or after a few successful ones. Once the 403 triggers, the entire session is poisoned — all subsequent navigations to any Reddit URL also return 403. The only fix is `close --force` and reopen `--headed`.

### Key takeaway

**Always use `--headed` for Reddit.** Headless mode triggers Reddit's bot detection and results in 403 blocks that poison the entire session. If you get 403 in the browser, `close --force` and reopen with `--headed`. Do NOT retry in headless — it will keep failing.

**Do NOT use curl for Reddit.** All HTTP endpoints return 403 for non-browser User-Agents. Use the browser instead.

## Reading posts and comments

### Extract post content and comments (PREFERRED: eval)

```bash
# Navigate to post
node scripts/browser.js goto "https://www.reddit.com/r/<sub>/comments/<id>/"

# Wait for load
node scripts/browser.js exec eval "(async function(){ for (let i = 0; i < 50; i++) { if (document.body.innerText.length > 500) return 'ready'; await new Promise(r => setTimeout(r, 200)); } return 'timeout'; })()"

# Extract full page text (includes post body + all visible comments)
node scripts/browser.js exec eval "() => document.body.innerText.substring(0, 5000)"

# Extract more if needed
node scripts/browser.js exec eval "() => document.body.innerText.substring(5000, 10000)"
```

### Extract structured comment data

```bash
node scripts/browser.js exec eval "(function(){
  const text = document.body.innerText;
  const idx = text.indexOf('Sección de comentarios');
  if (idx === -1) {
    // Try English
    const enIdx = text.indexOf('Comment section');
    return text.substring(enIdx !== -1 ? enIdx : 0, (enIdx !== -1 ? enIdx : 0) + 5000);
  }
  return text.substring(idx, idx + 5000);
})()"
```

### Check if a post was removed by moderators

Posts removed by mods show one of these phrases in `document.body.innerText`:

- Spanish: `"Lo sentimos, esta publicación ha sido retirada por los moderadores"`
- English: `"Sorry, this post has been removed by the moderators"`
- Also: `"Publicación bloqueada. No se pueden publicar nuevos comentarios."` (post locked, no new comments)

```bash
node scripts/browser.js exec eval "() => {
  const t = document.body.innerText;
  if (t.includes('retirada por los moderadores') || t.includes('removed by the moderators')) return 'removed';
  if (t.includes('Publicación bloqueada') || t.includes('post has been locked')) return 'locked';
  return 'active';
}()"
```

### Find all posts by a user

```bash
node scripts/browser.js goto "https://www.reddit.com/user/<username>/submitted/"
node scripts/browser.js exec eval "(function(){
  const links = Array.from(document.querySelectorAll('a[href*=\"/comments/\"]'));
  return links.map(a => a.href).filter((v,i,arr) => arr.indexOf(v) === i).slice(0, 20);
})()"
```

### Read a specific comment by URL

```bash
node scripts/browser.js goto "https://www.reddit.com/r/<sub>/comments/<post_id>/comment/<comment_id>/"
node scripts/browser.js exec eval "() => document.body.innerText.substring(0, 3000)"
```

## Posting a top-level submission

### Navigate to submit page

```bash
node scripts/browser.js goto "https://www.reddit.com/r/<subreddit>/submit/"
```

### Fill title and body

Reddit's new UI uses a rich-text editor. The title is an input, the body is a contenteditable div.

```bash
# Wait for editor to load
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    const inputs = document.querySelectorAll('input, textarea, div[contenteditable=true]');
    if (inputs.length > 0) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Fill title (find the title input - it's usually the first visible text input)
node scripts/browser.js exec eval "(function(){
  const inputs = document.querySelectorAll('input[type=\"text\"], input:not([type])');
  for (const inp of inputs) {
    const r = inp.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(inp, 'YOUR TITLE HERE');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return 'title_set';
    }
  }
  return 'title_not_found';
})()"

# Fill body (contenteditable div)
node scripts/browser.js exec eval "(async function(){
  const all = document.querySelectorAll('div[contenteditable=true]');
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      e.focus();
      e.innerText = '';
      document.execCommand('insertText', false, 'YOUR BODY TEXT HERE');
      return 'body_set';
    }
  }
  return 'no_editor_visible';
})()"
```

### Submit the post

```bash
# Find and click the submit button
node scripts/browser.js exec eval "(function(){
  const btns = document.querySelectorAll('button, div[role=button]');
  for (const b of btns) {
    const t = b.textContent.trim().toLowerCase();
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (t === 'publicar' || t === 'post' || t === 'submit' || t === 'enviar')) {
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return 'submitted';
    }
  }
  return 'not_found';
})()"
```

## Replying to comments and posting in megathreads

This is the most reliable pattern, validated empirically. Reddit's comment editor is a `div[contenteditable=true]` that appears after clicking a "Responder" (Spanish) or "Reply" (English) button.

### Step 1: Click "Responder" to open the comment editor

```bash
# Scroll to where the comment section starts
node scripts/browser.js exec eval "(async function(){
  window.scrollTo(0, 800);
  await new Promise(r => setTimeout(r, 500));
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    const t = b.textContent.trim();
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (t === 'Responder' || t === 'Reply')) {
      b.click();
      return 'clicked';
    }
  }
  return 'not_found';
})()"
```

### Step 2: Wait for the contenteditable editor to appear

```bash
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 25; i++) {
    const all = document.querySelectorAll('div[contenteditable=true]');
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return 'editor_ready';
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### Step 3: Fill the comment text

Use `document.execCommand('insertText', ...)` — this is the reliable method for Reddit's contenteditable. Do NOT use `innerText =` alone (React state doesn't update). Do NOT use `fill` (it's not a textarea).

```bash
node scripts/browser.js exec eval "(async function(){
  const all = document.querySelectorAll('div[contenteditable=true]');
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      e.focus();
      e.innerText = '';
      const text = 'YOUR COMMENT TEXT HERE.\\n\\nMultiple paragraphs work with \\\\n.';
      document.execCommand('insertText', false, text);
      return 'filled';
    }
  }
  return 'no_editor_visible';
})()"
```

### Step 4: Click "Comentar" / "Comment" to submit

```bash
node scripts/browser.js exec eval "(function(){
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    const t = b.textContent.trim();
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (t === 'Comentar' || t === 'Comment')) {
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return 'clicked';
    }
  }
  return 'not_found';
})()"
```

### Step 5: Verify the comment was posted

```bash
# Wait and check if the editor closed (indicates success)
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 15; i++) {
    const all = document.querySelectorAll('div[contenteditable=true]');
    let visible = false;
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) visible = true;
    }
    if (!visible) return 'editor_closed_success';
    await new Promise(r => setTimeout(r, 500));
  }
  return 'editor_still_open';
})()"
```

## Megathread posting

Posting in megathreads (e.g. "Built with Claude Project Showcase Megathread", "Weekly Showcase Thread") follows the same pattern as replying to comments. The megathread is a post, and you reply to it as a top-level comment.

### Finding the megathread URL

```bash
# Search for the megathread in a subreddit
node scripts/browser.js goto "https://www.reddit.com/r/<subreddit>/search/?q=showcase+megathread&sort=new&restrict_sr=on"
node scripts/browser.js exec eval "(function(){
  const links = Array.from(document.querySelectorAll('a[href*=\"/comments/\"]'));
  return links.map(a => ({text: a.innerText.substring(0, 80), href: a.href})).filter(l => l.text.length > 10).slice(0, 10);
})()"
```

### Post in the megathread

Navigate to the megathread URL, then follow the "Replying to comments" pattern above. The "Responder" button on the megathread post opens a top-level comment editor.

## Reddit UI language detection

Reddit's UI language depends on the browser profile and account settings. Key button labels:

| English | Spanish |
|---|---|
| Reply | Responder |
| Comment | Comentar |
| Post | Publicar |
| Submit | Enviar |
| Cancel | Cancelar |
| Share | Compartir |
| Comment section | Sección de comentarios |

Always check for both languages when searching for buttons by text.

## Common subreddit moderation patterns

### Post removal by moderators

Many subreddits have automated moderation bots (AutoModerator, ClaudeAI-mod-bot) that remove promotional posts and leave a comment explaining why. Common patterns:

- **Redirect to megathread**: "Please repost this in the Weekly Showcase Thread" or "Please submit your project as a comment in the Megathread"
- **Karma requirement**: "Sorry, you do not meet the minimum sitewide comment karma requirement of N to post a submission"
- **Rule violation**: "Promotional or advertising threads are only allowed in the monthly stickied threads"

### What to do when a post is removed

1. **Do NOT repost the same content** in the subreddit feed — it will be removed again.
2. **DO post in the megathread** the mod bot redirected you to. This is the sanctioned location.
3. **Check subreddit rules** before posting: navigate to `https://www.reddit.com/r/<sub>/about/rules/` or look for a rules sidebar.

## Extracting comment authors and timestamps

```bash
node scripts/browser.js exec eval "(function(){
  const comments = document.querySelectorAll('[data-testid=\"comment\"], shreddit-comment');
  if (comments.length === 0) {
    // Fallback: parse from body text
    const text = document.body.innerText;
    const idx = text.indexOf('Sección de comentarios');
    if (idx === -1) return 'no_comments_found';
    return text.substring(idx, idx + 3000);
  }
  return Array.from(comments).map(c => c.innerText.substring(0, 300)).join('\\n---\\n');
})()"
```

## Tips

### Reddit loads dynamically — always wait

Reddit is a heavy SPA. After `goto`, use in-page polling:

```bash
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.body.innerText.length > 500) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### The comment editor is lazy-loaded

The `div[contenteditable=true]` editor only appears after clicking "Responder". It has `width: 0, height: 0` before that. Do NOT try to find the editor before clicking "Responder".

### Use eval, not ref-based clicks

Reddit's React UI re-renders frequently. Refs from `snapshot` or `find` become stale quickly. Use `eval` to find and click elements by text content in a single atomic call (Browser Automation Golden Rule 1).

### Scrolling reveals more comments

Reddit lazy-loads comments on scroll. To see all comments:

```bash
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 5; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 1000));
  }
  return 'scrolled';
})()"
```

### "Ver más comentarios" / "View more comments" button

If you see this button, click it to expand collapsed comment threads:

```bash
node scripts/browser.js exec eval "(function(){
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    const t = b.textContent.trim();
    if (t.includes('Ver más comentarios') || t.includes('View more comments')) {
      b.click();
      return 'clicked';
    }
  }
  return 'not_found';
})()"
```

## Anti-patterns

- **Don't** use curl to access Reddit JSON API or RSS feeds — all HTTP endpoints return 403 for non-browser User-Agents
- **Don't** use headless mode for Reddit — it triggers 403 bot detection that poisons the entire session. Always use `--headed`
- **Don't** retry in headless after a 403 — `close --force` and reopen with `--headed` instead
- **Don't** try to fill the comment editor with `fill <ref>` — it's a contenteditable div, not a textarea. Use `eval` with `document.execCommand('insertText', ...)`
- **Don't** try to find the comment editor before clicking "Responder" — it's lazy-loaded and has zero dimensions until activated
- **Don't** repost promotional content in a subreddit feed after mod removal — post in the megathread instead
- **Don't** reuse refs after clicking "Responder" — the page re-renders, refs become stale
- **Don't** use `innerText =` alone for the comment editor — React state won't update. Use `execCommand('insertText')` instead
- **Don't** assume the UI is in English — Reddit may render in Spanish or other languages depending on account settings. Always check for both language labels
- **Don't** assume a "Responder" click opens a top-level comment editor — it opens a reply to the specific comment it belongs to. To post a top-level comment in a megathread, click the "Responder" button on the megathread post itself (not on an existing comment)
