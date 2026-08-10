# Browser Ops Skill

Playbook for browser-based platform operations (LinkedIn, Gmail, ATS).
Use this skill when interacting with web platforms via Playwright.

## When to use

- Any flow that requires browser interaction (news, apply, targets, radar, daily)
- When a platform operation fails and needs a more robust approach
- When writing or fixing scripts that use playwright-cli

## 1. Golden rules from baseline experiment

These rules were validated empirically. Breaking them causes failure.

### Rule 1: eval > ref-based clicks

Refs (`[ref=e123]`) are per-snapshot and **do not persist** between separate
`playwright-cli` CLI calls. A ref from one `snapshot` call is invalid by the
next `click` call.

**Wrong:**
```
snap = snapshot()
ref = findRef(snap, "Message")
clickRef(ref)  # may fail, ref may be stale
```

**Right:**
```js
// Use eval to find and click by text in one atomic call
evalJS(`(function(){
  const els = document.querySelectorAll('a, button, [role="link"]');
  for (const el of els) {
    if (el.textContent.includes('Message')) { el.click(); return 'clicked'; }
  }
  return 'not_found';
})()`)
```

Or use the helper:
```js
const { clickByText } = require('./lib/browser-helpers');
clickByText('a, button, [role="link"]', 'Message');
```

### Rule 2: In-page polling > shell sleep

Shell `sleep` between browser commands kills the playwright-cli daemon session.
The session dies within 5-10 seconds of inactivity.

**Wrong:**
```
goto(url)
sleep(4000)  # session may die here
snapshot()   # fails: "No active session"
```

**Right:**
```js
// Use in-page Promise polling (keeps connection alive)
const { waitForSelector } = require('./lib/browser-helpers');
goto(url);
waitForSelector('div.target-element', { timeout: 10000 });
// or
waitFor(`document.querySelectorAll('tr.zA').length > 5`, { timeout: 10000 });
```

### Rule 3: Read snapshot file as fallback

When `exec snapshot` fails (session briefly busy), the `open`/`goto` commands
auto-generate a snapshot YAML file in `.playwright-cli/`. Read it directly.

```js
const { snapshotReliable } = require('./lib/browser-helpers');
const snap = snapshotReliable();  // tries exec, falls back to file
```

### Rule 4: Use URLs directly, not clicks for navigation

Navigating to a specific URL is more reliable than clicking navigation links.

**Wrong:** Click "Messaging" icon in header
**Right:** `goto("https://www.linkedin.com/messaging/")`

**Wrong:** Click "Saved Jobs" menu item
**Right:** `goto("https://www.linkedin.com/jobs-tracker/?stage=saved")`

### Rule 5: Verify with DOM content, not URL

SPAs (LinkedIn, Gmail) update the right panel without changing the URL.

**Wrong:** Check if URL changed after clicking a conversation
**Right:** Check if `msg-s-message-list-container` exists and header matches

```js
evalJS(`(function(){
  const panel = document.querySelector('.msg-s-message-list-container');
  const header = document.querySelector('h2');
  if (panel && header && header.textContent.includes('<person_name>')) return 'ok';
  return 'not_loaded';
})()`)
```

### Rule 6: Batch operations into a single eval call

Doing wait + click + verify in one `eval` call is more robust than multiple
separate CLI calls. Each separate call risks session death between steps and
adds latency. Batch DOM operations into a single eval whenever possible.

**Wrong:**
```bash
playwright-cli eval "document.querySelector('#btn')"
playwright-cli eval "document.querySelector('#btn').click()"
playwright-cli eval "document.querySelector('#result')"
```

**Right:**
```js
evalJS(`(function(){
  const btn = document.querySelector('#btn');
  if (!btn) return 'not_found';
  btn.click();
  // verify in the same call
  const result = document.querySelector('#result');
  return result ? result.textContent : 'no_result';
})()`)
```

### Chaining pattern: open + eval in a single shell command

Chain `open && eval` in a single shell command to prevent session death
between calls. The session can die in the gap between two separate shell
invocations.

**Wrong:**
```bash
node scripts/browser.js open "https://mail.google.com"
# session may die here
node scripts/browser.js exec eval "document.title"
```

**Right:**
```bash
node scripts/browser.js open "https://mail.google.com" && \
  node scripts/browser.js exec eval "document.title"
```

## 2. Browser wrapper reference

**Always use `node scripts/browser.js` for opening, navigating, and closing the browser.** Never call `playwright-cli open` directly, never `npx @playwright/cli`, never `npx playwright cli`, never open Chrome directly. The wrapper guarantees the profile is always used and reads `browser_mode` from the DB automatically. (Gold Rule 10.)

