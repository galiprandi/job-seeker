---
name: browser-automation
description: Control a dedicated browser via playwright-cli for web automation. Covers the safe wrapper, golden rules for reliability, tab parallelization, snapshots, eval, and all core commands. Includes app-specific guides for Gmail, LinkedIn, and more. Use when automating any web app.
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*) Bash(node:*)
---

# Browser Automation

Control a dedicated Chromium browser via `playwright-cli` from the terminal. Token-efficient: commands return concise output, not verbose accessibility trees.

## App guides (LOAD BEFORE interacting with a specific app)

Before automating a specific web app, **read the corresponding guide** in `apps/`. These guides contain validated selectors, event sequences, and gotchas that save you from trial-and-error.

| App | Guide | When to load |
|---|---|---|
| Gmail | `apps/gmail.md` | Before any Gmail operation (compose, reply, read inbox, search, delete) |
| LinkedIn | `apps/linkedin.md` | Before any LinkedIn operation (messaging, connections, jobs, Easy Apply, notifications) |
| Microsoft Teams | `apps/teams.md` | Before any Teams operation (send/delete messages via chatsvc API, token extraction) |
| Jira | `apps/jira.md` | Before any Jira operation (create issue, add comment, transition status) |
| Teamtailor | `apps/teamtailor.md` | Before applying to jobs on Teamtailor-based career sites |
| Humand.co | `apps/humand.md` | Before applying to jobs on Humand.co-based career sites |

**How to load:** read the file with your read tool. Example: `read .agents/skills/browser-automation/apps/gmail.md`

**Check for existing scripts first:** the consuming repo may already have scripts that wrap common operations (e.g. `scripts/linkedin-inbox.js`, `scripts/send-email.js`). Run `ls scripts/` to see what's available. **Prefer existing scripts over manual UI automation** — they're faster, more reliable, and handle edge cases. The app guides list common scripts to look for.

**NEVER edit scripts to hardcode personal data.** Scripts should auto-detect values at runtime or accept them as arguments. If a script has a placeholder like `<YOUR_FSD_PROFILE_ID>`, it's a bug — fix the script to auto-detect, don't replace the placeholder with a real value. Hardcoding personal data in tracked files violates repo portability.

**If the app you need is not listed:** use the generic patterns in this file. Consider creating a new `apps/<name>.md` guide after validating your approach.

## Setup

### Install

```bash
npm install -g @playwright/cli@latest
playwright-cli install-browser        # downloads chromium
```

### Profile directory (NEVER commit)

Use a persistent profile to preserve cookies/logins across sessions. Always gitignore it.

```bash
# Create a profile dir at repo root (or anywhere outside git tracking)
mkdir -p .browser-profile

# Add to .gitignore IMMEDIATELY
echo ".browser-profile/" >> .gitignore
echo ".playwright-cli/" >> .gitignore
echo "*.session-state.json" >> .gitignore
echo ".browser-config.json" >> .gitignore

# Open with persistent profile
playwright-cli open "https://example.com" --persistent --profile ./.browser-profile
```

**Rules:**
- Profile dir contains cookies, localStorage, session data. NEVER commit it.
- If you clone a repo, create the profile dir fresh. Never share profiles.
- Use `--headed` for manual login (captchas, 2FA). Default is headless.

### The safe wrapper (recommended)

The wrapper script (`scripts/browser.js` in this skill) guarantees the profile is always used, prevents race conditions, manages parallel sessions, and reads browser mode from config. **Always use the wrapper for open/goto/close.** Never call `playwright-cli open` directly.

Copy the wrapper to your repo:

```bash
# After installing this skill, copy the wrapper to your repo's scripts/ dir
cp .agents/skills/browser-automation/scripts/browser.js scripts/browser.js
```

Create a config file (optional, defaults to headless):

```bash
# .browser-config.json in your repo root
echo '{"browser_mode": "headed_logins_only"}' > .browser-config.json
```

Config resolution for `browser_mode` (headed vs headless):
1. `--headed` / `--headless` flag passed to `open`
2. `.browser-config.json`: `{ "browser_mode": "headed" }`
3. `BROWSER_MODE` environment variable
4. Default: `headless`

Mode values:
- `headless` — always headless
- `headed` — always headed (visible browser)
- `headed_logins_only` — headless by default, caller passes `--headed` for manual logins

