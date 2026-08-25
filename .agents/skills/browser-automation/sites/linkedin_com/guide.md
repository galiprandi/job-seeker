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

One HTTP call returns ALL conversations with thread IDs, participant names, unread count, last message, and timestamp. Avoids opening conversations one by one. **This is the foundation of safe messaging: always fetch thread IDs via API before sending, never rely on UI clicks.**

**Response structure (validated 2026-08-12):**

The GraphQL response uses a normalized format with two top-level keys:
- `data.data.messengerConversationsBySyncToken['*elements']` — array of conversation URNs
- `included` — flat map of all objects keyed by numeric index or URN

Object types in `included`:
- `com.linkedin.messenger.Conversation` — has `backendUrn` (contains thread ID), `*conversationParticipants` (refs to participants), `unreadCount`, `lastActivityAt`, `messages`
- `com.linkedin.messenger.MessagingParticipant` — has `entityUrn`, `participantType.member.firstName.text`, `participantType.member.lastName.text`, `participantType.member.profileUrl`
- `com.linkedin.messenger.Message` — individual messages

**Thread ID extraction:** the `backendUrn` field contains the thread ID as `2-XXXXX==`. Extract with regex: `backendUrn.match(/2-[A-Za-z0-9_-]+/)`.

**Participant name resolution:** `*conversationParticipants` contains refs to `MessagingParticipant` objects. The refs are URN strings (e.g: `urn:li:msg_messagingParticipant:urn:li:fsd_profile:ACoAA...`). Look up each ref in `included` by matching `entityUrn`, then read `participantType.member.firstName.text` and `participantType.member.lastName.text`.

```bash
# Navigate to messaging first (loads required cookies)
node scripts/browser.js goto "https://www.linkedin.com/messaging/"

# Fetch all conversations with participant names and thread IDs
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
  }).then(function(r){return r.json()}).then(function(data){
    var included = data.included || {};

    // Build participant map: entityUrn -> 'FirstName LastName'
    var participantMap = {};
    for (var key in included) {
      var obj = included[key];
      if (obj.\$type === 'com.linkedin.messenger.MessagingParticipant') {
        var member = obj.participantType && obj.participantType.member;
        if (member && member.firstName && member.lastName) {
          participantMap[obj.entityUrn] = member.firstName.text + ' ' + member.lastName.text;
        }
      }
    }

    // Build conversation list with thread IDs and participant names
    var results = [];
    for (var key in included) {
      var conv = included[key];
      if (conv.\$type !== 'com.linkedin.messenger.Conversation') continue;
      var threadMatch = (conv.backendUrn || '').match(/2-[A-Za-z0-9_-]+/);
      var refs = conv['*conversationParticipants'] || [];
      var names = refs.map(function(r) { return participantMap[r] || 'unknown'; });
      results.push({
        threadId: threadMatch ? threadMatch[0] : '',
        participants: names,
        unreadCount: conv.unreadCount || 0,
        lastActivityAt: conv.lastActivityAt || ''
      });
    }
    return JSON.stringify(results);
  });
})()"
```

**Find a conversation by participant name:**

```bash
# Filter the results array by participant name
# Example: find thread with 'María'
var maria = results.filter(function(r) {
  return r.participants.some(function(p) { return p.includes('María'); });
});
# Returns: [{ threadId: '2-YjFm...', participants: ['German Aliprandi', 'María de los Angeles Celiz'], ... }]
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
- `participants` includes target name → use that `threadId` for sending via API or URL navigation
- `lastActivityAt` → compare against your last review timestamp to detect new activity

### Navigate between conversations

*Validated 2026-08-23 against live LinkedIn Messaging.*

LinkedIn Messaging is a SPA where the conversation list and the active thread are separate panels. Switching conversations has several gotchas.

#### The reliable way: navigate by thread URL

**Always navigate directly to the thread URL.** This is the only method that reliably switches conversations.

```bash
# Get thread IDs from the bulk inbox fetch (see "Bulk inbox fetch" above)
# Then navigate directly:
node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/" --tab linkedin

