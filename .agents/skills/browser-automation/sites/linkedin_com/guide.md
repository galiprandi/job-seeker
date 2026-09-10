---
name: linkedin
description: Automate LinkedIn with playwright-cli. Covers messaging (send text + attachments via Voyager endpoints), bulk inbox fetch, profile navigation, job search, Easy Apply, connection requests, notifications, saved jobs, and the tiptap editor fix. Use when sending LinkedIn messages, reading inbox, applying to jobs, connecting with people, or extracting profile data. Part of the browser-automation skill.
verified: 2026-09-02
---

# LinkedIn Automation

Automate LinkedIn using a mix of UI interactions and internal Voyager API endpoints.

## Setup

```bash
# Open LinkedIn (headless if already logged in, headed for login)
node .agents/skills/browser-automation/scripts/browser.js open "https://www.linkedin.com" --headed

# If login needed: user logs in manually, then save state
node .agents/skills/browser-automation/scripts/browser.js save-state
node .agents/skills/browser-automation/scripts/browser.js close

# Next sessions: load state and go headless
node .agents/skills/browser-automation/scripts/browser.js open "https://www.linkedin.com"
node .agents/skills/browser-automation/scripts/browser.js load-state
```

## Messaging

### Bulk inbox fetch (PREFERRED over UI scraping)

One HTTP call returns ALL conversations with thread IDs, participant names, unread count, last message, and timestamp. **This is the foundation of safe messaging: always fetch thread IDs via API before sending, never rely on UI clicks.**

```bash
# Navigate to messaging first (loads required cookies)
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/"

# Bulk inbox fetch — GET /voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.<ID>&variables=(mailboxUrn:urn:li:fsd_profile:<selfId>)
# Headers: accept: application/vnd.linkedin.normalized+json+2.1, x-restli-protocol-version: 2.0.0, x-li-lang: en_US, csrf-token (JSESSIONID without quotes)
# Returns: { data: { messengerConversationsBySyncToken: { '*elements': [URNs] } }, included: { Conversation, Participant, Message objects } }
# Thread ID: extract from Conversation.backendUrn with regex /2-[A-Za-z0-9_-]+/
# Participant names: resolve from MessagingParticipant objects in included map (match entityUrn to *conversationParticipants refs, read firstName.text + lastName.text)
```

**Response structure (validated 2026-08-12):** two top-level keys — `data.data.messengerConversationsBySyncToken['*elements']` (array of conversation URNs) and `included` (flat map of all objects). Object types in `included`:
- `com.linkedin.messenger.Conversation` — `backendUrn` (contains thread ID), `*conversationParticipants` (refs), `unreadCount`, `lastActivityAt`, `messages`
- `com.linkedin.messenger.MessagingParticipant` — `entityUrn`, `participantType.member.firstName.text`, `participantType.member.lastName.text`, `participantType.member.profileUrl`
- `com.linkedin.messenger.Message` — individual messages

**Thread ID extraction:** `backendUrn.match(/2-[A-Za-z0-9_-]+/)`. The `==` suffix is part of the ID.

**Self ID extraction:** `document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g)` → pick the most frequent match.

**Query ID discovery** (if endpoint returns HTML instead of JSON, the query ID changed):
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  var entries = performance.getEntriesByType('resource');
  var conv = entries.filter(function(e){return e.name.indexOf('messengerConversations')>-1});
  return conv.map(function(e){return e.name.match(/queryId=(messengerConversations\.[a-f0-9]+)/)||[]}).map(function(m){return m[1]}).filter(Boolean);
})()"
```

**Decision logic after fetch:**
- `unreadCount > 0` → open that thread to read and respond
- `participants` includes target name → use that `threadId` for sending via API or URL navigation
- `lastActivityAt` → compare against your last review timestamp to detect new activity

### Navigate between conversations

*Validated 2026-08-23 against live LinkedIn Messaging.*

LinkedIn Messaging is a SPA where the conversation list and the active thread are separate panels.

**The reliable way: navigate by thread URL.** This is the only method that reliably switches conversations.

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/" --tab linkedin
# Wait for messages to load (poll .msg-s-event-listitem up to 15s)
```

