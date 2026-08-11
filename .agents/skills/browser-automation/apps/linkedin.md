---
name: linkedin
description: Automate LinkedIn with playwright-cli. Covers messaging (send text + attachments via Voyager endpoints), bulk inbox fetch, profile navigation, job search, Easy Apply, connection requests, notifications, saved jobs, and the tiptap editor fix. Use when sending LinkedIn messages, reading inbox, applying to jobs, connecting with people, or extracting profile data. Part of the browser-automation skill.
---

# LinkedIn Automation

Automate LinkedIn via `playwright-cli` using a mix of UI interactions and internal Voyager API endpoints. The API endpoints run inside `page.evaluate()` so they inherit the browser's cookies automatically.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Before doing anything manually, check if the consuming repo has scripts that wrap these operations.** Common scripts in consuming repos:
- `scripts/linkedin-inbox.js` — fetch all conversations in one call (wraps the Voyager bulk fetch below)
- `scripts/linkedin-send.js` — send a text message via Voyager API
- `scripts/linkedin-search.js` — search posts for job openings
- `scripts/linkedin-invite.js` — send connection requests without note
- `scripts/linkedin-easy-apply.js` — search + apply to Easy Apply jobs
- `scripts/linkedin-warm-sourcing.js` — discover internal contacts and recruiters

Run `ls scripts/linkedin-*.js` to see what's available. **Prefer existing scripts over manual UI automation** — they're faster, more reliable, and handle edge cases.

## Setup

```bash
# Open LinkedIn (headless if already logged in, headed for login)
node scripts/browser.js open "https://www.linkedin.com" --headed

# If login needed: user logs in manually, then save state
node scripts/browser.js save-state
node scripts/browser.js close

# Next sessions: load state and go headless
node scripts/browser.js open "https://www.linkedin.com"
node scripts/browser.js load-state
```

## Messaging

### Bulk inbox fetch (PREFERRED over UI scraping)

One HTTP call returns ALL conversations with participants, unread count, last message, and timestamp. Avoids opening conversations one by one.

```bash
# Navigate to messaging first (loads required cookies)
node scripts/browser.js goto "https://www.linkedin.com/messaging/"

# Fetch all conversations via Voyager GraphQL
playwright-cli eval "(function(){
  var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
  csrf = csrf ? csrf.split('=')[1].replace(/\"/g,'') : '';

  var selfId = (document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g)||[]).sort(function(a,b){
    return document.documentElement.outerHTML.split(a).length - document.documentElement.outerHTML.split(b).length;
  }).pop();

  var queryId = 'messengerConversations.0d5e6781bbee71c3e51c8843c6519f48';
  var mailbox = 'urn%3Ali%3Afsd_profile%3A' + selfId;

  return fetch('/voyager/api/voyagerMessagingGraphQL/graphql?queryId=' + queryId + '&variables=(mailboxUrn:' + mailbox + ')', {
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'csrf-token': csrf
    }
  }).then(function(r){return r.text()}).then(function(t){return t.substring(0,3000)});
})()"
```

**Query ID changes over time.** If the endpoint returns HTML instead of JSON, find the current query ID:

```bash
playwright-cli eval "(function(){
  var entries = performance.getEntriesByType('resource');
  var conv = entries.filter(function(e){return e.name.indexOf('messengerConversations')>-1});
  return conv.map(function(e){return e.name.match(/queryId=(messengerConversations\.[a-f0-9]+)/)||[]}).map(function(m){return m[1]}).filter(Boolean);
})()"
```

**Decision logic after fetch:**
- `unreadCount > 0` → open that thread to read and respond
- `lastMessage.isFromSelf === true` → waiting for reply, no action needed
- `lastActivityAt` → compare against your last review timestamp to detect new activity

### Open a conversation by name (UI)

```
URL: https://www.linkedin.com/messaging/
Strategy: eval click on <li> by person name
Verify: msg-s-message-list-container exists + <h2> matches name
```