```bash
# Core
node scripts/browser.js open <url> [--headed|--headless] [--session <name>]  # Open browser
node scripts/browser.js goto <url> [--tab <name>] [--session <name>]         # Navigate
node scripts/browser.js close [--session <name>]                             # Close session
node scripts/browser.js close-all                                            # Close all sessions
node scripts/browser.js ensure [--session <name>]                            # Idempotent check (no-op if healthy)
node scripts/browser.js exec <cmd> [args...] [--tab <name>] [--session <name>]  # Passthrough to playwright-cli

# Sessions for parallel subagents
node scripts/browser.js attach --session <name>     # Attach to running browser (independent tab context)
node scripts/browser.js detach --session <name>     # Detach session

# Tab management
node scripts/browser.js tab-new <url> --name <name> [--session <name>]   # Create named tab
node scripts/browser.js tab-select <name> [--session <name>]             # Select tab by name
node scripts/browser.js tab-close <name> [--session <name>]              # Close tab by name
node scripts/browser.js tab-close-all [--session <name>]                 # Close all extra tabs
node scripts/browser.js tab-list [--session <name>] [--json]             # List tabs

# Auth state persistence (avoid re-login)
node scripts/browser.js save-state [--filename <path>] [--session <name>]  # Save cookies + localStorage
node scripts/browser.js load-state [--filename <path>] [--session <name>]  # Restore cookies + localStorage

# Debugging
node scripts/browser.js dashboard                          # Visual dashboard (monitor all sessions)
node scripts/browser.js trace-start [--session <name>]     # Start trace recording
node scripts/browser.js trace-stop [--session <name>]      # Stop trace recording
node scripts/browser.js video-start [--filename <path>] [--session <name>]  # Start video recording
node scripts/browser.js video-stop [--session <name>]      # Stop video recording
node scripts/browser.js console [level] [--session <name>] # Console messages (error/warning/info/debug)
node scripts/browser.js requests [--session <name>]        # List network requests
node scripts/browser.js request <index> [--session <name>] # Show request details

# Info
node scripts/browser.js list                               # List active sessions
node scripts/browser.js status                             # Full status (mode, sessions, tabs)
```

**Key behaviors:**
- `--profile=.browser-profile` is hardcoded in the wrapper. It cannot be omitted
- If no `--headed`/`--headless` flag is passed to `open`, the wrapper reads `preferences.tooling.browser_mode` from the DB. `headed` -> visible, everything else -> headless. The caller passes `--headed` explicitly for manual logins (Gold Rule 5)
- If a session is already running, `open` automatically does `goto` instead of failing
- **Lockfile**: the wrapper uses `.browser-profile/.lock` to prevent race conditions when multiple processes try to open the browser simultaneously. Stale locks (dead PID) are detected and cleaned automatically
- **Health check**: before reusing a session, the wrapper runs a quick `eval 1+1` to detect zombie sessions. If unresponsive, it cleans up and fails fast
- **Config file**: `.playwright/cli.config.json` sets default timeouts (action: 10s, navigation: 30s), blocks tracking/analytics domains, and captures console warnings. These apply to all sessions automatically
- For all other playwright-cli commands (click, fill, snapshot, eval, etc.) use `exec` or call `playwright-cli` directly

## 3. Parallel subagent browser pattern

When dispatching multiple subagents that need browser access (e.g: `news` flow checking Gmail + LinkedIn + DB simultaneously):

```bash
# 1. Coordinator opens browser and creates named tabs
node scripts/browser.js open "https://gmail.com" --headless
node scripts/browser.js tab-new "https://linkedin.com" --name linkedin
node scripts/browser.js tab-new "https://example.com" --name db

# 2. Attach a session per subagent (each gets independent active tab)
node scripts/browser.js attach --session gmail-worker
node scripts/browser.js attach --session linkedin-worker

# 3. Subagents work in parallel without locks
# Subagent A: node scripts/browser.js exec snapshot --tab linkedin --session linkedin-worker
# Subagent B: node scripts/browser.js exec snapshot --tab gmail --session gmail-worker

# 4. Cleanup
node scripts/browser.js detach --session gmail-worker
node scripts/browser.js detach --session linkedin-worker
node scripts/browser.js close-all
```

**Why attached sessions work:** `playwright-cli attach` creates a new session connected to the same browser, but with its own active tab context. Two sessions can have different active tabs simultaneously without interference. No locks needed.

**Alternative: `PLAYWRIGHT_CLI_SESSION` env var.** Subagents can set `PLAYWRIGHT_CLI_SESSION=gmail-worker` once and then call `playwright-cli` directly without `-s=` on every command:

```bash
PLAYWRIGHT_CLI_SESSION=gmail-worker playwright-cli snapshot
PLAYWRIGHT_CLI_SESSION=gmail-worker playwright-cli eval "document.title"
```

## 4. Browser efficiency patterns

**Token-efficient snapshots:** LinkedIn and Gmail pages have thousands of DOM nodes. Full snapshots consume excessive tokens. Use these patterns:

```bash
# Shallow snapshot first (depth-limited)
playwright-cli snapshot --depth=4

# Search for specific text instead of full snapshot
playwright-cli find "Apply"
playwright-cli find --regex "/sign (in|up)/i"
playwright-cli find "Easy Apply"

# Snapshot a specific element only
playwright-cli snapshot "#main"
playwright-cli snapshot e34   # ref from a previous shallow snapshot
```

**Fill + submit in one command:**
```bash
playwright-cli fill e15 "search term" --submit   # fill + press Enter atomically
```

**Detect errors without snapshots:**
```bash
node scripts/browser.js console error    # check for JS errors
node scripts/browser.js requests        # check for failed network requests
```

**Persist auth between browser restarts:**
```bash
# After manual login (onboarding or re-login)
node scripts/browser.js save-state

# After opening browser in a new session (daily flow)
node scripts/browser.js load-state
# If load-state fails (no file), proceed to headed login (Gold Rule 5)
```

## 5. Platform patterns

### LinkedIn

#### Open a conversation by name

```
URL: https://www.linkedin.com/messaging/
Strategy: eval click on <li> by person name
Verify: msg-s-message-list-container exists + <h2> matches name
```

```js
const { goto, evalJS } = require('./lib/browser-helpers');
goto('https://www.linkedin.com/messaging/');
waitForSelector('.msg-conversation-listitem', { timeout: 10000 });

// Click conversation by name (atomic eval)
evalJS(`(function(){
  const items = document.querySelectorAll('.msg-conversation-listitem');
  for (const item of items) {
    const name = item.querySelector('h3, .msg-conversation-card__content');
    if (name && name.textContent.includes('PERSON_NAME')) {
      item.click();
      return 'clicked';
    }
  }
  return 'not_found';
})()`.replace('PERSON_NAME', name));

// Verify
waitForSelector('.msg-s-message-list-container', { timeout: 5000 });
```