**What does NOT work:**
- Sidebar clicks from `/messaging/` → URL stays on previous thread, message panel doesn't update (most common failure mode)
- Keyboard navigation (Arrow Down/Up) → only moves highlight, doesn't navigate
- `/messaging/` redirect → returns to last active thread, not a way to switch conversations

**Bulk navigation pattern:** loop through thread IDs from the bulk inbox fetch. Each navigation + load takes ~5-8 seconds (navigation + SPA hydration + message render).

```bash
for THREAD_ID in "2-AAAA==" "2-BBBB==" "2-CCCC=="; do
  node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/thread/$THREAD_ID/" --tab linkedin
  # Poll for .msg-s-event-listitem (async loop, up to 15s), then extract messages
done
```

### Read messages (two methods)

*Validated 2026-08-23 against live LinkedIn Messaging.*

**Method 1: Voyager API (preferred)** — returns structured data with sender, body, timestamp.

```bash
# Navigate to messaging first (loads required cookies)
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/" --tab linkedin

# Fetch events — GET /voyager/api/messaging/conversations/<encodeURIComponent(THREAD_ID)>/events?start=0&count=50
# Headers: accept, x-restli-protocol-version, x-li-lang, csrf-token (same as bulk fetch)
# Returns: { included: { 'com.linkedin.voyager.messaging.Event': { *from (ref), eventContent.attributedBody.text, createdAt }, MessagingMember/MiniProfile: { firstName, lastName } } }
# Sender resolution: look up *from ref in included, read firstName + lastName
# Sort by createdAt ascending. count=50 returns last 50; paginate with start=50 or increase count.
```

**Thread ID format:** the `2-XXXXX==` from the bulk inbox fetch. The `==` suffix is part of the ID — include it when URL-encoding. If you get `{"data":{"status":400},"included":[]}`, the thread ID is malformed or missing the `==` padding.

**Method 2: DOM extraction (fallback)** — use when the API returns errors or the response structure changes.

```bash
# 1. Navigate to the thread by ID (include == suffix)
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/" --tab linkedin
# 2. Poll for messages to load (async, up to 15s): querySelectorAll('.msg-s-event-listitem').length > 0
# 3. Extract: querySelectorAll('.msg-s-event-listitem') → for each, isReceived = classList.contains('msg-s-event-listitem--other'); text = (querySelector('.msg-s-event-listitem__body') || item).innerText.trim(); push {dir: isReceived?'in':'out', text}
```

- Direction: class `msg-s-event-listitem--other` = received; absence = sent by you
- Message text selector: `.msg-s-event-listitem__body` (fall back to listitem `innerText`)
- Polling required: LinkedIn renders async; single eval without waiting returns `[]`
- Virtual scrolling: to load older messages, scroll `.msg-s-message-listcontainer` to top repeatedly (800ms between scrolls)

**Gotcha — sidebar clicks don't navigate:** always navigate directly to `https://www.linkedin.com/messaging/thread/<THREAD_ID>/` by URL.

**Gotcha — thread ID needs `==` in URL:** without `==` the page may load but show no messages.

### Send reply via Voyager API (SAFE: by thread ID)

**This is the only safe way to send a message.** The thread ID is obtained from the bulk inbox fetch. No UI interaction needed — the API call works from any LinkedIn page.

```bash
# Send reply — POST /voyager/api/messaging/conversations/<encodeURIComponent(THREAD_ID)>/events?action=create
# Headers: accept, x-restli-protocol-version, x-li-lang, csrf-token, content-type: application/json
# Body shape:
#   { eventCreate: { value: { 'com.linkedin.voyager.messaging.create.MessageCreate': {
#       attributedBody: { text: MESSAGE_TEXT, attributes: [] }, attachments: [] } } } }
# Returns: response containing conversationUrn with the thread ID — verify it matches THREAD_ID before reporting success
```

**Complete safe messaging flow (API-first, no UI clicks):**
1. Navigate to `https://www.linkedin.com/messaging/` (loads cookies)
2. Bulk inbox fetch → get all conversations with thread IDs + participant names
3. Filter by participant name → get the target `threadId`
4. Send via Voyager API with that exact `threadId`
5. Verify: response `conversationUrn` matches the `threadId`
6. (Optional) Navigate to `/messaging/thread/<threadId>/` to visually confirm in headed mode