```bash
# Core commands (always use the wrapper for these)
node scripts/browser.js open <url> [--headed|--headless] [--session <name>]
node scripts/browser.js goto <url> [--tab <name>] [--session <name>]
node scripts/browser.js close [--session <name>] [--force]
node scripts/browser.js close-all [--force]
node scripts/browser.js ensure [--session <name>]

# Tab management (wrapper commands, NOT exec)
node scripts/browser.js tab-list
node scripts/browser.js tab-new <url> --name <name>
node scripts/browser.js tab-select <name>
node scripts/browser.js tab-close <name>

# Passthrough to playwright-cli (for click, fill, snapshot, eval, etc.)
# "exec" forwards the REST of the args to playwright-cli.
# DO NOT write "playwright-cli" again. DO NOT wrap the command in quotes.
# Just write the subcommand name and its args directly after "exec".
node scripts/browser.js exec snapshot
node scripts/browser.js exec click <ref>
node scripts/browser.js exec fill <ref> "text"
node scripts/browser.js exec eval "js expression"
node scripts/browser.js exec find "text to search"
node scripts/browser.js exec press Enter
node scripts/browser.js exec screenshot --filename=page.png

# WRONG — these all fail:
#   node scripts/browser.js exec "playwright-cli tab-list"    (don't write playwright-cli)
#   node scripts/browser.js exec "playwright-cli snapshot"    (don't write playwright-cli)
#   node scripts/browser.js exec "click '[data-tooltip=Redactar]'"  (don't quote the command)
#   node scripts/browser.js exec "snapshot"                   (don't quote the command)
# CORRECT:
#   node scripts/browser.js exec snapshot
#   node scripts/browser.js exec click <ref>
#   node scripts/browser.js exec tab-list                     (playwright-cli tab-list via exec)

# Sessions for parallel subagents
node scripts/browser.js attach --session <name>
node scripts/browser.js detach --session <name>
node scripts/browser.js who                         # list active attached agents

# Tab management
node scripts/browser.js tab-new <url> --name <name> [--session <name>]
node scripts/browser.js tab-select <name> [--session <name>]
node scripts/browser.js tab-close <name> [--session <name>]
node scripts/browser.js tab-close-all [--session <name>]
node scripts/browser.js tab-list [--session <name>] [--json]

# Auth state persistence
node scripts/browser.js save-state [--filename <path>] [--session <name>]
node scripts/browser.js load-state [--filename <path>] [--session <name>]

# Debugging
node scripts/browser.js dashboard
node scripts/browser.js trace-start [--session <name>]
node scripts/browser.js trace-stop [--session <name>]
node scripts/browser.js video-start [--filename <path>] [--session <name>]
node scripts/browser.js video-stop [--session <name>]
node scripts/browser.js console [level] [--session <name>]
node scripts/browser.js requests [--session <name>]
node scripts/browser.js request <index> [--session <name>]

# Info
node scripts/browser.js list
node scripts/browser.js status
```

**Key wrapper behaviors:**
- `--profile=.browser-profile` is hardcoded. Cannot be omitted.
- If a session is already running, `open` auto-navigates instead of failing.
- Lockfile prevents race conditions when multiple processes open the browser.
- Health check detects zombie sessions before reuse.
- Ref-count prevents one agent from killing the browser while others work.
- For all playwright-cli commands (click, fill, snapshot, eval) use `exec` or call `playwright-cli` directly AFTER opening via the wrapper.

### Headed vs headless

```bash
# Headless (default) — for automation
node scripts/browser.js open "https://example.com"

# Headed — for manual login, captcha solving, visual debugging
node scripts/browser.js open "https://example.com" --headed
```

When a session expires or a captcha appears: open headed, let the user log in manually, save state, then continue headless. See [references/profile-management.md](references/profile-management.md).

## Golden rules (validated empirically)

These rules were validated through extensive testing. Breaking them causes failure.

### Rule 1: eval > ref-based clicks

Refs (`[ref=e123]`) are per-snapshot and **do not persist** between separate `playwright-cli` CLI calls. A ref from one `snapshot` call is invalid by the next `click` call.

**Wrong:**
```
snap = snapshot()
ref = findRef(snap, "Message")
clickRef(ref)  # may fail, ref may be stale
```