#### Send a message (contenteditable fix)

The composer is `div[contenteditable]`. Setting `innerText` alone leaves the
Send button disabled because the `input` event is not dispatched.

```js
// 1. Focus the composer
evalJS(`document.querySelector('div.msg-form__contenteditable').focus()`);

// 2. Set text AND dispatch InputEvent (this enables Send)
evalJS(`(function(){
  const el = document.querySelector('div.msg-form__contenteditable');
  el.innerText = 'MESSAGE_TEXT';
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'MESSAGE_TEXT' }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  return 'typed';
})()`.replace(/MESSAGE_TEXT/g, message));

// 3. Wait for Send button to be enabled
waitFor(`!document.querySelector("button[type='submit'].msg-form__send-button")?.disabled`, { timeout: 5000 });

// 4. Click Send (via eval, not ref)
evalJS(`document.querySelector("button[type='submit'].msg-form__send-button").click()`);

// 5. Verify: look for "TODAY" + "sent" in message list
waitForText('TODAY', { timeout: 5000 });
```

#### Connect with note

The Connect button can be in: profile page, search results, or a dropdown.
The modal varies (`connect-with-note`, `send-invite`).

```js
// 1. Navigate to profile
goto(profileUrl);

// 2. Find Connect button (may be in "More" dropdown)
let found = evalJS(`(function(){
  const btns = document.querySelectorAll('button, [role="button"]');
  for (const b of btns) {
    if (b.textContent.trim() === 'Connect') { b.click(); return 'clicked'; }
  }
  return 'not_found';
})()`);

// 3. If "Add a note" appears, click it
evalJS(`(function(){
  const links = document.querySelectorAll('a, button');
  for (const l of links) {
    if (l.textContent.includes('Add a note')) { l.click(); return 'clicked'; }
  }
  return 'not_found';
})()`);

// 4. Fill the note textarea
waitForSelector('textarea', { timeout: 3000 });
evalJS(`(function(){
  const ta = document.querySelector('textarea');
  ta.value = 'NOTE_TEXT';
  ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
  return 'filled';
})()`.replace('NOTE_TEXT', note));

// 5. Click Send
evalJS(`(function(){
  const btns = document.querySelectorAll('button[type="submit"], button');
  for (const b of btns) {
    if (b.textContent.includes('Send') && !b.disabled) { b.click(); return 'sent'; }
  }
  return 'not_found';
})()`);
```

#### Read notifications

```
URL: https://www.linkedin.com/notifications/
Strategy: parse article "Notification" elements via eval
```

```js
goto('https://www.linkedin.com/notifications/');
waitForSelector('article', { timeout: 10000 });
const notifications = evalJSON(`(function(){
  const articles = document.querySelectorAll('article');
  return JSON.stringify(Array.from(articles).map(a => ({
    text: a.innerText.substring(0, 200),
    link: a.querySelector('a[href]')?.href || null,
  })));
})()`);
```

#### Read saved jobs / job tracker

```
URL: https://www.linkedin.com/jobs-tracker/?stage=saved
Redirect: /my-items/saved-jobs/ -> /jobs-tracker/
Tabs: Saved, In Progress (dropdown: Draft, Clicked apply), Applied, Interview, Archived
```

```js
goto('https://www.linkedin.com/jobs-tracker/?stage=saved');
waitForSelector('main', { timeout: 10000 });
const jobs = evalJSON(`(function(){
  const cards = document.querySelectorAll('main a[href*="/jobs/view/"]');
  return JSON.stringify(Array.from(cards).map(c => {
    const ps = c.querySelectorAll('p');
    return {
      role: ps[0]?.textContent || '',
      companyLocation: ps[1]?.textContent || '',
      url: c.href,
    };
  }));
})()`);
```

#### Post search for job openings (content search)

**Queries that work (ordered by effectiveness):**

Replace `<Role>` with the user's profile title (e.g: "AI Engineer", "Engineering Manager", "Full Stack Developer") and `<City>` with their city or country.

1. `"<Role>" "hiring" LATAM` in `search/results/content/` with `sortBy="date_posted"` and Posts filter. Most productive query. Returns posts from recruiters and hiring managers with visible contact emails.
2. `"<Role>" "<City>" "hiring"` for geo-specific searches. Returns local posts with direct emails.
3. `"<Role in user's language>" "buscamos"` (or equivalent in the user's language) for searches in the local language. Less volume but finds posts that don't appear in English.
4. `#hiring + <Role> keywords` (hashtags). LinkedIn doesn't support OR between hashtags or complex combinations. Simplify to one hashtag + keywords. Most productive: `#hiring` + `"<Role>"`.

**Queries that don't work:**
- Multiple hashtags with OR (`#hiring OR #<Role>Jobs`): LinkedIn treats them as literal text
- Very long combinations with many ANDs: returns 0 results or irrelevant results
- Niche hashtags (`#latamjobs`, `#busquedasIT`, `#ofertasIT`): low volume, almost no results

**Post extraction pattern:**
1. Go to `search/results/content/?keywords=...&sortBy="date_posted"`
2. Snapshot -> grep `button.*post by` for authors
3. grep `url.*in/` for profile URLs (3 repeated URLs per author)
4. grep `text:.*<Role keywords>|text:.*hiring` for post content
5. grep `mailto:` to extract direct contact emails
6. Scroll with `window.scrollBy(0, 5000)` + snapshot for more results
7. For each relevant post: send connection request + email if email is visible

#### Connection requests (invites)

**URL pattern for invites without note:**
```
https://www.linkedin.com/preload/custom-invite/?vanityName=<vanity>
```
- The vanity is the slug from the profile URL (`/in/<vanity>/`)
- For special characters (a, e, c, n) use URL encoding (`%C3%A1`, `%C3%A9`, `%C3%A7`, `%C3%B1`)
- The "Add a note to your invitation" dialog appears automatically
- Search for the "Send without a note" button with grep and click
- If the dialog doesn't appear, the user is already a connection or the profile is 3rd+ (can't invite)