This flow eliminates the entire class of "wrong recipient" errors. The thread ID comes from the API, not from a UI click that may or may not navigate.

### Send new conversation via Voyager API

```bash
# Send new conversation — POST /voyager/api/messaging/conversations?action=create
# Headers: accept, x-restli-protocol-version, x-li-lang, csrf-token, content-type: application/json
# Body shape:
#   { keyVersion: 'LEGACY_INBOX',
#     conversationCreate: { eventCreate: { value: { 'com.linkedin.voyager.messaging.create.MessageCreate': {
#         attributedBody: { text: MESSAGE_TEXT, attributes: [] }, attachments: [] } } },
#       recipients: [RECIPIENT_ID], subtype: 'MEMBER_TO_MEMBER' } }
# RECIPIENT_ID = '<fsd_profile_id>' (the ACoAA... string)
# Returns: conversationUrn containing the thread ID (2-XXXXX==) for future replies
```

### Open a conversation (SAFE: by thread ID)

**This is the only safe way to open a conversation for sending.** Navigate directly to the thread URL. Never open `/messaging/` and click a name in the sidebar — LinkedIn redirects to the last active thread, and sidebar clicks can be intercepted by the global nav header or search overlay, leaving the composer attached to the wrong thread.

```bash
# Navigate directly to the thread by ID
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/"
# Wait for load (poll .msg-s-message-list-container, up to 10s)
# Verify: extract thread ID from location.pathname (regex /thread\/(2-[^/]+)/) + h2 header text
# Confirm the thread ID matches the one you intended. Only then proceed to type and send.
```

### Open by name (FALLBACK — unreliable)

Click `.msg-conversation-listitem` matching h3 text. CRITICAL: verify thread ID in URL after click — sidebar clicks often fail to navigate. Prefer thread ID method above. If threadId doesn't match expected, STOP — retry with eval `.click()` on the `<h3>` directly, or use the bulk inbox fetch to get the thread ID and navigate by URL.

### Send via UI — tiptap fix (validated 2026-08-10)

The composer is `div[contenteditable]` (`div.msg-form__contenteditable`). LinkedIn uses ProseMirror/tiptap which ignores `innerText`, `textContent`, `execCommand`, `playwright-cli fill`, and `playwright-cli type`. The only reliable way to trigger the framework's internal state and enable the Send button is to dispatch a `beforeinput` event with `inputType: 'insertFromPaste'` after setting `innerHTML`:

```bash
# 1. Focus: document.querySelector('div.msg-form__contenteditable').focus()
# 2. Set innerHTML with <p> tags, then dispatch:
#    el.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, cancelable:true, inputType:'insertFromPaste', data: paragraphs.join('\\n'), dataTransfer: new DataTransfer() }))
#    el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertFromPaste' }))
#    ('' in paragraphs array = blank line)
# 3. Wait for Send enabled: button[type=submit].msg-form__send-button not disabled
# 4. Click Send (via eval): document.querySelector('button[type=submit].msg-form__send-button').click()
# 5. Verify: document.body.innerText.includes('MESSAGE_SNIPPET')
```

**Bad patterns (tested 2026-08-10):**
- `el.innerText = text` + `InputEvent('input')` → Send stays disabled
- `el.textContent = text` + `InputEvent('input')` → Send stays disabled
- `document.execCommand('insertText', false, text)` → Send stays disabled
- `playwright-cli fill <ref> <text>` → Send stays disabled
- `playwright-cli type <text>` (after click) → Send stays disabled
- Solution: `el.innerHTML = '<p>...</p>'` + `InputEvent('beforeinput', {inputType: 'insertFromPaste'})` → Send enables

### Send with attachment (dash endpoint)

This is the only way to send attachments via endpoint. The attachment goes in `renderContentUnions`, NOT in `attachments` (which is silently dropped).