**Right:**
```bash
# Use eval to find and click by text in one atomic call
node scripts/browser.js exec eval "(function(){
  const els = document.querySelectorAll('a, button, [role=\"link\"]');
  for (const el of els) {
    if (el.textContent.includes('Message')) { el.click(); return 'clicked'; }
  }
  return 'not_found';
})()"
```

### Rule 2: In-page polling > shell sleep

Shell `sleep` between browser commands kills the playwright-cli daemon session. The session dies within 5-10 seconds of inactivity.

**Wrong:**
```bash
node scripts/browser.js goto "https://example.com"
sleep 4                        # session may die here
node scripts/browser.js exec snapshot        # fails: "No active session"
```

**Right:**
```bash
# Use eval with in-page polling (keeps connection alive)
node scripts/browser.js goto "https://example.com"
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('div.target-element')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

**Exception:** Very short sleeps (1-2s) within a single shell command using `&&` chaining are safe. The session stays alive as long as the shell process is running.

### Rule 3: Read snapshot file as fallback

When `exec snapshot` fails (session briefly busy), the `open`/`goto` commands auto-generate a snapshot YAML file in `.playwright-cli/`. Read it directly.

```bash
# Try exec snapshot first
node scripts/browser.js exec snapshot
# If it fails, read the latest snapshot file
ls -t .playwright-cli/page-*.yml | head -1 | xargs cat
```

### Rule 4: Use URLs directly, not clicks for navigation

Navigating to a specific URL is more reliable than clicking navigation links.

**Wrong:** Click "Messaging" icon in header
**Right:** `node scripts/browser.js goto "https://www.linkedin.com/messaging/"`

**Wrong:** Click "Saved Jobs" menu item
**Right:** `node scripts/browser.js goto "https://www.linkedin.com/jobs-tracker/?stage=saved"`

### Rule 5: Verify with DOM content, not URL

SPAs (LinkedIn, Gmail, React apps) update the right panel without changing the URL.

**Wrong:** Check if URL changed after clicking a conversation
**Right:** Check if the target container exists and matches expected content

```bash
node scripts/browser.js exec eval "(function(){
  const panel = document.querySelector('.msg-s-message-list-container');
  const header = document.querySelector('h2');
  if (panel && header && header.textContent.includes('Person Name')) return 'ok';
  return 'not_loaded';
})()"
```

### Rule 6: Batch operations into a single eval call

Doing wait + click + verify in one `eval` call is more robust than multiple separate CLI calls. Each separate call risks session death between steps and adds latency.

**Wrong:**
```bash
node scripts/browser.js exec eval "document.querySelector('#btn')"
node scripts/browser.js exec eval "document.querySelector('#btn').click()"
node scripts/browser.js exec eval "document.querySelector('#result')"
```

**Right:**
```bash
node scripts/browser.js exec eval "(function(){
  const btn = document.querySelector('#btn');
  if (!btn) return 'not_found';
  btn.click();
  const result = document.querySelector('#result');
  return result ? result.textContent : 'no_result';
})()"
```

### Chaining: open + eval in a single shell command

Chain `open && eval` in a single shell command to prevent session death between calls.

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

## Core commands

### Open / navigate / close

```bash
playwright-cli open [url]              # open browser (headless by default)
playwright-cli open [url] --headed     # open visible browser
node scripts/browser.js goto <url>              # navigate current tab
playwright-cli go-back                 # browser back button
playwright-cli go-forward              # browser forward button
playwright-cli reload                  # reload page
playwright-cli close                   # close browser
```

### Snapshot (the most important command)

```bash
node scripts/browser.js exec snapshot                # capture page structure with element refs
node scripts/browser.js exec snapshot <ref>          # snapshot a specific element (smaller output)
node scripts/browser.js exec snapshot "#main"        # snapshot a CSS selector
```

Returns a tree of the page with `[ref=eXXX]` identifiers. Use these refs for click/fill/select. **Always take a fresh snapshot or find before interacting** — refs change after any page mutation.

**Warning:** Full snapshots of complex SPAs (Gmail, LinkedIn, Facebook) are HUGE and get truncated in the output. Prefer `find` or snapshot a specific element instead.

### Find (search for elements — PREFERRED over full snapshot)

```bash
node scripts/browser.js exec find "text"             # search for text, returns matching elements with refs
node scripts/browser.js exec find "regex"            # search with regex
node scripts/browser.js exec find --regex "/sign (in|up)/i"  # with flags
```

Returns matching nodes with refs. Much smaller output than a full snapshot. **Use this as your primary way to locate elements on complex pages.**

### Interact

```bash
node scripts/browser.js exec click <ref>             # click an element
node scripts/browser.js exec click <ref> right       # right-click
node scripts/browser.js exec dblclick <ref>          # double-click
node scripts/browser.js exec fill <ref> "text"       # fill input/textarea (replaces content)
node scripts/browser.js exec fill <ref> "text" --submit  # fill + press Enter
node scripts/browser.js exec type "text"             # type into focused element (appends)
node scripts/browser.js exec select <ref> "value"    # select dropdown option
node scripts/browser.js exec check <ref>             # check checkbox/radio
node scripts/browser.js exec uncheck <ref>           # uncheck checkbox
node scripts/browser.js exec hover <ref>             # hover over element
node scripts/browser.js exec press Enter             # press keyboard key
node scripts/browser.js exec upload <file>           # upload file to file chooser
node scripts/browser.js exec drag <startRef> <endRef>  # drag and drop
```

### Eval (run JavaScript in page context)

```bash
# Simple expression
node scripts/browser.js exec eval "() => document.title"

