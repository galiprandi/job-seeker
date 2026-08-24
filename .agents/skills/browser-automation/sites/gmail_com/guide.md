---
name: gmail
description: Automate Gmail with playwright-cli. Covers reading inbox via Atom feed, composing emails (with validated selectors), replying, searching, archiving, labeling, keyboard shortcuts, and bulk delete. Use when checking email, sending messages, managing inbox, or extracting email data. Part of the browser-automation skill.
---

# Gmail Automation

Automate Gmail via `playwright-cli` using a mix of UI interactions, keyboard shortcuts, and the Gmail Atom feed for bulk inbox reading.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Before doing anything manually, check if the consuming repo has scripts that wrap these operations.** Common scripts in consuming repos:
- `scripts/send-email.js` — send emails via SMTP (no browser needed, PREFERRED for sending)
- `scripts/gmail-send.js` — send emails via Gmail web UI with attachments

Run `ls scripts/*email*.js scripts/gmail*.js scripts/send*.js` to see what's available. **Prefer existing scripts over manual UI automation** — they're faster, more reliable, and handle edge cases.

## Setup

```bash
# Open Gmail (headless if already logged in, headed for login)
node scripts/browser.js open "https://mail.google.com" --headed

# If login needed: user logs in manually, then save state
node scripts/browser.js save-state
node scripts/browser.js close

# Next sessions: load state and go headless
node scripts/browser.js open "https://mail.google.com"
node scripts/browser.js load-state
```

## Reading inbox

### Atom feed (PREFERRED for bulk inbox reading)

One HTTP call returns unread inbox emails with title, sender, email, and summary. No UI navigation needed.

```bash
playwright-cli eval "(async()=>{var r=await fetch('https://mail.google.com/mail/feed/atom');var t=await r.text();return t.substring(0,2000)})()"
```

Returns XML Atom feed containing:
- `<fullcount>` — number of unread emails
- `<entry>` per email with `<title>`, `<author><name>`, `<author><email>`, `<summary>`, `<modified>`

**Parse the feed:**
```bash
playwright-cli eval "(async()=>{
  var r=await fetch('https://mail.google.com/mail/feed/atom');
  var t=await r.text();
  var p=new DOMParser();
  var d=p.parseFromString(t,'text/xml');
  var entries=d.querySelectorAll('entry');
  var out=[];
  for(var i=0;i<entries.length;i++){
    var e=entries[i];
    out.push({
      title:e.querySelector('title').textContent,
      from:e.querySelector('author name').textContent,
      email:e.querySelector('author email').textContent,
      summary:e.querySelector('summary').textContent.substring(0,150),
      modified:e.querySelector('modified').textContent
    });
  }
  return JSON.stringify(out);
})()"
```

**Feed endpoints:**
- `https://mail.google.com/mail/feed/atom` — unread inbox
- `https://mail.google.com/mail/feed/atom/unread` — unread only
- `https://mail.google.com/mail/feed/atom/<label>` — emails with a specific label (e.g. `job-alerts`)

**Limitation:** The Atom feed only returns unread emails (max 20). For read emails or full content, use the UI.

**Quick unread count:**
```bash
playwright-cli eval "(async()=>{var r=await fetch('https://mail.google.com/mail/feed/atom');var t=await r.text();var m=t.match(/<fullcount>(\d+)<\/fullcount>/);return m?m[1]+' unread':'error'})()"
```

### UI: list conversations

Use `#all` instead of `#inbox` — the inbox primary tab is nearly empty (Gmail splits into categories).

```
URL: https://mail.google.com/mail/u/0/#all
Row selector: tr.zA (read), tr.zE (unread)
Fields: .yW .zF or .yW span[email] for sender, .bog for subject, .xW.xY span[title] for date, .y2 for snippet
```