**Custom note limit:** LinkedIn has a weekly limit for custom notes. When exhausted, send invites without a note. Don't retry with a note.

**3rd+ connections:** Can't send invite. Mark as "no invite possible" and move to the next. Don't waste time trying workarounds.

#### Search jobs with Easy Apply

```
URL: https://www.linkedin.com/jobs/search/?keywords=<kw>&location=<loc>&f_AL=true&f_WT=2&sortBy=DD
Easy Apply badge: generic "Easy Apply" in job list cards (not just detail panel)
```

```js
goto(searchUrl);
waitForSelector('main', { timeout: 10000 });
const jobs = evalJSON(`(function(){
  const cards = document.querySelectorAll('main .job-card-container, [data-job-id]');
  return JSON.stringify(Array.from(cards).map(c => ({
    title: c.querySelector('h3, .job-title')?.textContent || '',
    company: c.querySelector('h4, .company-name')?.textContent || '',
    easyApply: c.textContent.includes('Easy Apply'),
    url: c.querySelector('a[href]')?.href || '',
  })));
})()`);
```

#### Easy Apply (LinkedIn Jobs)

**URL pattern for Easy Apply search:**
```
https://www.linkedin.com/jobs/search/?keywords=<keywords>&location=Latin%20America&f_AL=true&f_WT=2&sortBy=DD
```
- `f_AL=true` = Easy Apply only
- `f_WT=2` = Remote only
- `sortBy=DD` = sorted by date (most recent first)
- Keywords with OR (URL encoded): `%22<Role1>%22%20OR%20%22<Role2>%22%20OR%20%22<Skill1>%22`

**Easy Apply flow (repeatable pattern):**
1. Snapshot of the job list -> grep `strong.*:` for titles
2. Click the job title (ref from the `strong`)
3. Snapshot -> grep `Easy Apply to` for the button
4. Click Easy Apply -> dialog opens
5. Loop: search for `Continue to next step` | `Review your application` | `Submit application` with grep, click, sleep 3
6. If there's a `textbox` with `*` (required), fill and continue
7. If there's a `combobox` with `Select an option`, select the appropriate option
8. If there are `radio` groups with `Required`, click the generic label (not the radio input)
9. If there's `Please make a selection` (alert), a radio is missing selection
10. Progress bar: 0% -> 25% -> 33% -> 50% -> 67% -> 75% -> 100% (varies per form)
11. At 100%: `Submit application` -> click -> `Your application was sent to <company>!`

**Common question types and where to get the answers:**
- Years of experience with [tech]: `users.data.form_answers.<tech>_experience`
- Language level: `users.data.form_answers.english_level` / `spanish_level`
- Current location: `users.data.form_answers.location`
- Current company: `users.data.form_answers.current_company`
- LinkedIn URL: `users.data.form_answers.linkedin_url`
- Salary expectation: `users.data.form_answers.salary_usd` / `salary_cop` / `salary_usd_max`
- Availability: `users.data.form_answers.notice_period` / `availability_date`
- Consent/privacy: always accept
- Diversity/accessibility: `users.data.form_answers.diversity_*` (accessibility, gender, ethnicity)
- Disability: `users.data.form_answers.disability`
- GenAI tools experience: `users.data.form_answers.genai_tools`
- AWS experience: `users.data.form_answers.aws_experience`
- English comfort (open text): `users.data.form_answers.english_comfort`

**If a key doesn't exist in `form_answers`:** the script skips the field (doesn't invent it). The agent must stop, ask the user, save the answer to DB (`jsonb_set` on `users.data.form_answers`), then continue. Gold Rule 5c.

**Common Easy Apply pitfalls:**
- Some companies have extremely long forms (8+ steps, country-specific diversity questions). Patience, fill everything.
- Some forms have radios without a direct ref. Click the `generic` label that wraps the text ("Yes", "No").
- Some forms have `combobox` that appear selected but aren't. Verify with `option.*selected`.
- The "Continue" button may not advance if there are errors. Always grep `Please make a selection` | `Please enter a valid answer` | `Required` after each click.
- Some forms open a file chooser when clicking "Attach". Use `playwright-cli upload <path>` immediately.

### Gmail

#### List conversations

```
URL: https://mail.google.com/mail/u/0/#all (use #all, not #inbox -- inbox primary tab is nearly empty)
Row selector: tr.zA (read), tr.zE (unread)
Fields: .yW .zF or .yW span[email] for sender, .bog for subject, .xW.xY span[title] for date, .y2 for snippet
```

```js
goto('https://mail.google.com/mail/u/0/#all');
waitFor('document.querySelectorAll("tr.zA").length > 5', { timeout: 10000 });
const emails = evalJSON(`(function(){
  const rows = document.querySelectorAll('tr.zA');
  return JSON.stringify(Array.from(rows).slice(0, 20).map(r => ({
    from: r.querySelector('.yW .zF, .yW span[email]')?.getAttribute('email') || '',
    name: r.querySelector('.yW .zF, .yW span[email]')?.getAttribute('name') || '',
    subject: r.querySelector('.bog')?.textContent || '',
    date: r.querySelector('.xW.xY span[title]')?.getAttribute('title') || '',
    unread: r.classList.contains('zE'),
    snippet: r.querySelector('.y2')?.textContent || '',
  })));
})()`);
```