```bash
node scripts/browser.js goto "https://www.linkedin.com/messaging/"
# Wait for conversation list
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('.msg-conversation-listitem')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Click conversation by name (atomic eval, Browser Automation Rule 1)
playwright-cli eval "(function(){
  const items = document.querySelectorAll('.msg-conversation-listitem');
  for (const item of items) {
    const name = item.querySelector('h3, .msg-conversation-card__content');
    if (name && name.textContent.includes('PERSON_NAME')) {
      item.click();
      return 'clicked';
    }
  }
  return 'not_found';
})()"

# Verify (Browser Automation Rule 5: check DOM, not URL)
playwright-cli eval "(function(){
  const panel = document.querySelector('.msg-s-message-list-container');
  const header = document.querySelector('h2');
  if (panel && header && header.textContent.includes('PERSON_NAME')) return 'ok';
  return 'not_loaded';
})()"
```

### Send text-only message (new conversation, via Voyager API)

```bash
playwright-cli eval "(function(){
  var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
  csrf = csrf ? csrf.split('=')[1].replace(/\"/g,'') : '';

  var RECIPIENT_ID = '<fsd_profile_id>';
  var MESSAGE_TEXT = 'your message';

  var body = {
    keyVersion: 'LEGACY_INBOX',
    conversationCreate: {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: {text: MESSAGE_TEXT, attributes: []},
            attachments: []
          }
        }
      },
      recipients: [RECIPIENT_ID],
      subtype: 'MEMBER_TO_MEMBER'
    }
  };

  return fetch('/voyager/api/messaging/conversations?action=create', {
    method: 'POST',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'csrf-token': csrf,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  }).then(function(r){return r.text()}).then(function(t){return t.substring(0,1500)});
})()"
```

Returns `conversationUrn` containing the thread ID (`2-XXXXX==`) for future replies.

### Send text-only reply (existing conversation, via Voyager API)

```bash
playwright-cli eval "(function(){
  var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
  csrf = csrf ? csrf.split('=')[1].replace(/\"/g,'') : '';

  var THREAD_ID = '2-XXXXX==';
  var MESSAGE_TEXT = 'your reply';

  var body = {
    eventCreate: {
      value: {
        'com.linkedin.voyager.messaging.create.MessageCreate': {
          attributedBody: {text: MESSAGE_TEXT, attributes: []},
          attachments: []
        }
      }
    }
  };

  return fetch('/voyager/api/messaging/conversations/' + encodeURIComponent(THREAD_ID) + '/events?action=create', {
    method: 'POST',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'csrf-token': csrf,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  }).then(function(r){return r.text()}).then(function(t){return t.substring(0,1500)});
})()"
```

### Send message via UI (tiptap editor fix, validated 2026-08-10)

The composer is `div[contenteditable]`. LinkedIn uses ProseMirror/tiptap which ignores `innerText`, `textContent`, `execCommand`, `playwright-cli fill`, and `playwright-cli type`. The only reliable way to trigger the framework's internal state and enable the Send button is to dispatch a `beforeinput` event with `inputType: 'insertFromPaste'` after setting `innerHTML`:

```bash
# 1. Focus the composer
playwright-cli eval "document.querySelector('div.msg-form__contenteditable').focus()"

# 2. Set innerHTML with <p> tags and dispatch beforeinput with insertFromPaste
playwright-cli eval "(function(){
  var el = document.querySelector('div.msg-form__contenteditable');
  el.focus();
  var paragraphs = ['Line 1', 'Line 2', '', 'Line 4']; // '' for blank lines
  var html = paragraphs.map(function(p) { return '<p>' + p + '</p>'; }).join('');
  el.innerHTML = html;
  el.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true,
    inputType: 'insertFromPaste',
    data: paragraphs.join('\\n'),
    dataTransfer: new DataTransfer()
  }));
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  return el.textContent.substring(0, 50);
})()"

# 3. Wait for Send button to be enabled
playwright-cli eval "(function(){
  var btn = document.querySelector('button[type=submit].msg-form__send-button');
  return btn && !btn.disabled ? 'enabled' : 'disabled';
})()"

# 4. Click Send (via eval, not ref)
playwright-cli eval "document.querySelector('button[type=submit].msg-form__send-button').click()"

# 5. Verify: check that the message text appears in the thread
playwright-cli eval "document.body.innerText.includes('MESSAGE_SNIPPET')"
```