# Wait for messages to load (see "Read messages" below for the polling pattern)
```

#### What does NOT work

**Sidebar clicks from `/messaging/`** — clicking a conversation in the sidebar often fails to navigate. The URL stays on the previous thread, and the message panel doesn't update. This is the most common failure mode.

```bash
# ❌ Unreliable — click may not navigate
node scripts/browser.js exec eval "(function(){
  var items = document.querySelectorAll('.msg-conversation-listitem');
  for (var i = 0; i < items.length; i++) {
    var name = items[i].querySelector('h3')?.innerText?.trim() || '';
    if (name.includes('TARGET_NAME')) { items[i].click(); return 'clicked'; }
  }
  return 'not found';
})()" --tab linkedin
# URL may still point to the previous thread
```

**Keyboard navigation (Arrow Down/Up)** — pressing arrow keys moves the highlight in the conversation list but does not navigate to the thread. The URL and message panel stay on the previous conversation.

```bash
# ❌ Does not navigate — only moves highlight
node scripts/browser.js exec press ArrowDown --tab linkedin
# URL unchanged, message panel unchanged
```

**`/messaging/` redirect** — navigating to `https://www.linkedin.com/messaging/` (without a thread ID) redirects to the last active thread. This is not a way to switch conversations — it's a way to return to wherever you last were.

#### Bulk navigation pattern

To read messages from multiple conversations, loop through thread IDs from the bulk inbox fetch:

```bash
# 1. Fetch all thread IDs + participant names (see "Bulk inbox fetch" above)
# 2. For each thread, navigate by URL and extract messages

for THREAD_ID in "2-AAAA==" "2-BBBB==" "2-CCCC=="; do
  node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/$THREAD_ID/" --tab linkedin
  # Wait for messages to load
  node scripts/browser.js exec eval "(async function(){
    for (var i = 0; i < 30; i++) {
      var items = document.querySelectorAll('.msg-s-event-listitem');
      if (items.length > 0) return 'ready';
      await new Promise(function(r){setTimeout(r, 500)});
    }
    return 'timeout';
  })()" --tab linkedin
  # Extract messages (see "Read messages" below)
done
```

**Timing:** each navigation + load takes ~5-8 seconds (navigation + SPA hydration + message render). Budget accordingly for bulk reads.

### Read messages from a conversation (full extraction with sender/direction)

*Validated 2026-08-23 against live LinkedIn Messaging.*

There are two methods to read messages from a conversation: **Voyager API** (preferred, returns structured data with sender) and **DOM extraction** (fallback, requires navigating to the thread).

#### Method 1: Voyager API (preferred)

Fetch events from a thread by thread ID. Returns structured data with sender, body, and timestamp.

```bash
# Navigate to messaging first (loads required cookies)
node scripts/browser.js goto "https://www.linkedin.com/messaging/" --tab linkedin

# Fetch events from a thread
node scripts/browser.js exec eval "(function(){
  var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
  csrf = csrf ? csrf.split('=')[1].replace(/\"/g,'') : '';
  var THREAD_ID = '2-XXXXX==';

  return fetch('/voyager/api/messaging/conversations/' + encodeURIComponent(THREAD_ID) + '/events?start=0&count=50', {
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'csrf-token': csrf
    }
  }).then(function(r){return r.json()}).then(function(data){
    var included = data.included || {};
    var msgs = [];
    for (var key in included) {
      var evt = included[key];
      if (!evt || evt.\$type !== 'com.linkedin.voyager.messaging.Event') continue;
      var fromRef = evt['*from'] || '';
      var senderObj = included[fromRef];
      var sender = '';
      if (senderObj) sender = (senderObj.firstName || '') + ' ' + (senderObj.lastName || '');
      var body = '';
      var ec = evt.eventContent;
      if (ec) {
        if (ec.attributedBody) body = ec.attributedBody.text || '';
        else if (ec.body) body = ec.body || '';
      }
      if (body) msgs.push({sender: sender.trim(), body: body, createdAt: evt.createdAt || 0});
    }
    msgs.sort(function(a,b){ return a.createdAt - b.createdAt; });
    return JSON.stringify(msgs);
  });
})()" --tab linkedin
```

**Thread ID format:** the `2-XXXXX==` from the bulk inbox fetch. The `==` suffix is part of the ID — include it when URL-encoding. If you get `{"data":{"status":400},"included":[]}`, the thread ID is malformed or missing the `==` padding.

**Sender resolution:** `*from` is a ref to a `MessagingMember` or `MiniProfile` object in `included`. Look it up and read `firstName` + `lastName`. Messages from yourself will have your own name.

**Count parameter:** `count=50` returns the last 50 messages. For longer conversations, increase to `count=100` or paginate with `start=50`.

#### Method 2: DOM extraction (fallback)