```bash
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#all"
# Wait for rows to load (in-page polling, see Browser Automation Rule 2)
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelectorAll('tr.zA').length > 5) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Extract emails
playwright-cli eval "(function(){
  const rows = document.querySelectorAll('tr.zA');
  return JSON.stringify(Array.from(rows).slice(0, 20).map(r => ({
    from: r.querySelector('.yW .zF, .yW span[email]')?.getAttribute('email') || '',
    name: r.querySelector('.yW .zF, .yW span[email]')?.getAttribute('name') || '',
    subject: r.querySelector('.bog')?.textContent || '',
    date: r.querySelector('.xW.xY span[title]')?.getAttribute('title') || '',
    unread: r.classList.contains('zE'),
    snippet: r.querySelector('.y2')?.textContent || '',
  })));
})()"
```

### UI: read a specific label

```
URL: https://mail.google.com/mail/u/0/#label/Job%20Alerts
Note: display name "Job Alerts" (space), URL uses %20
```

```bash
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#label/Job%20Alerts"
playwright-cli eval "(async function(){
  for (let i = 0; i < 40; i++) {
    const main = document.querySelector('div[role=main]');
    if (main && (main.innerText.includes('Job Alerts') || document.querySelectorAll('tr.zA').length > 0)) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

playwright-cli eval "(function(){
  const rows = document.querySelectorAll('tr.zA');
  if (rows.length === 0) return JSON.stringify({ empty: true, count: 0 });
  return JSON.stringify({
    empty: false,
    count: rows.length,
    emails: Array.from(rows).slice(0, 20).map(r => ({
      from: r.querySelector('.yW .zF, .yW span[email]')?.getAttribute('email') || '',
      subject: r.querySelector('.bog')?.textContent || '',
      date: r.querySelector('.xW.xY span[title]')?.getAttribute('title') || '',
    })),
  });
})()"
```

### UI: open a specific email

```bash
# Navigate by URL (requires thread ID)
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#inbox/<threadId>"
```

Or click an email row from the inbox list (use eval, not ref-based click — see Browser Automation Rule 1):

```bash
playwright-cli eval "(function(){
  const rows = document.querySelectorAll('tr.zA');
  if (rows.length > 0) { rows[0].click(); return 'clicked'; }
  return 'not_found';
})()"
```

### UI: read email content

When an email is open, the content is in `[role="main"]`:

```bash
playwright-cli eval "(async function(){
  await new Promise(r=>setTimeout(r,2000));
  const body = document.querySelector('[role=main]');
  if (body) return body.innerText.substring(0, 3000);
  return 'no body';
})()"
```

**Note:** Row selector `tr` works without classes too — `tr.zA` (read) and `tr.zE` (unread) are more specific, but plain `tr` with an `innerText.length` filter is useful when classes haven't loaded yet.

## Archiving emails

### Single email (PREFERRED: keyboard shortcut)

The fastest way to archive is the `e` key. Select the email first with `x`, or have it open:

```bash
# If email is open in reading pane, just press e
playwright-cli press e

# Or select from list then archive
playwright-cli press x
playwright-cli press e
```

### Bulk archive

Select multiple checkboxes then press `e`:

```bash
playwright-cli eval "(function(){
  const rows = document.querySelectorAll('tr');
  const targets = ['sender1', 'sender2', 'sender3'];
  let clicked = 0;
  for (const t of targets) {
    const row = Array.from(rows).find(r => r.innerText.includes(t));
    if (row) {
      const cb = row.querySelector('[role=checkbox]');
      if (cb && cb.getAttribute('aria-checked') !== 'true') { cb.click(); clicked++; }
    }
  }
  return 'selected ' + clicked;
})()"

# Then archive all selected
playwright-cli press e
```

### Archive via button (fallback)

If keyboard shortcuts don't work, find the archive button:

```bash
playwright-cli eval "(function(){
  const btn = document.querySelector('div[role=button][aria-label*=\"Archivar\"], div[role=button][aria-label*=\"Archive\"]');
  if (btn) { btn.click(); return 'archived'; }
  return 'not_found';
})()"
```

## Unsubscribing

Gmail shows a native "Darse de baja" / "Unsubscribe" link next to the sender for supported senders.