```bash
# Two-step flow:
# 1. Register upload — POST /voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload
#    Headers: accept, x-restli-protocol-version, x-li-lang, csrf-token, content-type: application/json
#    Body: { mediaUploadType: 'MESSAGING_FILE_ATTACHMENT', fileSize: <bytes>, filename: FILE_NAME }
#    Returns: { data: { value: { singleUploadUrl, urn } } }
#
# 2. Upload file — PUT <singleUploadUrl> with content-type: <FILE_MIME>, body: <Blob of file bytes>
#    Wait ~2s after upload, then:
#
# 3. Send message — POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage
#    Headers: accept: application/json, x-restli-protocol-version, x-li-lang, csrf-token, content-type: text/plain;charset=UTF-8 (NOT application/json)
#    Body shape:
#      { message: { body: { attributes: [], text: MESSAGE_TEXT },
#          renderContentUnions: [{ file: { assetUrn: <urn from step 1>, byteSize, mediaType: FILE_MIME, name: FILE_NAME, url: <blob: URL> } }],
#          conversationUrn: 'urn:li:msg_conversation:(urn:li:fsd_profile:<self_id>,<thread_id>)',
#          originToken: <UUID v4> },
#        mailboxUrn: 'urn:li:fsd_profile:<self_id>',
#        trackingId: <16 random binary bytes as string, NOT a UUID string>,
#        dedupeByClientGeneratedToken: false }
```