**What does NOT work** (tested 2026-08-10):
- `el.innerText = text` + `InputEvent('input')` — Send stays disabled
- `el.textContent = text` + `InputEvent('input')` — Send stays disabled
- `document.execCommand('insertText', false, text)` — Send stays disabled
- `playwright-cli fill <ref> <text>` — Send stays disabled
- `playwright-cli type <text>` (after click) — Send stays disabled

**What DOES work:**
- `el.innerHTML = '<p>...</p>'` + `InputEvent('beforeinput', {inputType: 'insertFromPaste'})` — Send enables

### Send message with attachment (dash endpoint)

This is the only way to send attachments via endpoint. The attachment goes in `renderContentUnions`, NOT in `attachments` (which is silently dropped).

```bash
playwright-cli eval "(function(){
  var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
  csrf = csrf ? csrf.split('=')[1].replace(/\"/g,'') : '';

  var selfId = (document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g)||[]).sort(function(a,b){
    return document.documentElement.outerHTML.split(a).length - document.documentElement.outerHTML.split(b).length;
  }).pop();

  var THREAD_ID = '2-XXXXX==';
  var MESSAGE_TEXT = 'message with attachment';
  var CONV_URN = 'urn:li:msg_conversation:(urn:li:fsd_profile:' + selfId + ',' + THREAD_ID + ')';

  var FILE_B64 = '<base64_encoded_file>';
  var FILE_NAME = 'document.pdf';
  var FILE_MIME = 'application/pdf';

  function uuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;var v=c==='x'?r:(r&0x3|0x8);return v.toString(16)})}
  function b64ToBlob(b64,mime){var bin=atob(b64);var arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}

  var trackingId='';for(var i=0;i<16;i++)trackingId+=String.fromCharCode(Math.floor(Math.random()*256));
  var fileBlob=b64ToBlob(FILE_B64,FILE_MIME);
  var fileSize=fileBlob.size;

  return fetch('/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload',{
    method:'POST',
    headers:{'accept':'application/vnd.linkedin.normalized+json+2.1','x-restli-protocol-version':'2.0.0','x-li-lang':'en_US','csrf-token':csrf,'content-type':'application/json'},
    body:JSON.stringify({mediaUploadType:'MESSAGING_FILE_ATTACHMENT',fileSize:fileSize,filename:FILE_NAME})
  }).then(function(r){return r.json()}).then(function(reg){
    var uploadUrl=reg.data.value.singleUploadUrl;
    var mediaUrn=reg.data.value.urn;
    return fetch(uploadUrl,{method:'PUT',headers:{'content-type':FILE_MIME},body:fileBlob}).then(function(){
      return new Promise(function(res){setTimeout(function(){res({mediaUrn:mediaUrn})},2000)});
    });
  }).then(function(data){
    var blobUrl=URL.createObjectURL(fileBlob);
    var body=JSON.stringify({
      message:{
        body:{attributes:[],text:MESSAGE_TEXT},
        renderContentUnions:[{file:{assetUrn:data.mediaUrn,byteSize:fileSize,mediaType:FILE_MIME,name:FILE_NAME,url:blobUrl}}],
        conversationUrn:CONV_URN,
        originToken:uuid()
      },
      mailboxUrn:'urn:li:fsd_profile:'+selfId,
      trackingId:trackingId,
      dedupeByClientGeneratedToken:false
    });
    return fetch('/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage',{
      method:'POST',
      headers:{'accept':'application/json','x-restli-protocol-version':'2.0.0','x-li-lang':'en_US','csrf-token':csrf,'content-type':'text/plain;charset=UTF-8'},
      body:body
    }).then(function(r){return r.text()}).then(function(t){return t.substring(0,1500)});
  });
})()"
```