Navigate to the thread URL and extract messages from the rendered DOM. Use this when the API returns errors or the response structure changes.

```bash
# 1. Navigate to the thread by ID (include == suffix)
node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/" --tab linkedin

# 2. Wait for messages to load (poll — LinkedIn is a SPA, messages load async)
node scripts/browser.js exec eval "(async function(){
  for (var i = 0; i < 30; i++) {
    var items = document.querySelectorAll('.msg-s-event-listitem');
    if (items.length > 0) return 'ready: ' + items.length + ' items';
    await new Promise(function(r){setTimeout(r, 500)});
  }
  return 'timeout';
})()" --tab linkedin

# 3. Extract messages with direction (sent vs received)
node scripts/browser.js exec eval "(function(){
  var items = document.querySelectorAll('.msg-s-event-listitem');
  var out = [];
  items.forEach(function(it){
    var isReceived = it.classList.contains('msg-s-event-listitem--other');
    var txt = (it.querySelector('.msg-s-event-listitem__body') || it).innerText.trim();
    if (txt) out.push({dir: isReceived ? 'in' : 'out', text: txt});
  });
  return JSON.stringify(out);
})()" --tab linkedin
```

**Direction detection:** the class `msg-s-event-listitem--other` marks messages from the other participant. Its absence means the message was sent by you.

**Selector for message text:** `.msg-s-event-listitem__body` contains the message body. Fall back to the listitem's `innerText` if the body element is missing.

**Polling is required:** LinkedIn renders messages asynchronously after navigation. A single `eval` without waiting returns `no items` or `[]`. Always poll with the async loop above (up to 15 seconds).

**Scrolling for older messages:** the message list uses virtual scrolling. To load older messages, scroll the container to the top repeatedly:

```bash
node scripts/browser.js exec eval "(async function(){
  var container = document.querySelector('.msg-s-message-listcontainer');
  if (!container) return 'no container';
  var seen = {};
  for (var i = 0; i < 10; i++) {
    document.querySelectorAll('.msg-s-event-listitem').forEach(function(it){
      var txt = (it.querySelector('.msg-s-event-listitem__body') || it).innerText.trim();
      if (txt) seen[txt] = it.classList.contains('msg-s-event-listitem--other') ? 'in' : 'out';
    });
    container.scrollTop = 0;
    await new Promise(function(r){setTimeout(r, 800)});
  }
  return JSON.stringify(seen);
})()" --tab linkedin
```

**Gotcha — sidebar clicks don't navigate:** clicking a conversation in the sidebar from `/messaging/` often fails to navigate (the URL stays on the previous thread). Always navigate directly to `https://www.linkedin.com/messaging/thread/<THREAD_ID>/` by URL.

**Gotcha — thread ID needs `==` in URL:** the thread ID from the bulk inbox fetch may or may not include the `==` suffix. When navigating by URL, include `==` (e.g. `/messaging/thread/2-XXXXX==/`). Without it, the page may load but show no messages.

### Send reply via Voyager API (SAFE: by thread ID)

**This is the only safe way to send a message.** The thread ID is obtained from the bulk inbox fetch above. No UI interaction needed — the API call works from any LinkedIn page.

```bash
playwright-cli eval "(function(){
  var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
  csrf = csrf ? csrf.split('=')[1].replace(/\"/g,'') : '';

  var THREAD_ID = '2-XXXXX==';
  var MESSAGE_TEXT = 'your message';

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
  }).then(function(r){return r.text()}).then(function(t){return t.substring(0, 500)});
})()"
```

**Verification:** the response contains `conversationUrn` with the thread ID. Confirm it matches the intended `THREAD_ID` before reporting success. If the response contains an error or the thread ID doesn't match, STOP and retry.

**Complete safe messaging flow (API-first, no UI clicks):**
1. Navigate to `https://www.linkedin.com/messaging/` (loads cookies)
2. Bulk inbox fetch → get all conversations with thread IDs + participant names
3. Filter by participant name → get the target `threadId`
4. Send via Voyager API with that exact `threadId`
5. Verify: response `conversationUrn` matches the `threadId`
6. (Optional) Navigate to `/messaging/thread/<threadId>/` to visually confirm in headed mode

This flow eliminates the entire class of "wrong recipient" errors. The thread ID comes from the API, not from a UI click that may or may not navigate.

### Open a conversation (SAFE: by thread ID)