# Access DOM
node scripts/browser.js exec eval "() => document.querySelector('h1')?.textContent"

# Run inline IIFE for complex logic
node scripts/browser.js exec eval "(function(){ return JSON.stringify({url: location.href, title: document.title}) })()"

# Eval on a specific element (ref becomes 'element' inside)
node scripts/browser.js exec eval "() => element.textContent" <ref>

# Async eval (fetch with cookies)
node scripts/browser.js exec eval "(async () => { const r = await fetch('/api/data'); return JSON.stringify(await r.json()) })()"
```

Eval runs in the page context with all cookies. Use it for:
- Extracting data not visible in snapshots
- Calling site APIs (fetch with cookies)
- Checking page state (URL, title, DOM)
- Clicking by text (more reliable than ref-based clicks, see Rule 1)
- Waiting for elements (in-page polling, see Rule 2)

### Screenshot / PDF

```bash
node scripts/browser.js exec screenshot              # full page screenshot
node scripts/browser.js exec screenshot <ref>        # screenshot specific element
node scripts/browser.js exec screenshot --filename=page.png
node scripts/browser.js exec pdf --filename=page.pdf # save page as PDF
```

## Tab management (parallelization)

There are TWO tab systems. Don't mix them:

### 1. Wrapper named tabs (RECOMMENDED — use `--tab` flag)

The wrapper manages named tabs. You create a tab with a name, then target it with `--tab <name>` on any command. No need to tab-select before each command.

```bash
# Create named tabs (from the wrapper, not exec)
node scripts/browser.js tab-new "https://gmail.com" --name gmail
node scripts/browser.js tab-new "https://linkedin.com" --name linkedin

# Run commands on a specific tab WITHOUT switching to it first
node scripts/browser.js exec snapshot --tab gmail
node scripts/browser.js exec eval "() => document.title" --tab linkedin
node scripts/browser.js exec find "Compose" --tab gmail

# List named tabs
node scripts/browser.js tab-list

# Close a named tab
node scripts/browser.js tab-close gmail
```

**Key advantage:** `--tab <name>` targets the tab directly. You don't need to `tab-select` before each command. The wrapper handles switching automatically.

### 2. Playwright-cli index tabs (fallback — use tab-select)

Playwright-cli manages tabs by index (0, 1, 2...). You must `tab-select` before each command.

```bash
node scripts/browser.js exec tab-new "https://linkedin.com"   # creates tab at next index
node scripts/browser.js exec tab-list                          # shows indices
node scripts/browser.js exec tab-select 1                      # switch to tab 1
node scripts/browser.js exec snapshot                          # runs on current tab (1)
node scripts/browser.js exec tab-close 1                       # close tab 1
```

**Don't use `--tab 1` with the wrapper** — the wrapper expects a NAME (from `tab-new --name`), not an index. If you didn't create a named tab, use `tab-select` instead.

### Which to use?

- **Named tabs (`--tab gmail`):** for parallel work across sites. Each command targets its tab directly. No switching needed.
- **Index tabs (`tab-select 0`):** for sequential work where you manually switch between tabs.

For the full parallel subagent pattern with named tabs and sessions, see [references/parallel-agents.md](references/parallel-agents.md).

## Session management (subagents)

**IMPORTANT: parallel browser work is counterproductive.** Tested empirically: running multiple subagents simultaneously on the same browser causes interference (commands execute on the wrong tab, agents fight over the active tab).

**Recommended pattern:** one tab per app, SEQUENTIAL work. Don't run browser subagents in parallel.

```bash
# Open one tab per app (upfront)
node scripts/browser.js open "https://mail.google.com" --headless
node scripts/browser.js tab-new "https://www.linkedin.com" --name linkedin