```bash
# 1. Open the email
# 2. Click the "Darse de baja" / "Unsubscribe" span next to sender
playwright-cli eval "(function(){
  const span = Array.from(document.querySelectorAll('span')).find(s =>
    s.offsetParent !== null && (s.textContent.trim() === 'Darse de baja' || s.textContent.trim() === 'Unsubscribe')
  );
  if (span) { span.click(); return 'clicked'; }
  return 'not_found';
})()"

# 3. Wait for confirmation dialog
playwright-cli eval "(async function(){
  for (let i = 0; i < 25; i++) {
    const dialog = document.querySelector('[role=dialog]');
    if (dialog && (dialog.innerText.includes('Anular suscripción') || dialog.innerText.includes('Unsubscribe'))) return 'dialog_ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# 4. Click confirm button in dialog
playwright-cli eval "(function(){
  const btns = Array.from(document.querySelectorAll('button')).filter(b =>
    b.offsetParent !== null && (b.textContent.includes('Anular suscripción') || b.textContent.includes('Unsubscribe'))
  );
  if (btns.length > 0) { btns[btns.length - 1].click(); return 'confirmed'; }
  return 'not_found';
})()"
```

**Verification:** After confirming, Gmail shows "Te has dado de baja de..." / "You've unsubscribed from..." near the sender name.

## Composing emails (validated empirically 2026-08-10)

Gmail compose is **NOT** an iframe. It is `div[role=dialog]` in the main document, so `playwright-cli` can access all elements directly.

### Compose selectors (Spanish UI, English equivalents noted)

| Field | Selector | Notes |
|---|---|---|
| To (recipients) | `input[role=combobox][aria-label="Destinatarios"]` | English: `aria-label="To"` |
| Subject | `input[aria-label="Asunto"]` | English: `aria-label="Subject"` |
| Body | `textarea[aria-label="Cuerpo del mensaje"]` | English: `aria-label="Message body"`. NOT a contenteditable div |
| Send button | `div[role=button][aria-label*="Enviar"]` | English: `aria-label*="Send"` |

### Open compose dialog

```bash
# Method 1: Keyboard shortcut 'c' opens compose
playwright-cli press c
```

Or click the "Compose" / "Redactar" button via eval:

```bash
playwright-cli eval "(function(){
  const btns = document.querySelectorAll('div[role=button], button');
  for (const b of btns) {
    const label = b.getAttribute('aria-label') || b.textContent || '';
    if (label.includes('Redactar') || label.includes('Compose')) { b.click(); return 'clicked'; }
  }
  return 'not_found';
})()"
```

### Fill compose fields (CRITICAL: use native value setter)

React-controlled inputs don't react to `.value = "..."` alone. You must use the native setter and dispatch an `input` event.

**To (recipients):**
```bash
playwright-cli eval "(function(){
  const toInput = document.querySelector('input[role=combobox][aria-label=\"Destinatarios\"], input[role=combobox][aria-label=\"To\"]');
  if (!toInput) return 'to_not_found';
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(toInput, 'RECIPIENT_EMAIL');
  toInput.dispatchEvent(new Event('input', { bubbles: true }));
  toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'to_set';
})()"
```

**Subject:** (same native setter pattern)
```bash
playwright-cli eval "(function(){
  const el = document.querySelector('input[aria-label=\"Asunto\"], input[aria-label=\"Subject\"]');
  if (!el) return 'subject_not_found';
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(el, 'YOUR SUBJECT');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'subject_set';
})()"
```

**Body:** (textarea, use HTMLTextAreaElement setter)
```bash
playwright-cli eval "(function(){
  const el = document.querySelector('textarea[aria-label=\"Cuerpo del mensaje\"], textarea[aria-label=\"Message body\"]');
  if (!el) return 'body_not_found';
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeSetter.call(el, 'YOUR BODY TEXT');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'body_set';
})()"
```

### Send email (mousedown -> click -> mouseup sequence)

Plain `.click()` is unreliable for the Send button. Use the event sequence:

```bash
playwright-cli eval "(function(){
  const btn = document.querySelector('div[role=button][aria-label*=\"Enviar\"], div[role=button][aria-label*=\"Send\"]');
  if (!btn) return 'send_not_found';
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return 'sent';
})()"
```

### Verify send

Wait for the toast "Mensaje enviado" (English: "Message sent"):