#### Read job alerts label

```
URL: https://mail.google.com/mail/u/0/#label/Job%20Alerts
Search: label:job-alerts
Note: display name "Job Alerts" (space), URL uses %20, search uses dash
```

```js
goto('https://mail.google.com/mail/u/0/#label/Job%20Alerts');
waitFor('document.querySelector("div[role=main]")?.innerText.includes("Job Alerts") || document.querySelectorAll("tr.zA").length > 0', { timeout: 8000 });
const alerts = evalJSON(`(function(){
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
})()`);
```

#### Delete emails (trash)

The delete button is `div.nX` with `aria-label="Eliminar"`. Simple click
doesn't always work. Use mousedown -> click ->mouseup sequence.

```js
// Select all matching a search query
goto('https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(query));
waitFor('document.querySelectorAll("tr.zA").length > 0', { timeout: 10000 });

// Select all
evalJS(`(function(){
  const cb = document.querySelector('div[role="checkbox"]');
  if (cb) { cb.click(); return 'selected'; }
  return 'not_found';
})()`);

// Click "select all that match" if it appears
evalJS(`(function(){
  const links = document.querySelectorAll('a, span');
  for (const l of links) {
    if (l.textContent.includes('Seleccionar todas') || l.textContent.includes('Select all')) {
      l.click(); return 'clicked';
    }
  }
  return 'not_found';
})()`);

// Delete with proper event sequence
evalJS(`(function(){
  const btn = document.querySelector('div.nX[aria-label="Eliminar"], div.nX[aria-label="Delete"]');
  if (!btn) return 'not_found';
  const mde = new MouseEvent('mousedown', { bubbles: true });
  const clk = new MouseEvent('click', { bubbles: true });
  const mue = new MouseEvent('mouseup', { bubbles: true });
  btn.dispatchEvent(mde);
  btn.dispatchEvent(clk);
  btn.dispatchEvent(mue);
  return 'deleted';
})()`);
```

#### Compose and send email (validated empirically 2026-08-10)

Gmail compose is **NOT** an iframe. It is `div[role=dialog]` in the main
document, so `playwright-cli` can access all elements directly. The earlier
claim that compose is a cross-origin iframe was **false** and has been
corrected.

**Compose selectors (Spanish UI, English equivalents noted):**

| Field | Selector | Notes |
|---|---|---|
| To (recipients) | `input[role=combobox][aria-label="Destinatarios"]` | English: `aria-label="To"` |
| Subject | `input[aria-label="Asunto"]` | English: `aria-label="Subject"` |
| Body | `textarea[aria-label="Cuerpo del mensaje"]` | English: `aria-label="Message body"`. NOT a contenteditable div |
| Send button | `div[role=button][aria-label*="Enviar"]` | English: `aria-label*="Send"` |

**Critical: use native value setter for inputs.** React-controlled inputs
don't react to `.value = "..."` alone. You must use the native setter and
dispatch an `input` event:

```js
evalJS(`(function(){
  const toInput = document.querySelector('input[role=combobox][aria-label="Destinatarios"]');
  if (!toInput) return 'to_not_found';
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(toInput, 'RECIPIENT_EMAIL');
  toInput.dispatchEvent(new Event('input', { bubbles: true }));
  toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'to_set';
})()`.replace('RECIPIENT_EMAIL', recipient));
```

**Subject and body use the same native setter pattern** (body is a `textarea`,
so use `HTMLTextAreaElement.prototype` setter).

**Send button requires mousedown -> click -> mouseup sequence** (plain `.click()`
is unreliable):

```js
evalJS(`(function(){
  const btn = document.querySelector('div[role=button][aria-label*="Enviar"]');
  if (!btn) return 'send_not_found';
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return 'sent';
})()`);
```

**Verify send:** wait for the toast "Mensaje enviado" (English: "Message sent")
or any `div[role=alert]` containing "enviado"/"sent":

```js
waitFor(`(function(){
  const alerts = document.querySelectorAll('div[role=alert], span[role=alert]');
  for (const a of alerts) {
    if (a.textContent.includes('enviado') || a.textContent.includes('sent')) return true;
  }
  return false;
})()`, { timeout: 10000 });
```

#### Reply to an email (validated empirically 2026-08-10)

Reply is different from compose. The reply body **IS** a contenteditable div
(unlike compose which uses a textarea).

**Reply selectors:**

| Field | Selector | Notes |
|---|---|---|
| Reply button | `button[aria-label="Responder"]` | English: `aria-label="Reply"` |
| Reply body | `div[contenteditable=true]` | IS contenteditable (different from compose) |
| Reply Send | `div[role=button][aria-label="Enviar y archivar"]` | English: `aria-label="Send & archive"`. Different from compose Send |

```js
// 1. Click Reply button
evalJS(`(function(){
  const btn = document.querySelector('button[aria-label="Responder"], button[aria-label="Reply"]');
  if (!btn) return 'reply_not_found';
  btn.click();
  return 'reply_clicked';
})()`);

// 2. Wait for contenteditable body to appear
waitForSelector('div[contenteditable=true]', { timeout: 5000 });

// 3. Fill reply body (contenteditable, so use innerText + InputEvent)
evalJS(`(function(){
  const el = document.querySelector('div[contenteditable=true]');
  if (!el) return 'body_not_found';
  el.focus();
  el.innerText = 'REPLY_TEXT';
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'REPLY_TEXT' }));
  return 'body_set';
})()`.replace(/REPLY_TEXT/g, replyText));

// 4. Send reply (different aria-label from compose!)
evalJS(`(function(){
  const btn = document.querySelector('div[role=button][aria-label="Enviar y archivar"], div[role=button][aria-label="Send & archive"]');
  if (!btn) return 'send_not_found';
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return 'sent';
})()`);
```