# Run subagent A (gmail) — wait for it to finish
node scripts/browser.js exec eval "..." --tab default

# Run subagent B (linkedin) — only after A is done
node scripts/browser.js exec eval "..." --tab linkedin

# Cleanup
node scripts/browser.js close-all
```

**When to use what:**
- Named tabs (`--tab gmail`): one agent working across multiple apps, sequentially — RECOMMENDED
- Sessions (`--session worker-1`): only if you truly need parallel browser access — AVOID, causes interference

See [references/parallel-agents.md](references/parallel-agents.md) for the full explanation of why parallel doesn't work and the sequential pattern.

## State persistence

### Save/load auth state

```bash
# Save cookies + localStorage after manual login
node scripts/browser.js save-state

# Load saved state in a new session
node scripts/browser.js open "https://example.com"
node scripts/browser.js load-state
```

**Workflow for sites requiring login:**
1. `node scripts/browser.js open "https://site.com" --headed`
2. User logs in manually (handles captcha, 2FA)
3. `node scripts/browser.js save-state`
4. `node scripts/browser.js close`
5. Next session: `open` then `load-state`

See [references/profile-management.md](references/profile-management.md) for full details.

### Cookies

```bash
playwright-cli cookie-list             # list all cookies
playwright-cli cookie-get <name>       # get specific cookie
playwright-cli cookie-set <name> <val> # set cookie
playwright-cli cookie-delete <name>    # delete cookie
```

## Network inspection

```bash
playwright-cli requests                 # list all network requests
playwright-cli request <index>          # full details of request N
playwright-cli request-headers <index>  # request headers only
playwright-cli request-body <index>     # request body only
playwright-cli response-headers <index> # response headers only
playwright-cli response-body <index>    # response body
```

Useful for:
- Capturing API calls sites make internally
- Extracting CSRF tokens from request headers
- Debugging failed requests

## Console

```bash
playwright-cli console                  # all console messages
playwright-cli console error            # only errors
playwright-cli console warning          # only warnings
```

## Efficiency patterns (save tokens)

**IMPORTANT: Full snapshots of complex pages (Gmail, LinkedIn, Facebook) are HUGE and get truncated.** Use these patterns instead:

**1. Use `find` to locate elements (no snapshot needed):**
```bash
node scripts/browser.js exec find "Redactar"       # find by text
node scripts/browser.js exec find "Compose"
node scripts/browser.js exec find --regex "/sign (in|up)/i"
node scripts/browser.js exec find "Easy Apply"
```
Returns matching elements with refs. Much smaller than a full snapshot.

**2. Use `eval` to check state or extract data (no snapshot needed):**
```bash
node scripts/browser.js exec eval "() => document.title"
node scripts/browser.js exec eval "() => document.querySelector('h1')?.textContent"
node scripts/browser.js exec eval "() => document.querySelectorAll('tr.zA').length + ' emails'"
```

**3. If you need a snapshot, use `find` first to narrow down, then snapshot a specific element:**
```bash
node scripts/browser.js exec find "Redactar"       # get the ref
node scripts/browser.js exec snapshot <ref>        # snapshot just that element
```

**4. Only use full snapshots on simple pages or when you need to understand the overall structure:**
```bash
node scripts/browser.js exec snapshot              # full snapshot (avoid on complex pages)
```

**Fill + submit in one command:**
```bash
node scripts/browser.js exec fill e15 "search term" --submit   # fill + press Enter atomically
```

**Detect errors without snapshots:**
```bash
node scripts/browser.js console error    # check for JS errors
node scripts/browser.js requests         # check for failed network requests
```

**Extract data with eval + fetch (avoid UI navigation):**
```bash
node scripts/browser.js exec eval "(async () => { const r = await fetch('/api/data'); return JSON.stringify(await r.json()) })()"
```

## Key patterns

### Always get fresh refs before interacting

Refs (`[ref=eXXX]`) change after every action (click, fill, navigate, even async updates). Never reuse a ref from a previous snapshot or find.

```bash
node scripts/browser.js exec find "Compose"    # get fresh ref
node scripts/browser.js exec click <ref>       # use ref from THIS find
# ref is now stale, get a new one
node scripts/browser.js exec find "To"         # get fresh ref
node scripts/browser.js exec fill <ref> "text" # use new ref
```

### Wait for page load

After `goto` or `click` that triggers navigation, use in-page polling (Rule 2):

```bash
node scripts/browser.js goto "https://example.com"
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('[data-loaded]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

For SPA navigation (URL doesn't change but content updates), use `eval` to check:

```bash
node scripts/browser.js exec eval "() => document.querySelector('[data-loaded]') ? 'ready' : 'loading'"
```

### Custom components need eval

Some sites use custom web components (Google Search, LinkedIn tiptap editor, React widgets). `fill` and `type` may not work on them. Use `eval` as fallback:

```bash
# If fill doesn't work on a custom input
node scripts/browser.js exec eval "(function() {
  const el = document.querySelector('[role=textbox]');
  el.innerHTML = 'text';
  el.dispatchEvent(new Event('input', {bubbles: true}));
})()"
```

**React-controlled inputs need native value setter:**
```bash
node scripts/browser.js exec eval "(function() {
  const el = document.querySelector('input');
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(el, 'your value');
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()"
```

### Buttons that ignore plain .click()

Some buttons (Gmail send, custom UI) require a mousedown -> click -> mouseup sequence:

```bash
node scripts/browser.js exec eval "(function() {
  const btn = document.querySelector('div[role=button]');
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
})()"
```

## Token extraction from browser localStorage (generic pattern)

Many web apps store auth tokens (JWT, OAuth, Cognito) in `localStorage`. You can extract them at runtime to call the app's internal API directly, bypassing the UI. This is faster and more reliable than UI automation for messaging, data retrieval, and status changes.

**Generic pattern:**

```bash
# 1. Navigate to the app (ensures localStorage is populated)
node scripts/browser.js goto "https://app.example.com"

# 2. Extract token by searching localStorage keys
node scripts/browser.js exec eval "(function(){
  const keys = Object.keys(localStorage);
  // Look for keys containing the app's domain or 'token'/'access'
  const k = keys.find(k => k.includes('example.com') && k.includes('token'));
  if (!k) return JSON.stringify({error: 'no token found'});
  const v = JSON.parse(localStorage.getItem(k));
  return JSON.stringify({token: v.secret || v.accessToken || v.access_token});
})()"

# 3. Parse JWT payload (if token is a JWT) for user info
node scripts/browser.js exec eval "(function(){
  const token = '<extracted_token>';
  const payload = JSON.parse(atob(token.split('.')[1]));
  return JSON.stringify({oid: payload.oid, name: payload.name, email: payload.email});
})()"
```

**Base64 extraction trick (avoids JSON escaping issues):**

When localStorage values contain complex JSON with nested quotes, extract via base64:

```bash
node scripts/browser.js exec eval "btoa(JSON.stringify(Object.fromEntries(Object.entries(localStorage))))"
# Then decode locally: echo '<base64>' | base64 -d | jq
```

**Apps known to use localStorage tokens:**
- **Teams:** `ic3.teams.office.com` + `accesstoken` key (fallback: `chatsvcagg.teams.microsoft.com`)
- **Cognito-based apps:** `access_token`, `refresh_token`, `token_type` keys
- **Custom portals:** `@user`, `authToken`, or app-prefixed keys

**Token refresh pattern (Cognito/AWS):**

If a token has a `refresh_token`, use it to get a fresh access token without re-opening the browser:

```bash
curl -X POST "https://cognito-idp.<region>.amazonaws.com/" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d '{"AuthFlow":"REFRESH_TOKEN_AUTH","ClientId":"<client_id>","AuthParameters":{"REFRESH_TOKEN":"<refresh_token>"}}'
```

**Gotchas:**
- Tokens expire (typically 1 hour). Re-extract if you get 401.
- The token from one subdomain may not work for another API endpoint. Try alternative keys.
- JWT `oid` may differ between token sources. Use the one that matches the API you're calling.

## API request capture (reverse engineering)

When an app's internal API is undocumented, capture network requests to discover endpoints:

```javascript
// capture-requests.js — intercept POST/PUT requests
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('.browser-profile', {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  page.on('request', (req) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method()) &&
        (req.url().includes('api') || req.url().includes('message') || req.url().includes('chat'))) {
      console.log('URL:', req.url());
      console.log('Method:', req.method());
      console.log('Headers:', JSON.stringify(req.headers(), null, 2));
      console.log('Body:', req.postData());
    }
  });
  await page.goto('https://app.example.com', { waitUntil: 'networkidle' });
  console.log('App loaded. Perform the action you want to capture in the UI...');
  process.stdin.resume();
  process.stdin.on('data', async () => {
    await browser.close();
    process.exit(0);
  });
})();
```

This pattern works for any web app. Use it when:
- The app has no public API documentation
- You need to automate an action not covered by existing scripts
- The API has changed and existing scripts break

## Anti-patterns

- **Don't** reuse refs across snapshots
- **Don't** use `type` without a ref for multiline text (CLI parses newlines as args)
- **Don't** commit `.browser-profile/` or any auth state file
- **Don't** open a second browser instance if one is already running (use tabs or sessions)
- **Don't** use `--headless` flag (it's the default; use `--headed` when you need visible)
- **Don't** try to solve captchas programmatically (open headed and ask the user)
- **Don't** use shell `sleep` between separate CLI calls (kills the session, see Rule 2)
- **Don't** split wait + click + verify into separate CLI calls (batch into one eval, see Rule 6)
- **Don't** call `playwright-cli open` directly when using the wrapper (use `node scripts/browser.js open`)
- **Don't** verify SPA navigation by URL change (check DOM content, see Rule 5)

## Full command reference

See [references/playwright-cli.md](references/playwright-cli.md) for the complete command list with all options.

## Parallel subagent pattern

See [references/parallel-agents.md](references/parallel-agents.md) for the full pattern of running multiple subagents with independent tab contexts.

## Profile management

See [references/profile-management.md](references/profile-management.md) for profile dir setup, auth state persistence, and headed/headless workflow.

## ATS patterns

See [references/ats-patterns.md](references/ats-patterns.md) for platform-specific patterns for applying via career pages and reading scheduling links. Covers Ashby (application form fields, file upload flow, submit, confirmation; scheduling link timezone, available days, time slot extraction, filtering by user availability).

## App guides

When automating a specific web app, load the corresponding guide for validated selectors, patterns, and gotchas. Each guide is a separate markdown file under `apps/`.

| App | Guide | What it covers |
|---|---|---|
| Gmail | [apps/gmail.md](apps/gmail.md) | Atom feed, compose (native value setter), reply (contenteditable), search operators, keyboard shortcuts, bulk delete, SMTP alternative |
| LinkedIn | [apps/linkedin.md](apps/linkedin.md) | Voyager API messaging, bulk inbox, tiptap editor fix, connection requests, notifications, saved jobs, Easy Apply, post search |
| Microsoft Teams | [apps/teams.md](apps/teams.md) | chatsvc API (send/delete messages), token extraction from localStorage (ic3 + chatsvcagg fallback), chatId formats, UI fallback, request capture pattern |
| Jira | [apps/jira.md](apps/jira.md) | Create issue (form fill + snapshot before submit), custom dropdowns, add comment, transition status, SSO login |
| Teamtailor | [apps/teamtailor.md](apps/teamtailor.md) | Apply with LinkedIn (auto-fill), custom questions, email verification, Connect profile, HTTP API POST |
| Humand.co | [apps/humand.md](apps/humand.md) | Guest session apply, S3 CV upload, POST /api/jobs/apply, required fields, thank you verification |

**When to load an app guide:** when the agent needs to interact with that specific app (read inbox, send message, apply to job, etc.). The core skill (this file) is enough for generic browser operations. The app guides are loaded on demand to save tokens.

**Adding new apps:** create a new `apps/<name>.md` file with the same structure (selectors, patterns, gotchas, anti-patterns). No need to modify this file; the agent discovers app guides by listing the `apps/` directory.