```bash
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    const alerts = document.querySelectorAll('div[role=alert], span[role=alert]');
    for (const a of alerts) {
      if (a.textContent.includes('enviado') || a.textContent.includes('sent')) return 'verified';
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### Compose field reference

| Field | Element type | How to fill | aria-label (ES/EN) |
|---|---|---|---|
| To (recipient) | input (combobox) | eval + native setter + Enter | Destinatarios / To |
| Cc | input (dynamic) | eval + native setter | CC / Cc |
| Bcc | input (dynamic) | eval + native setter | CCO / Bcc |
| Subject | input | eval + native setter | Asunto / Subject |
| Body | textarea | eval + native setter | Cuerpo del mensaje / Message Body |

**Cc/Bcc fields are hidden by default.** Click the "Cc/Bcc" labels in the compose dialog to reveal them.

### Schedule send (programar envío)

Gmail's native schedule send is preferable to SMTP + cron/sleep because it survives session disconnects and is visible in the "Programados" (Scheduled) folder.

**Flow:**

1. Compose the email as usual (fill To, Subject, Body)
2. Click "Más opciones de envío" button (next to "Enviar")
3. A menu appears with `[role=menuitem]` containing "Programar envío" / "Schedule send"
4. Click that menuitem -> a schedule dialog opens with preset options:
   - "Mañana por la mañana" (Tomorrow morning, 8:00)
   - "Mañana por la tarde" (Tomorrow afternoon, 13:00)
   - "El lunes por la mañana" (Monday morning, 8:00)
   - "Elegir fecha y hora" (Pick date and time)
5. For custom time, click "Elegir fecha y hora" -> dialog with `textbox "Fecha"` and `textbox "Hora"` appears
6. Fill the date and time inputs, then click "Programar envío" button to confirm

**Selectors (Spanish UI, English equivalents noted):**

| Field | Selector | Notes |
|---|---|---|
| More send options | `button` matching text "Más opciones de envío" | English: "More send options" |
| Schedule send menuitem | `[role=menuitem]` matching text "Programar envío" | English: "Schedule send" |
| Pick date/time link | text "Elegir fecha y hora" | English: "Pick date & time" |
| Date input | `textbox "Fecha"` | English: `textbox "Date"` |
| Time input | `textbox "Hora"` | English: `textbox "Time"` |
| Confirm schedule | `button "Programar envío"` | English: `button "Schedule send"` |

**Key learnings:**

- The "Más opciones de envío" button may need a direct `click` via ref (not eval dispatchEvent). The menu appears as `[role=menu]` with `[role=menuitem]` children.
- The time input accepts formats like "8:30" or "08:30". Use `fill` with the ref, or eval with native setter + `input` event + Enter keypress.
- After scheduling, the email moves to the "Programados" folder (sidebar label "Programados" with count). Verify by navigating to `#scheduled` and checking the email appears with "Programado para enviarse" text.
- The preset options (Mañana 8:00, etc.) are quick but fixed times. For arbitrary times like 8:30, must use "Elegir fecha y hora".
- The schedule dialog may close if the time input loses focus. Fill time last, then immediately click the confirm button.

**Verification:**

```bash
# Navigate to Scheduled folder
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#scheduled"

# Check the scheduled email appears
node scripts/browser.js exec eval "(async function(){
  await new Promise(r=>setTimeout(r,3000));
  var body=document.body.innerText;
  if(body.match(/Programado para enviarse/i)) return 'verified';
  return 'not_found';
})()"
```

**When to use schedule send vs SMTP:**

| Scenario | Method |
|---|---|
| Send immediately | SMTP (`scripts/send-email.js`) — faster, no browser needed |
| Schedule for later | Gmail native schedule send — survives disconnects, visible in UI |
| Schedule via SMTP | `at`/`sleep` + SMTP — works but fragile, dies if session closes |

## Replying to emails (DIFFERENT from compose)

Reply is different from compose. The reply body **IS** a contenteditable div (unlike compose which uses a textarea).

### Reply selectors

| Field | Selector | Notes |
|---|---|---|
| Reply button | `button[aria-label="Responder"]` | English: `aria-label="Reply"` |
| Reply body | `div[contenteditable=true]` | IS contenteditable (different from compose) |
| Reply Send | `div[role=button][aria-label="Enviar y archivar"]` | English: `aria-label="Send & archive"`. Different from compose Send |