### Teamtailor

**Do not use the browser.** Use the HTTP API directly.
See `scripts/templates/teamtailor-apply.md` for the POST flow.

### External ATS playbooks (discovered)

**Teamtailor (<company>, etc.):**
- Flow: GET job -> `Apply with LinkedIn` auto-fills name/email/photo/CV -> fill custom questions -> submit -> email verification -> click verification link -> done
- `scripts/templates/teamtailor-apply.md` has the POST `/applications` structure for replay if needed
- After first successful application, create a Connect profile. Future applications at the same company auto-fill.

**Humand.co (<company>, etc.):**
- Flow: GET `/jobs/<id>/apply` -> guest session -> upload CV to S3 -> POST `/api/jobs/apply` -> thank you page
- `scripts/templates/humand-apply.md` has the JSON API structure
- Fields: first_name, last_name, phone, email, birth_date, resume, LinkedIn URL, consent

**CV upload via browser wrapper:**
- Some ATS file inputs are not visible; `exec upload` only works when a file chooser modal is open
- If direct upload fails, click the file chooser button first, then `exec upload <cv_path>`
- If that still fails, the input may be generated by JS; take a snapshot and look for `input[type=file]` or drag-and-drop areas

### Outreach strategy by effectiveness order

1. **Easy Apply + direct email** (most effective): Easy Apply on LinkedIn Jobs + email to recruiter if the post has contact
2. **Direct email with CV** (high): when there's a visible email in a LinkedIn post
3. **Connection request without note** (medium): when there's no email, but can connect
4. **Connection request with note** (high but limited): mentioning a relevant project or blog post from the user. LinkedIn limits custom notes per week
5. **Easy Apply only** (medium): fast but less personalized