**This is the only safe way to open a conversation for sending.** Navigate directly to the thread URL. Never open `/messaging/` and click a name in the sidebar — LinkedIn redirects to the last active thread, and sidebar clicks can be intercepted by the global nav header or search overlay, leaving the composer attached to the wrong thread.

**How to get the thread ID:**
1. Use the bulk inbox fetch above to get all conversations with their thread IDs and participant names
2. Match the participant name to find the thread ID (`2-XXXXX==`)

```bash
# Navigate directly to the thread by ID
node scripts/browser.js goto "https://www.linkedin.com/messaging/thread/2-XXXXX==/"

# Wait for the conversation to load
playwright-cli eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('.msg-s-message-list-container')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Verify the correct thread is loaded (check URL, not just header text)
playwright-cli eval "(function(){
  var url = location.pathname;
  var threadId = url.match(/thread\/(2-[^/]+)/);
  if (!threadId) return 'no_thread_in_url';
  var header = document.querySelector('h2');
  return JSON.stringify({
    threadId: threadId[1],
    header: header ? header.textContent.trim() : 'no_header'
  });
})()"
# Confirm the thread ID in the output matches the one you intended.
# Only then proceed to type and send.
```

### Open a conversation by name (FALLBACK: use only if thread ID is unknown)

**Warning:** This method is unreliable. LinkedIn redirects `/messaging/` to the last active thread, and sidebar clicks may not navigate. Always prefer the thread ID method above. If you must use this, verify the thread ID in the URL after clicking — do not trust the header text alone.

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

# CRITICAL: Verify the thread URL changed to the expected thread ID
# Do NOT trust header text — the composer belongs to whatever thread is in the URL
playwright-cli eval "(function(){
  var url = location.pathname;
  var threadId = url.match(/thread\/(2-[^/]+)/);
  if (!threadId) return 'ERROR: no thread in URL — click may have failed';
  var panel = document.querySelector('.msg-s-message-list-container');
  var header = document.querySelector('h2');
  return JSON.stringify({
    threadId: threadId[1],
    header: header ? header.textContent.trim() : 'no_header',
    panelLoaded: !!panel
  });
})()"
# If threadId doesn't match the expected conversation, STOP.
# Do not type or send anything. Retry with eval .click() on the <h3>
# element directly, or use the bulk inbox fetch to get the thread ID
# and navigate by URL.
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
- `location=Worldwide` = override the user's profile location filter (critical for remote jobs)

**Location filter gotcha:** LinkedIn persists the user's profile location (e.g: "United Arab Emirates") as the default search location. Even with `f_WT=2` (remote), results are scoped to that location's job market, severely limiting results. Always include `&location=Worldwide` in search URLs to get global remote jobs. Without it, searches may return 0-7 results instead of 20+.

**Pagination:** LinkedIn job search shows ~25 results per page. To get more, either:
- Scroll the results list: `window.scrollBy(0, 5000)` + wait + extract
- Use the pagination URL parameter: `&start=25` for page 2, `&start=50` for page 3

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
- **"Continue applying" safety dialog**: LinkedIn may show a "Job search safety reminder" dialog with a "Continue applying" button when navigating to a job page. This dialog blocks the Easy Apply button. Dismiss it first by clicking "Continue applying" before attempting to click Easy Apply.
- **Multi-page forms with required questions**: Many Easy Apply jobs have 3-5 page forms with required text inputs, radio groups, and comboboxes on page 3+ ("Preguntas adicionales"). The automated script (`linkedin-easy-apply.js`) may skip these because it can't answer job-specific questions. For batch applications, jobs without additional questions (1-2 page forms) succeed; jobs with custom questions require manual intervention.
- **Easy Apply button click reliability**: `dispatchEvent` with mouse events may not open the compose dialog. Use direct `click` via ref from snapshot (`node scripts/browser.js exec click <ref>`) for reliable results. The button ref can be found by grepping the snapshot for `Easy Apply to`.
- **Form dialog detection**: The Easy Apply form dialog may not match `[role=dialog]` in some LinkedIn versions. Check for the heading "Apply to <Company>" or the text "X/Y pages" to confirm the form is open.

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

## Publishing posts (feed posts, validated 2026-08-24)

### Critical rules for posting