**Key details for attachments:**
- `content-type: text/plain;charset=UTF-8` (NOT `application/json`)
- `trackingId`: 16 random binary bytes as string (NOT a UUID string)
- `originToken`: standard UUID v4
- `url`: a `blob:` URL from `URL.createObjectURL()` (required even though it's client-side)
- `conversationUrn` format: `urn:li:msg_conversation:(urn:li:fsd_profile:<self_id>,<thread_id>)`
- The asset does NOT need to be `AVAILABLE` before sending — the dash endpoint accepts it immediately after upload

### Attach file via UI (fallback)

If the endpoint flow fails (LinkedIn changes schema), use the UI:

```bash
node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/"
playwright-cli snapshot

# Find "Attach a file" button ref, click it
playwright-cli click <attach_ref>

# Upload file (file chooser opens automatically)
playwright-cli upload /path/to/file.pdf

# Fill message and send
playwright-cli snapshot
playwright-cli fill <textbox_ref> "your message"
playwright-cli snapshot
playwright-cli click <send_ref>
```

**Attach buttons only appear when a conversation is open** (not in the messaging list view).

## Connection requests (invites)

### Connect with note

The Connect button can be in: profile page, search results, or a dropdown. The modal varies (`connect-with-note`, `send-invite`).

```bash
# 1. Navigate to profile
node scripts/browser.js goto "https://www.linkedin.com/in/<username>/"

# 2. Find Connect button (may be in "More" dropdown)
playwright-cli eval "(function(){
  const btns = document.querySelectorAll('button, [role=\"button\"]');
  for (const b of btns) {
    if (b.textContent.trim() === 'Connect') { b.click(); return 'clicked'; }
  }
  return 'not_found';
})()"

# 3. If "Add a note" appears, click it
playwright-cli eval "(function(){
  const links = document.querySelectorAll('a, button');
  for (const l of links) {
    if (l.textContent.includes('Add a note')) { l.click(); return 'clicked'; }
  }
  return 'not_found';
})()"

# 4. Fill the note textarea
playwright-cli eval "(async function(){
  for (let i = 0; i < 15; i++) {
    if (document.querySelector('textarea')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
playwright-cli eval "(function(){
  const ta = document.querySelector('textarea');
  ta.value = 'YOUR NOTE TEXT';
  ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
  return 'filled';
})()"

# 5. Click Send
playwright-cli eval "(function(){
  const btns = document.querySelectorAll('button[type=\"submit\"], button');
  for (const b of btns) {
    if (b.textContent.includes('Send') && !b.disabled) { b.click(); return 'sent'; }
  }
  return 'not_found';
})()"
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
node scripts/browser.js goto "https://www.linkedin.com/preload/custom-invite/?vanityName=<vanity>"
playwright-cli eval "(function(){
  const btns = document.querySelectorAll('button, [role=\"button\"]');
  for (const b of btns) {
    if (b.textContent.includes('Send without a note')) { b.click(); return 'sent'; }
  }
  return 'not_found';
})()"
```

**Custom note limit:** LinkedIn has a weekly limit for custom notes. When exhausted, send invites without a note. Don't retry with a note.

**3rd+ connections:** Can't send invite. Mark as "no invite possible" and move to the next. Don't waste time trying workarounds.

## Notifications

```
URL: https://www.linkedin.com/notifications/
Strategy: parse article "Notification" elements via eval
```

```bash
node scripts/browser.js goto "https://www.linkedin.com/notifications/"
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('article')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

playwright-cli eval "(function(){
  const articles = document.querySelectorAll('article');
  return JSON.stringify(Array.from(articles).map(a => ({
    text: a.innerText.substring(0, 200),
    link: a.querySelector('a[href]')?.href || null,
  })));
})()"
```

## Saved jobs / job tracker

```
URL: https://www.linkedin.com/jobs-tracker/?stage=saved
Redirect: /my-items/saved-jobs/ -> /jobs-tracker/
Tabs: Saved, In Progress (dropdown: Draft, Clicked apply), Applied, Interview, Archived
```

```bash
node scripts/browser.js goto "https://www.linkedin.com/jobs-tracker/?stage=saved"
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('main')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

playwright-cli eval "(function(){
  const cards = document.querySelectorAll('main a[href*=\"/jobs/view/\"]');
  return JSON.stringify(Array.from(cards).map(c => {
    const ps = c.querySelectorAll('p');
    return {
      role: ps[0]?.textContent || '',
      companyLocation: ps[1]?.textContent || '',
      url: c.href,
    };
  }));
})()"
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

```bash
node scripts/browser.js goto "https://www.linkedin.com/jobs/search/?keywords=<keywords>&location=<loc>&f_AL=true&f_WT=2&sortBy=DD"
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('main')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

playwright-cli eval "(function(){
  const cards = document.querySelectorAll('main .job-card-container, [data-job-id]');
  return JSON.stringify(Array.from(cards).map(c => ({
    title: c.querySelector('h3, .job-title')?.textContent || '',
    company: c.querySelector('h4, .company-name')?.textContent || '',
    easyApply: c.textContent.includes('Easy Apply'),
    url: c.querySelector('a[href]')?.href || '',
  })));
})()"
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