```bash
# 1. Click Reply button
playwright-cli eval "(function(){
  const btn = document.querySelector('button[aria-label=\"Responder\"], button[aria-label=\"Reply\"]');
  if (!btn) return 'reply_not_found';
  btn.click();
  return 'reply_clicked';
})()"

# 2. Wait for contenteditable body to appear
playwright-cli eval "(async function(){
  for (let i = 0; i < 25; i++) {
    if (document.querySelector('div[contenteditable=true]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# 3. Fill reply body (contenteditable, use innerText + InputEvent)
playwright-cli eval "(function(){
  const el = document.querySelector('div[contenteditable=true]');
  if (!el) return 'body_not_found';
  el.focus();
  el.innerText = 'YOUR REPLY TEXT';
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'YOUR REPLY TEXT' }));
  return 'body_set';
})()"

# 4. Send reply (different aria-label from compose!)
playwright-cli eval "(function(){
  const btn = document.querySelector('div[role=button][aria-label=\"Enviar y archivar\"], div[role=button][aria-label=\"Send & archive\"]');
  if (!btn) return 'send_not_found';
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return 'sent';
})()"
```

## Search

### Search bar

```bash
playwright-cli snapshot
playwright-cli fill <search_ref> "from:linkedin.com subject:job"
playwright-cli press Enter
```

### Search operators (work in the search bar)

| Operator | Example | What it does |
|---|---|---|
| `from:` | `from:recruiter@company.com` | Emails from sender |
| `to:` | `to:candidate@gmail.com` | Emails to recipient |
| `subject:` | `subject:interview` | Subject contains text |
| `has:attachment` | `from:hr has:attachment` | Emails with attachments |
| `label:` | `label:job-alerts` | Emails with label |
| `is:unread` | `is:unread from:linkedin` | Unread emails |
| `is:starred` | `is:starred` | Starred emails |
| `after:` / `before:` | `after:2026/01/01 before:2026/08/01` | Date range |
| `older_than:` | `older_than:7d` | Older than N days (d/m/y) |
| `newer_than:` | `newer_than:1d` | Newer than N days |
| `filename:` | `filename:pdf` | Attachments of type |
| `OR` | `from:a.com OR from:b.com` | Boolean OR |
| `-` | `from:linkedin -subject:promotion` | Exclude |

### Navigate to label/folder by URL

```bash
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#label/job-alerts"
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#starred"
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#sent"
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#drafts"
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#all"
```

## Keyboard shortcuts

Gmail has extensive keyboard shortcuts. They work with `playwright-cli press <key>`.

**Must enable:** Settings → See all settings → General → Keyboard shortcuts: ON

### Navigation

| Shortcut | Action |
|---|---|
| `g` then `i` | Go to Inbox |
| `g` then `s` | Go to Starred |
| `g` then `t` | Go to Sent |
| `g` then `d` | Go to Drafts |
| `g` then `a` | Go to All Mail |
| `g` then `l` | Go to Label (opens label picker) |

### Email actions

| Shortcut | Action |
|---|---|
| `c` | Compose new email |
| `x` | Select email (checkbox) |
| `e` | Archive selected email |
| `#` | Delete selected email |
| `s` | Star/unstar email |
| `l` | Apply label (opens label menu) |
| `v` | Move to label (opens label menu) |
| `r` | Reply to email |
| `a` | Reply all |
| `f` | Forward email |
| `m` | Mute thread |
| `z` | Undo last action |
| `Shift+I` | Mark as read |
| `Shift+U` | Mark as unread |
| `/` | Search mail |
| `Shift+/` | Show keyboard shortcut help |

### Composition shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` / `⌘+Enter` | Send email |
| `Ctrl+Shift+C` / `⌘+Shift+C` | Add CC |
| `Ctrl+Shift+B` / `⌘+Shift+B` | Add BCC |
| `Ctrl+K` / `⌘+K` | Insert link |

### Thread navigation

| Shortcut | Action |
|---|---|
| `j` | Next email (older) |
| `k` | Previous email (newer) |
| `Enter` | Open email |
| `u` | Back to inbox from email view |