**Key details for attachments:**
- `content-type: text/plain;charset=UTF-8` (NOT `application/json`)
- `trackingId`: 16 random binary bytes as string (NOT a UUID string)
- `originToken`: standard UUID v4
- `url`: a `blob:` URL from `URL.createObjectURL()` (required even though it's client-side)
- `conversationUrn` format: `urn:li:msg_conversation:(urn:li:fsd_profile:<self_id>,<thread_id>)`
- The asset does NOT need to be `AVAILABLE` before sending — the dash endpoint accepts it immediately after upload

### Attach via UI (fallback if endpoint fails)

Navigate to thread → snapshot → click "Attach a file" → exec upload /path/to/file → fill message → click send. Attach buttons only appear when a conversation is open (not in the messaging list view).

## Connection requests (invites)

### Connect with note

The Connect button can be in: profile page, search results, or a dropdown. The modal varies (`connect-with-note`, `send-invite`).

```bash
# 1. Navigate to profile
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/in/<username>/"

# 2. Find & click Connect button (may be in "More" dropdown) — eval querySelectorAll('button, [role="button"]') for textContent === 'Connect'

# 3. If "Add a note" appears, click it — eval querySelectorAll('a, button') for textContent includes 'Add a note'

# 4. Wait for textarea (poll up to 3s), then fill: ta.value = NOTE; ta.dispatchEvent(new InputEvent('input', {bubbles:true}))

# 5. Click Send — eval querySelectorAll('button[type="submit"], button') for textContent includes 'Send' && !disabled
```

### Invite without note (URL pattern)

```
URL: https://www.linkedin.com/preload/custom-invite/?vanityName=<vanity>
```
- The vanity is the slug from the profile URL (`/in/<vanity>/`)
- For special characters (á, é, ç, ñ) use URL encoding (`%C3%A1`, `%C3%A9`, `%C3%A7`, `%C3%B1`)
- The "Add a note to your invitation" dialog appears automatically
- Search for the "Send without a note" button and click it

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/preload/custom-invite/?vanityName=<vanity>"
# Click "Send without a note": eval querySelectorAll('button, [role="button"]') for textContent includes 'Send without a note'
```

**Custom note limit:** LinkedIn has a weekly limit for custom notes. When exhausted, send invites without a note. Don't retry with a note.

**3rd+ connections:** Can't send invite. Mark as "no invite possible" and move to the next. Don't waste time trying workarounds.

## Notifications

```
URL: https://www.linkedin.com/notifications/
Strategy: parse article "Notification" elements via eval
```

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/notifications/"
# Poll for article elements (up to 10s), then extract:
# querySelectorAll('article') → map { text: a.innerText.substring(0,200), link: a.querySelector('a[href]')?.href || null }
```

## Saved jobs / job tracker

```
URL: https://www.linkedin.com/jobs-tracker/?stage=saved
Redirect: /my-items/saved-jobs/ -> /jobs-tracker/
Tabs: Saved, In Progress (dropdown: Draft, Clicked apply), Applied, Interview, Archived
```

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/jobs-tracker/?stage=saved"
# Poll for main (up to 10s), then extract:
# querySelectorAll('main a[href*="/jobs/view/"]') → map { role: ps[0].textContent, companyLocation: ps[1].textContent, url: c.href } (ps = c.querySelectorAll('p'))
```

## Job search

### Search jobs with Easy Apply

```
URL: https://www.linkedin.com/jobs/search/?keywords=<kw>&location=<loc>&f_AL=true&f_WT=2&sortBy=DD
Easy Apply badge: generic "Easy Apply" in job list cards (not just detail panel)
```

URL parameters:
- `f_AL=true` = Easy Apply only
- `f_WT=2` = Remote only
- `sortBy=DD` = sorted by date (most recent first)
- Keywords with OR (URL encoded): `%22<Role1>%22%20OR%20%22<Role2>%22`
- `location=Worldwide` = override the user's profile location filter (critical for remote jobs)

**Location filter gotcha:** LinkedIn persists the user's profile location (e.g: "United Arab Emirates") as the default search location. Even with `f_WT=2` (remote), results are scoped to that location's job market, severely limiting results. Always include `&location=Worldwide` in search URLs to get global remote jobs. Without it, searches may return 0-7 results instead of 20+.

**Pagination:** ~25 results per page. Either scroll (`window.scrollBy(0, 5000)` + wait + extract) or use `&start=25` for page 2, `&start=50` for page 3.

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/jobs/search/?keywords=<keywords>&location=<loc>&f_AL=true&f_WT=2&sortBy=DD"
# Poll for main (up to 10s), then extract:
# querySelectorAll('main .job-card-container, [data-job-id]') → map { title: h3/.job-title, company: h4/.company-name, easyApply: textContent.includes('Easy Apply'), url: a[href] }
```

### Post search for job openings (content search)

**Queries that work (ordered by effectiveness):**
1. `"<Role>" "hiring" LATAM` in `search/results/content/` with `sortBy="date_posted"` and Posts filter. Most productive query. Returns posts from recruiters and hiring managers with visible contact emails.
2. `"<Role>" "<City>" "hiring"` for geo-specific searches. Returns local posts with direct emails.
3. `"<Role in user's language>" "buscamos"` (or equivalent in the user's language) for searches in the local language.
4. `#hiring + <Role> keywords` (hashtags). LinkedIn doesn't support OR between hashtags. Simplify to one hashtag + keywords.

**Queries that don't work:**
- Multiple hashtags with OR: LinkedIn treats them as literal text
- Very long combinations with many ANDs: returns 0 results or irrelevant results
- Niche hashtags: low volume, almost no results

**Post extraction pattern:**
1. Go to `search/results/content/?keywords=...&sortBy="date_posted"`
2. Snapshot -> grep `button.*post by` for authors
3. grep `url.*in/` for profile URLs (3 repeated URLs per author)
4. grep `text:.*<Role keywords>|text:.*hiring` for post content
5. grep `mailto:` to extract direct contact emails
6. Scroll with `window.scrollBy(0, 5000)` + snapshot for more results

## Easy Apply flow

**Repeatable pattern:**
1. Snapshot of the job list -> grep `strong.*:` for titles
2. Click the job title (ref from the `strong`)
3. Snapshot -> grep `Easy Apply to` for the button
4. Click Easy Apply -> dialog opens
5. Loop: search for `Continue to next step` | `Review your application` | `Submit application` with grep, click
6. If there's a `textbox` with `*` (required), fill and continue
7. If there's a `combobox` with `Select an option`, select the appropriate option
8. If there are `radio` groups with `Required`, click the generic label (not the radio input)
9. If there's `Please make a selection` (alert), a radio is missing selection
10. Progress bar: 0% -> 25% -> 33% -> 50% -> 67% -> 75% -> 100% (varies per form)
11. At 100%: `Submit application` -> click -> `Your application was sent to <company>!`

**Common question types:**
- Years of experience with [tech]: fill from your data source
- Language level: fill from your data source
- Current location: fill from your data source
- Salary expectation: fill from your data source
- Consent/privacy: always accept
- Diversity/accessibility: fill from your data source

**If a required field is missing data:** stop and ask the user. Never invent values.

**Common Easy Apply pitfalls:**
- Some companies have extremely long forms (8+ steps). Patience, fill everything.
- Some forms have radios without a direct ref. Click the `generic` label that wraps the text ("Yes", "No").
- Some forms have `combobox` that appear selected but aren't. Verify with `option.*selected`.
- The "Continue" button may not advance if there are errors. Always grep `Please make a selection` | `Please enter a valid answer` | `Required` after each click.
- Some forms open a file chooser when clicking "Attach". Use `playwright-cli upload <path>` immediately.
- **"Continue applying" safety dialog**: LinkedIn may show a "Job search safety reminder" dialog with a "Continue applying" button when navigating to a job page. This dialog blocks the Easy Apply button. Dismiss it first by clicking "Continue applying" before attempting to click Easy Apply.
- **Multi-page forms with required questions**: Many Easy Apply jobs have 3-5 page forms with required text inputs, radio groups, and comboboxes on page 3+ ("Preguntas adicionales"). The automated script (`linkedin-easy-apply.js`) may skip these because it can't answer job-specific questions. For batch applications, jobs without additional questions (1-2 page forms) succeed; jobs with custom questions require manual intervention.
- **Easy Apply button click reliability**: `dispatchEvent` with mouse events may not open the compose dialog. Use direct `click` via ref from snapshot (`node .agents/skills/browser-automation/scripts/browser.js exec click <ref>`) for reliable results. The button ref can be found by grepping the snapshot for `Easy Apply to`.
- **Form dialog detection**: The Easy Apply form dialog may not match `[role=dialog]` in some LinkedIn versions. Check for the heading "Apply to <Company>" or the text "X/Y pages" to confirm the form is open.

**Captcha:** if a captcha appears, stop and ask the user. Never attempt to solve programmatically.

## Profile navigation

### Find someone's profile ID

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/in/<username>/"
# Extract: match /ACoAA[A-Za-z0-9_-]{5,}/g from outerHTML, count occurrences, return most frequent
```

### Navigate to a conversation by thread ID

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/"
```

## Voyager API reference

All Voyager API calls from `eval` need these headers:

```
accept: application/vnd.linkedin.normalized+json+2.1
x-restli-protocol-version: 2.0.0
x-li-lang: en_US
csrf-token: <JSESSIONID cookie value, without quotes>
```

CSRF token extraction:
```js
var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
csrf = csrf ? csrf.split('=')[1].replace(/"/g,'') : '';
```

See [voyager-api.md](voyager-api.md) for detailed endpoint documentation.

## Publishing posts

See [posting.md](posting.md) for the full posting workflow (composer variants, tiptap/Quill fixes, scheduling, deletion, reading your own posts).

## Bad patterns summary

**Messaging tiptap editor (tested 2026-08-10):**
- `innerText`/`textContent` + `InputEvent('input')` → Send stays disabled (tiptap ignores it)
- `execCommand('insertText')` → Send stays disabled
- `playwright-cli fill/type` → Send stays disabled
- Solution: `innerHTML` + `InputEvent('beforeinput', {inputType: 'insertFromPaste'})` → Send enables

**Posting Quill editor (validated 2026-08-23):**
- `innerHTML` + `beforeinput`/`ClipboardEvent('paste')`/`execCommand('insertText')`/`innerText` + `input` → text appears visually but "Post" button stays disabled (Quill internal state not updated)
- Solution: `playwright-cli type` (real keyboard input) → Quill registers it, Post enables

**Navigation:**
- Sidebar clicks from `/messaging/` → URL doesn't change, wrong thread (most common failure mode)
- Arrow keys in conversation list → only moves highlight, doesn't navigate
- `/messaging/` (no thread ID) → redirects to last active thread, not a way to switch

**Thread IDs:**
- Missing `==` suffix in URL → page may load but show no messages; API returns `{"data":{"status":400},"included":[]}`
- Trusting header text instead of URL thread ID → composer may be attached to wrong thread

**Attachments:**
- Putting attachment in `attachments` array → silently dropped; must use `renderContentUnions`
- Using `content-type: application/json` for dash endpoint → fails; must use `text/plain;charset=UTF-8`
- Using UUID string for `trackingId` → fails; must be 16 random binary bytes as string

**Job search:**
- Missing `&location=Worldwide` → results scoped to profile location (0-7 instead of 20+)