**Captcha:** if a captcha appears, stop and ask the user. Never attempt to solve programmatically.

## Profile navigation

### Find someone's profile ID

```bash
node scripts/browser.js goto "https://www.linkedin.com/in/<username>/"
playwright-cli eval "(function(){
  var ids = document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g) || [];
  var counts = {};
  ids.forEach(function(id){counts[id] = (counts[id]||0) + 1});
  return Object.entries(counts).sort(function(a,b){return b[1]-a[1]})[0][0];
})()"
```

### Navigate to a conversation by thread ID

```bash
node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/"
```

## Key headers for Voyager API

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

## Outreach strategy by effectiveness order

1. **Easy Apply + direct email** (most effective): Easy Apply on LinkedIn Jobs + email to recruiter if the post has contact
2. **Direct email with CV** (high): when there's a visible email in a LinkedIn post
3. **Connection request without note** (medium): when there's no email, but can connect
4. **Connection request with note** (high but limited): mentioning a relevant project or blog post. LinkedIn limits custom notes per week
5. **Easy Apply only** (medium): fast but less personalized

**Effective email structure (validated):**
- Subject: `Application - <Role> - <Name>` (use the language of the post)
- Body: 3-4 short paragraphs, conversational, not formal
- Mention: specific relevant experience from the JD, concrete achievements with numbers
- Include: LinkedIn URL, blog URL if relevant to the JD
- Always attach CV
- No bullet points, no em-dashes, don't repeat JD keywords obviously

## Anti-patterns

- **Don't** open conversations one by one when you can use the bulk inbox fetch
- **Don't** put attachments in `attachments[]` field — use `renderContentUnions`
- **Don't** use `content-type: application/json` for the dash endpoint — use `text/plain`
- **Don't** reuse refs after navigating or clicking — take a new snapshot
- **Don't** try to log in programmatically — open headed and let the user log in
- **Don't** send messages without user approval if they're real outreach
- **Don't** use `innerText` or `textContent` for the tiptap editor — use `innerHTML` + `beforeinput` with `insertFromPaste`
- **Don't** retry captchas in a loop — stop and ask the user
- **Don't** try to connect with 3rd+ connections — they can't be invited
- **Don't** retry custom notes when the weekly limit is exhausted — send without a note

## API reference

See [linkedin-references/voyager-api.md](linkedin-references/voyager-api.md) for detailed endpoint documentation.