### Usage with playwright-cli

```bash
# Select first email, then archive it
playwright-cli press x
playwright-cli press e

# Go to sent mail (two-key shortcut with short delay)
playwright-cli press g
playwright-cli press t
```

**Note:** Two-key shortcuts (like `g` then `i`) require a small delay between keys.

## Delete emails (trash)

The delete button is `div.nX` with `aria-label="Eliminar"` (Spanish) or `aria-label="Delete"` (English). Simple click doesn't always work. Use mousedown -> click -> mouseup sequence.

```bash
# 1. Navigate to search results or label
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#search/$(python3 -c 'import urllib.parse; print(urllib.parse.quote("from:linkedin.com"))')"

# 2. Wait for rows
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelectorAll('tr.zA').length > 0) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# 3. Select all
playwright-cli eval "(function(){
  const cb = document.querySelector('div[role=\"checkbox\"]');
  if (cb) { cb.click(); return 'selected'; }
  return 'not_found';
})()"

# 4. Click "select all that match" if it appears
playwright-cli eval "(function(){
  const links = document.querySelectorAll('a, span');
  for (const l of links) {
    if (l.textContent.includes('Seleccionar todas') || l.textContent.includes('Select all')) {
      l.click(); return 'clicked';
    }
  }
  return 'not_found';
})()"

# 5. Delete with proper event sequence
playwright-cli eval "(function(){
  const btn = document.querySelector('div.nX[aria-label=\"Eliminar\"], div.nX[aria-label=\"Delete\"]');
  if (!btn) return 'not_found';
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return 'deleted';
})()"
```

## SMTP alternative (no browser needed)

For sending emails, SMTP via nodemailer is more reliable and faster than browser automation. Use the browser only when SMTP is not available or when you need to attach files from the browser session.

```javascript
// send-email.js (minimal SMTP example)
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
await transporter.sendMail({
  from: 'you@example.com',
  to: 'recipient@example.com',
  subject: 'Subject',
  text: 'Body',
  attachments: [{ filename: 'cv.pdf', path: '/path/to/cv.pdf' }],
});
```

Requires an app password (not your regular password). Generate at https://myaccount.google.com/apppasswords.

## Tips

### Gmail loads slowly — always wait

Gmail is a heavy SPA. After `goto` or any navigation, use in-page polling (Browser Automation Rule 2):

```bash
node scripts/browser.js goto "https://mail.google.com/mail/u/0/#inbox"
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelectorAll('tr.zA').length > 0) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### The compose "To" field is tricky

The "To" field is a custom component that:
1. Has language-dependent aria-label (`Destinatarios` / `To`)
2. Is a React-controlled input (needs native value setter, not just `.value =`)
3. Requires pressing Enter after setting the value to confirm the recipient

### Use Atom feed for quick inbox checks

Don't navigate the UI just to check if there are new emails:

```bash
playwright-cli eval "(async()=>{var r=await fetch('https://mail.google.com/mail/feed/atom');var t=await r.text();var m=t.match(/<fullcount>(\d+)<\/fullcount>/);return m?m[1]+' unread':'error'})()"
```

### Multiple Gmail accounts

Gmail supports multiple accounts in the same browser. The URL pattern includes the account index:
- `mail.google.com/mail/u/0/` — first account
- `mail.google.com/mail/u/1/` — second account

## Anti-patterns

- **Don't** navigate the UI just to check unread count — use the Atom feed
- **Don't** try to fill the "To" field with `.value =` alone — use the native value setter
- **Don't** use plain `.click()` for the Send button — use mousedown -> click -> mouseup
- **Don't** confuse compose (textarea body) with reply (contenteditable body) — they use different selectors
- **Don't** reuse refs after clicking or pressing keys — take a new snapshot
- **Don't** forget to wait after `goto` — Gmail is a heavy SPA
- **Don't** try to log in programmatically — open headed and let the user log in
- **Don't** use `type` for multiline body text — use `fill <ref>` or eval with native setter
- **Don't** navigate to `#inbox` expecting all emails — Gmail splits into categories, use `#all`
- **Don't** archive emails without explicit user confirmation — always ask first