1. **SIEMPRE verificar el estado del modal antes de escribir.** Antes de tipear, hacer un snapshot y confirmar que el editor está vacío. Si ya tiene texto, NO escribir de nuevo.
2. **Nunca asumir que el modal se cerró.** El `type` con saltos de línea puede causar que el modal se cierre o que el texto se duplique. Después de escribir, verificar con snapshot que el texto está cargado correctamente.
3. **El botón "Post" puede estar en un dialog regular o en un shadow DOM.** Verificar cuál de los dos está activo antes de interactuar.
4. **No re-abrir el modal si ya está abierto con texto.** Si el usuario dice que el modal está abierto, hacer snapshot primero y verificar.

### Open the composer

LinkedIn tiene dos variantes del composer de posts:

**Variante A: Modal dialog (validado 2026-08-24)**
El modal aparece como un `dialog` con role="dialog" y contiene un textbox "Text editor for creating content".

```bash
# Navigate to feed
node scripts/browser.js goto "https://www.linkedin.com/feed/" --tab linkedin

# Click "Start a post"
node scripts/browser.js exec eval "(() => { const els = Array.from(document.querySelectorAll('*')).filter(e => e.textContent.trim() === 'Start a post' && e.children.length === 0); if (els.length) { let el = els[0]; while (el && el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') el = el.parentElement; (el || els[0]).click(); return 'clicked'; } return 'not_found'; })()"

# Wait for the modal dialog to appear
sleep 3

# VERIFY the modal is open and the editor is empty BEFORE typing
node scripts/browser.js exec snapshot --tab linkedin
# Look for: dialog with "Create post modal" heading and textbox "Text editor for creating content"
# If the textbox already has paragraph children with text, DO NOT type again
```

**Variante B: Shadow DOM composer (validado 2026-08-23)**
El composer vive dentro de un shadow DOM (`#interop-outlet` → `shadowRoot`).

```bash
# Click "Start a post" (same as above)
# Then check for shadow DOM:
node scripts/browser.js exec eval "(() => { const s = document.querySelector('#interop-outlet'); return s && s.shadowRoot ? 'shadow DOM found' : 'no shadow DOM'; })()"
```

### Type the post content

**Para la variante A (modal dialog):**

El editor es un `contenteditable` div dentro del dialog. `playwright-cli type` funciona pero los saltos de línea pueden causar problemas.

```bash
# Click the textbox to focus it (use the ref from snapshot)
node scripts/browser.js exec click --tab linkedin "<textbox_ref>"

# Type the content — usar \n para saltos de línea
node scripts/browser.js exec type --tab linkedin "Your post text here.

Second paragraph."

# VERIFY after typing that the text loaded correctly
node scripts/browser.js exec snapshot --tab linkedin
# Check that the textbox has paragraph children with the expected text
# If text is missing or duplicated, STOP and ask the user
```

**Para la variante B (Quill editor en shadow DOM):**

El composer usa **Quill.js** (`.ql-editor`), NOT tiptap. The tiptap `innerHTML` + `beforeinput` pattern from messaging does NOT work here — the "Post" button stays disabled because Quill's internal state is never updated.

**What works:** `playwright-cli type` simulates real keyboard input and Quill registers it correctly.

```bash
# Wait for the editor to appear in the shadow DOM, then focus it
node scripts/browser.js exec eval "(async () => {
  for (let i = 0; i < 40; i++) {
    let editors = document.querySelectorAll('div.ql-editor');
    let editor = Array.from(editors).find(e => e.offsetParent !== null);
    if (!editor) { const s = document.querySelector('#interop-outlet'); if (s && s.shadowRoot) editor = s.shadowRoot.querySelector('div.ql-editor'); }
    if (editor) { editor.focus(); editor.click(); return 'focused'; }
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Type the content (simulates real keyboard — Quill registers it)
node scripts/browser.js exec type "Your post text here. Use \\n for line breaks."
```

**Limitation:** `playwright-cli type` does not handle multi-line text well (newlines are parsed as args). For long multi-paragraph posts, type the text in one line or use multiple `type` calls with `press Enter` between them:

```bash
node scripts/browser.js exec type "First paragraph"
node scripts/browser.js exec press Enter
node scripts/browser.js exec press Enter
node scripts/browser.js exec type "Second paragraph"
```

**What does NOT work** (validated 2026-08-23):
- `editor.innerHTML = '<p>...</p>'` + `InputEvent('beforeinput', {inputType: 'insertFromPaste'})` — text appears visually but "Post" button stays disabled (Quill internal state not updated)
- `editor.dispatchEvent(new ClipboardEvent('paste', ...))` — same issue, text visible but button disabled
- `document.execCommand('insertText', false, text)` — text appears but button stays disabled
- `editor.innerText = text` + `InputEvent('input')` — same issue