**Effective email structure (validated):**
- Subject: `Application - <Role> - <Name>` (use the language of the post)
- Body: 3-4 short paragraphs, conversational, not formal
- Mention: specific relevant experience from the JD, concrete achievements with numbers (e.g: impact metrics from the user's previous projects)
- Include: LinkedIn URL (`users.data.form_answers.linkedin_url`), blog URL (`users.data.form_answers.blog_url`) if relevant to the JD
- Always attach CV
- No bullet points, no em-dashes, don't repeat JD keywords obviously
- Pass through Gold Rule 7 (anti-LLM checklist) before sending

### User data for forms

All personal data lives in the DB, not in this file. The agent and scripts read it from:

| Data | DB location |
|---|---|
| Name, email, phone, CV path | `users.data.profile` (full_name, email, phone, cv_path) |
| Address, city, country | `users.data.personal_info` (address, city, state, country, postal_code) |
| Salary, availability, preferences | `users.data.job_preferences` (salary, availability, modalities, etc.) |
| Easy Apply form answers | `users.data.form_answers` (see keys above) |
| LinkedIn URL, blog URL | `users.data.form_answers.linkedin_url`, `form_answers.blog_url` |

**Never hardcode personal data in scripts, AGENTS.md, or any repo file.** Everything goes to DB. Gold Rule 5c. Use `<Role>`, `<City>`, `<Your Name>` placeholders in docs.

### DB registration

**`applications` table columns:** `id, user_id, platform, company, role, url, status, applied_at, data`

**Platforms used:**
- `linkedin` = Easy Apply jobs
- `linkedin_invite` = connection requests
- `email` = direct emails to recruiters
- `teamtailor` = applications via Teamtailor (with LinkedIn auth, email verification, Connect)
- `humand` = applications via Humand.co
- `<company>_career_site`, etc. = specific career sites

**Status values (pipeline stages, canonical):**

Active stages (left to right in the kanban):
- `discovered` = found but no action taken
- `contacted` = invite/email sent, no formal application
- `applied` = application submitted
- `in_review` = company reviewing, no response
- `screening` = screening call scheduled/done
- `interview` = technical interview in progress
- `offer` = offer received, negotiating
- `hired` = accepted, starting

Closed stages (shown with `--closed`):
- `rejected` = company rejected
- `withdrawn` = user withdrew
- `skipped` = decided not to apply / not a fit

**Pipeline kanban:** `node scripts/pipeline.js` prints the board. See "Script reference" below.

**data JSONB:** include `source`, `match` (high/medium/low), `location`, `tech` array, and any relevant metadata

### Timing and batch size

- An apply session can process 7-10 Easy Apply jobs in ~30 min
- Connection requests: 8-10 per session (avoid LinkedIn limits)
- Direct emails: 4-5 per session (each takes ~2 min with attachment)
- Effective total per session: 15-20 application/contact actions
- Some companies have very long forms that take ~10 min each. The rest take 2-5 min each

## 6. Email delivery

### SMTP is preferred (reliability + speed)

SMTP via `nodemailer` is the **preferred** method for sending outbound email. It has no UI dependency, is faster, and more reliable than browser automation.

1. Generate an app password in the provider (e.g., Gmail: https://myaccount.google.com/apppasswords)
2. Add to `.env` (never commit `.env`):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=you@example.com
   SMTP_PASS=your-app-password
   ```
3. Send:
   ```
   node scripts/send-email.js --to someone@example.com --subject "Subject" --body "Message"
   ```
4. For outreach to contacts in the DB, build on top of `sendEmail()` from `scripts/send-email.js` and mark `outreach_contacts.status = 'contacted'` after successful delivery.

### Browser is a fallback (when SMTP is not configured)

The browser **CAN** send emails. The earlier claim that Gmail compose is a cross-origin iframe was **false**, validated empirically on 2026-08-10. Compose is `div[role=dialog]` in the main document and all elements are accessible via `playwright-cli`.

**When to use browser email:**
- SMTP is not configured (no `.env` app password)
- SMTP fails and a fallback is needed
- The flow requires attaching a CV from the browser session

**When NOT to use browser email:**
- SMTP is available (always prefer SMTP for reliability and speed)
- Bulk sending (SMTP is much faster, no UI rendering per message)

**Browser email selectors (see "Gmail > Compose and send email" above for full code):**

Compose (new email):
- To: `input[role=combobox][aria-label="Destinatarios"]` + native value setter + Enter
- Subject: `input[aria-label="Asunto"]` + native setter
- Body: `textarea[aria-label="Cuerpo del mensaje"]` (NOT contenteditable div)
- Send: `div[role=button][aria-label*="Enviar"]` + mousedown->click->mouseup sequence
- Verify: toast "Mensaje enviado" or `div[role=alert]` containing "enviado"

Reply (different from compose):
- Reply button: `button[aria-label="Responder"]`
- Reply body: `div[contenteditable=true]` (IS contenteditable, different from compose)
- Reply Send: `div[role=button][aria-label="Enviar y archivar"]` (different label from compose)

**Gmail compose via browser (legacy pattern, for reference):**
1. `goto "https://mail.google.com/mail/u/0/#inbox"`
2. Click "Compose" button
3. Dialog appears with: combobox "Recipients" (To), textbox "Subject", textbox "Message body"
4. Fill To -> Fill Subject -> Fill Body
5. Click "Attach files" -> `playwright-cli upload <cv_path>` (file chooser modal)
6. Click "Send" -> verify "Message sent"

**CV path:** obtained from `users.data.profile.cv_path` or `users.data.personal_info.cv_pdf_path`. The `gmail-send.js` script reads it automatically from DB.

## 7. Script reference

These scripts encapsulate the repetitive patterns from the playbook. All require the browser to be open via `node scripts/browser.js open` first. They use `playwright-cli` internally.

### `scripts/linkedin-search.js` -- Search posts for job openings

Searches LinkedIn posts, extracts author + vanity + email + content preview. Filters by relevance (AI/ML keywords) and dedupes.

```bash
# Basic search (human-readable output)
node scripts/linkedin-search.js '"<Role>" "hiring" LATAM'

# Search with more scrolls and JSON output (to pipe to other scripts)
node scripts/linkedin-search.js '"<Role>" "<City>" "hiring"' --scroll 3 --json

# Validated queries:
#   '"<Role>" "hiring" LATAM'               (most productive)
#   '"<Role>" "<City>" "hiring"'      (geo-specific)
#   '"ingeniero IA" "buscamos"'                  (Spanish)
```

**Flags:** `--scroll <n>` (default 2), `--json` (raw JSON output)
**Output JSON:** `[{author, vanity, email, content}, ...]`

### `scripts/linkedin-invite.js` -- Send connection requests

Navigates to `/preload/custom-invite/?vanityName=<vanity>`, clicks "Send without a note". Anti-ban delay of 3s between invites.

```bash
# Invite one or more vanities
node scripts/linkedin-invite.js <vanity-name>

# Invite multiple
node scripts/linkedin-invite.js vanity1 vanity2 vanity3

# Search + invite in one command (pipe search -> invite)
node scripts/linkedin-invite.js --from-search '"<Role>" "hiring" LATAM'
```

**Flags:** `--from-search "<keywords>"` (searches and invites all found)
**Exit codes:** 0 = at least one sent, 1 = all failed, 2 = error

### `scripts/linkedin-easy-apply.js` -- Apply via Easy Apply

Searches jobs with Easy Apply filter, clicks, fills forms with standard answers, submits, registers in DB.

```bash
# Apply to the first 10 jobs (default)
node scripts/linkedin-easy-apply.js

# Keywords custom + limit
node scripts/linkedin-easy-apply.js --keywords '"<Role>" OR "<Skill>"' --max 5

# List only, don't apply
node scripts/linkedin-easy-apply.js --dry-run

# Output JSON
node scripts/linkedin-easy-apply.js --json
```

**Flags:** `--keywords <q>` (default: derived from DB profile.title + profile.skills), `--location <loc>` (default: from DB job_preferences.location), `--max <n>` (default 10), `--dry-run`, `--json`
**Auto-fill:** all values are read from `users.data.form_answers` (DB). The script fills: years of experience per tech, language level, location, current company, LinkedIn URL, salary, availability, GenAI tools, AWS, etc. Radios: Yes for skills, No for disability/sponsorship (configurable values in DB). Comboboxes: English/Spanish level, seniority (from DB).
**Captcha:** detects and stops with exit 1 + message. Never attempts to solve.
**DB:** registers each application with `platform='linkedin'`, `status='applied'`.

### `scripts/gmail-send.js` -- Send emails with CV attached

Opens Gmail compose, fills To/Subject/Body, attaches CV, sends. Supports CC/BCC and body from file.

```bash
# Basic email with CV attached
node scripts/gmail-send.js \
  --to recruiter@company.com \
  --subject "Application - <Role> - <Your Name>" \
  --body "Hi, I saw your post on LinkedIn..."

# Email without CV
node scripts/gmail-send.js --to email@x.com --subject "..." --body "..." --no-cv

# Body from file
node scripts/gmail-send.js --to email@x.com --subject "..." --body-file templates/email-ai-engineer.txt

# Multiple recipients + CC
node scripts/gmail-send.js --to a@x.com,b@x.com --cc c@x.com --subject "..." --body "..."
```

**Flags:** `--to <emails>` (required, comma-separated), `--subject <text>` (required), `--body <text>`, `--body-file <path>`, `--cv <path>` (default: from DB profile.cv_path), `--no-cv`, `--cc <emails>`, `--bcc <emails>`
**UI:** supports Gmail in Spanish (Redactar/Asunto/Cuerpo/Enviar/Adjuntar) and English (Compose/Subject/Body/Send/Attach)
**CV path:** read from DB (users.data.profile.cv_path or personal_info.cv_pdf_path)

### `scripts/send-email.js` -- Send emails via SMTP (preferred)

Uses `nodemailer` with SMTP app password. No browser dependency. Faster and more reliable than `gmail-send.js`.

```bash
node scripts/send-email.js --to someone@example.com --subject "Subject" --body "Message"
```

Requires SMTP credentials in `.env` (see "Email delivery" section above).

### `scripts/pipeline.js` -- Pipeline kanban board

The kanban board for tracking applications and contacts. Unifies LinkedIn invites, direct emails, and formal applications into a single pipeline with canonical stages.

```bash
# Full board (active cards)
node scripts/pipeline.js

# Include closed (rejected, withdrawn, skipped)
node scripts/pipeline.js --closed

# Funnel summary (counts per stage)
node scripts/pipeline.js --funnel

# Filter by stage
node scripts/pipeline.js --stage interview

# Filter by company
node scripts/pipeline.js --company <company>

# Move a card to another stage (updates status + adds to stage_history)
node scripts/pipeline.js --move 82 interview

# View card detail (with linked messages via application_id)
node scripts/pipeline.js --card 82
```

**Canonical stages (ordered):** `discovered` -> `contacted` -> `applied` -> `in_review` -> `screening` -> `interview` -> `offer` -> `hired`. Closed: `rejected`, `withdrawn`, `skipped`.

**When the agent moves cards:** when it detects a status change (recruiter replies, interview scheduled, rejection), it uses `pipeline.js --move <id> <stage>` instead of a direct UPDATE. This maintains the audit trail in `data.stage_history`.

### Full pipeline in one command

```bash
# 1. Ensure browser is open with LinkedIn session
node scripts/browser.js open "https://www.linkedin.com"

# 2. Search posts, extract contacts, invite all
node scripts/linkedin-invite.js --from-search '"<Role>" "hiring" LATAM'

# 3. Apply via Easy Apply to 10 jobs
node scripts/linkedin-easy-apply.js --max 10

# 4. For posts with visible email, send email with CV
node scripts/linkedin-search.js '"<Role>" "hiring" LATAM' --json | \
  jq -r '.[] | select(.email) | "--to \(.email) --subject \"Application - <Role>\" --body \"Hi \(.author), I saw your post...\""' | \
  xargs -I {} node scripts/gmail-send.js {}
```

### When NOT to use scripts (manual mode)

- Easy Apply forms with complex open-ended questions (e.g: "Describe your experience with <tech> in 300 words") that require personalized answers
- LinkedIn posts that require analyzing the content to decide whether to apply (ambiguous match)
- Emails to recruiters who already replied (use Gold Rule 6: draft + approval)
- Custom career sites (Lever, Greenhouse, Workday) that aren't LinkedIn Easy Apply
- Situations that require captcha (Gold Rule 5b: stop and ask the user)

## 8. Anti-patterns (do NOT do these)

1. **Do not use shell `sleep` between browser commands.** It kills the session.
   Use `waitFor()` with in-page polling instead.

2. **Do not click refs from a previous snapshot.** Refs are per-snapshot.
   Use `clickByText()` or `evalJS()` with DOM queries instead.

3. **Do not rely on `exec snapshot` alone.** It fails when the session is
   briefly busy. Use `snapshotReliable()` which falls back to the snapshot file.

4. **Do not use `killAllSessions()` when one session is zombie.** It destroys
   all sessions including healthy ones from other workers. The fixed
   `getHealthySession()` now closes only the zombie session.

5. **Do not navigate to Gmail `#inbox` expecting all emails.** Gmail splits
   into categories (Primary, Promotions, Notifications). Use `#all` or
   specific labels.

6. **Do not verify SPA navigation by URL change.** LinkedIn and Gmail update
   content without changing the URL. Verify by checking DOM content.

7. **Do not assume Gmail compose is a cross-origin iframe.** It is not. Compose
   is `div[role=dialog]` in the main document and fully accessible. The
   cross-origin iframe claim was false (validated 2026-08-10).

8. **Do not split wait + click + verify into separate CLI calls.** Batch them
   into a single `eval` call (Rule 6). Separate calls risk session death and
   add latency.

9. **Do not call `playwright-cli open` directly.** Always use
   `node scripts/browser.js open` (Gold Rule 10). The wrapper guarantees
   profile isolation, mode preference, and session health checks.

## Helper library

All patterns above use `lib/browser-helpers.js`:

```js
const {
  goto, evalJS, evalJSON, clickByText,
  waitFor, waitForSelector, waitForText,
  snapshotReliable, dismissModals,
  dbQuery, dbWrite,
  // Atomic helpers (prevent session death between calls)
  openAndEval, openAndEvalJSON,
  gotoAndEval, gotoAndEvalJSON,
} = require('./lib/browser-helpers');
```

### Atomic helpers (Rule 6 + chaining)

These helpers chain `open/goto + eval` in a single shell command to prevent
session death between calls. Use them instead of separate `goto()` + `evalJS()`.

```js
// Open browser + extract in one call (no session death risk)
const jobs = openAndEvalJSON(
  'https://www.linkedin.com/jobs/search/?keywords=...',
  `(function(){ ... return JSON.stringify(...); })()`,
  { session: 'my-session', headed: true }
);

// Navigate + extract in one call (browser already open)
const emails = gotoAndEvalJSON(
  'https://mail.google.com/mail/u/0/#all',
  `(function(){ ... return JSON.stringify(...); })()`,
  { session: 'my-session' }
);
```