### Schedule a post for later

After typing the content, the footer has a clock icon button to schedule.

```bash
# Click the schedule button (inside shadow DOM)
node scripts/browser.js exec eval "(() => { const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = shadow.querySelector('button[aria-label=\"Schedule post\"]'); if (btn) { btn.click(); return 'clicked'; } return 'not_found'; })()"

# Set date and time (inputs are in the shadow DOM)
node scripts/browser.js exec eval "(() => {
  const shadow = document.querySelector('#interop-outlet').shadowRoot;
  const dateInput = shadow.querySelector('input[name=\"artdeco-date\"]');
  const timeInput = shadow.querySelector('input[name=\"timepicker\"]');
  dateInput.value = 'MM/DD/YYYY';
  dateInput.dispatchEvent(new Event('input', { bubbles: true }));
  dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  timeInput.value = 'H:00 AM';
  timeInput.dispatchEvent(new Event('input', { bubbles: true }));
  timeInput.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ date: dateInput.value, time: timeInput.value });
})()"

# Click "Next" then "Schedule" (both in shadow DOM)
node scripts/browser.js exec eval "(() => { const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = Array.from(shadow.querySelectorAll('button')).find(b => b.textContent.trim() === 'Next' && !b.disabled); if (btn) { btn.click(); return 'clicked Next'; } return 'not_found'; })()"

# Wait a moment, then click "Schedule"
node scripts/browser.js exec eval "(async () => { await new Promise(r => setTimeout(r, 1000)); const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = Array.from(shadow.querySelectorAll('button')).find(b => b.textContent.trim() === 'Schedule' && !b.disabled); if (btn) { btn.click(); return 'clicked Schedule'; } return 'not_found'; })()"
```

**Verification:** after scheduling, the page shows a toast: "Post scheduled. View scheduled posts".

**Note:** Setting `dateInput.value` directly may not always update the calendar widget's internal state. If the post publishes immediately instead of at the scheduled time, click the day button in the calendar instead:

```bash
# Click a specific day in the calendar (aria-label format: "Day, Month DD, YYYY")
node scripts/browser.js exec eval "(() => {
  const shadow = document.querySelector('#interop-outlet').shadowRoot;
  const dayBtn = Array.from(shadow.querySelectorAll('button')).find(b => b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Monday, August 24, 2026'));
  if (dayBtn) { dayBtn.click(); return 'clicked'; } return 'not_found';
})()"
```

### Publish immediately

After typing content (and the "Post" button is enabled):

**Variante A (modal dialog):**

```bash
# VERIFY the modal is still open and text is correct before clicking Post
node scripts/browser.js exec snapshot --tab linkedin
# Confirm: dialog with "Create post modal", textbox has all paragraphs, button "Post" is present and not disabled

# Click "Post" (use the ref from snapshot)
node scripts/browser.js exec click --tab linkedin "<post_button_ref>"

# VERIFY the post was published
sleep 5
node scripts/browser.js exec snapshot --tab linkedin
# The modal should be gone and the post should appear in the feed
```

**Variante B (shadow DOM):**

```bash
# Click "Post" (inside shadow DOM)
node scripts/browser.js exec eval "(() => { const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = Array.from(shadow.querySelectorAll('button')).find(b => b.textContent.trim() === 'Post' && !b.disabled); if (btn) { btn.click(); return 'posted'; } return 'not_found_or_disabled'; })()"
```

### Delete a post

Navigate to your activity page and delete from the control menu:

```bash
# Go to your activity
node scripts/browser.js goto "https://www.linkedin.com/in/<profile_id>/recent-activity/all/"

# Find the post by text content, open its control menu
node scripts/browser.js exec eval "(() => { const btn = document.querySelector('button[aria-label=\"Open control menu for post by <Your Name>\"]'); if (btn) { btn.click(); return 'clicked'; } return 'not_found'; })()"

# Click "Delete post" (use find + click with refs)
node scripts/browser.js exec find "Delete post"
# then click the ref

# Confirm in the dialog
node scripts/browser.js exec find "Delete"
# then click the ref (the dialog's Delete button, not the menu item)
```

**Verification:** the post text no longer appears in the activity page, and a toast confirms deletion.

### Read your own posts (activity page extraction)

*Validated 2026-08-23 against live LinkedIn.*

To extract your own published posts (feed shares), navigate to your activity page and scrape the post text from the DOM.

```bash
# 1. Navigate to your activity page (shares only, or all activity)
node scripts/browser.js goto "https://www.linkedin.com/in/<profile_id>/recent-activity/shares/" --tab linkedin

# Note: LinkedIn may redirect /shares/ to /all/ — both work, /all/ shows posts + comments + reactions

# 2. Wait for posts to render (poll — async SPA load)
node scripts/browser.js exec eval "(async function(){
  for (var i = 0; i < 30; i++) {
    var posts = document.querySelectorAll('.feed-shared-update-v2__description, .update-components-text');
    if (posts.length > 0) return 'ready: ' + posts.length;
    await new Promise(function(r){setTimeout(r, 500)});
  }
  return 'timeout';
})()" --tab linkedin

# 3. Extract post texts (deduplicated — the activity page may render duplicates)
node scripts/browser.js exec eval "(function(){
  var posts = document.querySelectorAll('.feed-shared-update-v2__description, .update-components-text');
  var seen = {};
  var out = [];
  posts.forEach(function(p){
    var t = p.innerText.trim();
    if (t.length > 20 && !seen[t]) { seen[t] = true; out.push(t); }
  });
  return JSON.stringify(out);
})()" --tab linkedin
```

**Selectors:** `.feed-shared-update-v2__description` and `.update-components-text` both contain post body text. Query both to cover different LinkedIn UI versions.

**Duplicates:** the activity page sometimes renders the same post twice (e.g. once in a featured section, once in the feed). Always deduplicate by text content using a `seen` map.

**Scrolling for more posts:** the activity page uses lazy loading. To load older posts, scroll down and re-extract:

```bash
node scripts/browser.js exec eval "(async function(){
  var seen = {};
  var out = [];
  for (var s = 0; s < 5; s++) {
    var posts = document.querySelectorAll('.feed-shared-update-v2__description, .update-components-text');
    posts.forEach(function(p){
      var t = p.innerText.trim();
      if (t.length > 30 && !seen[t]) { seen[t] = true; out.push(t); }
    });
    window.scrollBy(0, 3000);
    await new Promise(function(r){setTimeout(r, 2000)});
  }
  return JSON.stringify(out);
})()" --tab linkedin
```

**Gotcha — URL redirect:** navigating to `/recent-activity/shares/` may redirect to `/recent-activity/all/`. This is fine — `/all/` includes shares. Don't rely on the URL staying as `/shares/`.

**Gotcha — profile ID required:** you need your own profile ID (the `ACoAA...` string) or vanity name for the URL. Get it from any LinkedIn page:

```bash
node scripts/browser.js exec eval "(function(){
  var ids = document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g) || [];
  var counts = {};
  ids.forEach(function(id){counts[id] = (counts[id]||0) + 1});
  return Object.entries(counts).sort(function(a,b){return b[1]-a[1]})[0][0];
})()" --tab linkedin
```

Or use your vanity name: `https://www.linkedin.com/in/<vanity_name>/recent-activity/all/`

## Anti-patterns

- **Don't** open `/messaging/` and click a sidebar name to send a message — LinkedIn redirects to the last active thread and sidebar clicks may not navigate. The composer belongs to whatever thread is in the URL, not the name you clicked. Use the bulk inbox fetch to get the thread ID, then navigate directly to `/messaging/thread/<thread_id>/` or use the Voyager API with the thread ID. A message sent to the wrong thread cannot be unsent.
- **Don't** verify a sent message with `hasMyMsg:true` alone — that only confirms the text exists somewhere on the page (could be the sidebar preview of the wrong conversation). Verify the thread ID in the URL matches the intended recipient AND the input is empty AND the message appears in the conversation pane.
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
- **Don't** use `innerHTML` + `beforeinput`/`paste`/`execCommand` on the share composer (Quill) — the text appears visually but the "Post" button stays disabled because Quill's internal state is never updated. Use `playwright-cli type` instead (simulates real keyboard input)
- **Don't** use `document.querySelector()` for the share composer — it lives inside `#interop-outlet`'s shadow DOM. Always use `document.querySelector('#interop-outlet').shadowRoot.querySelector()`

## API reference

See [voyager-api.md](voyager-api.md) for detailed endpoint documentation.
