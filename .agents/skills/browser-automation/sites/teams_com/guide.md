# Microsoft Teams Automation

Automate Microsoft Teams via internal chatsvc API. Token is extracted from browser localStorage, then used to send/delete messages via REST. No UI interaction needed for messaging.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Before doing anything manually, check if the consuming repo has scripts that wrap these operations.** Common scripts in consuming repos:
- `scripts/teams.js` — send/delete messages via chatsvc API (wraps the patterns below)

Run `ls scripts/teams*.js` to see what's available. **Prefer existing scripts over manual UI automation.**

## Setup

```bash
# Open Teams (headed for login, headless after)
node scripts/browser.js open "https://teams.microsoft.com" --headed

# If login needed: user logs in manually, then save state
node scripts/browser.js save-state
node scripts/browser.js close

# Next sessions: load state and go headless
node scripts/browser.js open "https://teams.microsoft.com"
node scripts/browser.js load-state
```

## Token extraction (from browser localStorage)

Teams stores auth tokens in localStorage. Extract them via `eval`:

```bash
# Navigate to Teams first (ensures localStorage is populated)
node scripts/browser.js goto "https://teams.microsoft.com"

# Extract token from ic3.teams.office.com key
node scripts/browser.js exec eval "(function(){
  const keys = Object.keys(localStorage);
  const k = keys.find(k => k.includes('ic3.teams.office.com') && k.includes('accesstoken'));
  if (!k) return JSON.stringify({error: 'no ic3 token found'});
  const v = JSON.parse(localStorage.getItem(k));
  return JSON.stringify({token: v.secret || v.accessToken, expiresOn: v.expiresOn || v.expires_on});
})()"
```

**Token details:**
- Expires in ~1 hour
- JWT payload contains `oid` (user ID) and `displayName` (user name)
- Parse JWT: `JSON.parse(atob(token.split('.')[1]))`

**Token fallback (if ic3 token fails with 401):**

The `ic3.teams.office.com` token may not work for the chatsvc API. Alternative source:

```bash
node scripts/browser.js exec eval "(function(){
  const keys = Object.keys(localStorage);
  const k = keys.find(k => k.includes('chatsvcagg.teams.microsoft.com') && k.includes('accesstoken'));
  if (!k) return JSON.stringify({error: 'no chatsvcagg token found'});
  const v = JSON.parse(localStorage.getItem(k));
  return JSON.stringify({token: v.secret || v.accessToken});
})()"
```

The `oid` from the chatsvcagg token may be different from the ic3 token. Use the one that matches the token you're using.

## Send message via chatsvc API

```bash
node scripts/browser.js exec eval "(async function(){
  // 1. Extract token
  const keys = Object.keys(localStorage);
  const tk = keys.find(k => k.includes('ic3.teams.office.com') && k.includes('accesstoken'));
  if (!tk) return 'no_token';
  const tv = JSON.parse(localStorage.getItem(tk));
  const token = tv.secret || tv.accessToken;

  // 2. Parse JWT for oid and displayName
  const payload = JSON.parse(atob(token.split('.')[1]));
  const oid = payload.oid;
  const name = payload.displayName || payload.name || '';

  // 3. URL-encode chatId (19:meeting_xxx@thread.v2 -> 19%3Ameeting_xxx%40thread.v2)
  const chatId = '19:meeting_xxx@thread.v2';
  const chatIdEnc = chatId.replace(/:/g, '%3A').replace(/@/g, '%40');

  // 4. Build message body
  const body = {
    id: -1,
    type: 'Message',
    conversationid: chatId,
    from: '8:orgid:' + oid,
    contenttype: 'Text',
    messagetype: 'RichText/Html',
    content: '<p>Your message here</p>',
    imdisplayname: name,
    clientmessageid: Math.floor(Math.random() * 1e9),
    composetime: new Date().toISOString(),
    originalarrivaltime: new Date().toISOString(),
    properties: {},
    formatVariant: 'TEAMS'
  };

  // 5. Send
  const r = await fetch('https://teams.microsoft.com/api/chatsvc/amer/v1/users/ME/conversations/' + chatIdEnc + '/messages', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + token,
      'content-type': 'application/json',
      'behavioroverride': 'redirectAs404',
      'x-ms-migration': 'True'
    },
    body: JSON.stringify(body)
  });
  return r.status + ' ' + r.statusText;
})()"
```

**HTTP 201 = success.** The response contains the `messageId` needed for deletion.

## Delete message (soft delete)

```bash
node scripts/browser.js exec eval "(async function(){
  // Extract token (same as send)
  const keys = Object.keys(localStorage);
  const tk = keys.find(k => k.includes('ic3.teams.office.com') && k.includes('accesstoken'));
  const token = JSON.parse(localStorage.getItem(tk)).secret;

  const chatId = '19:meeting_xxx@thread.v2';
  const messageId = '1234567890';
  const chatIdEnc = chatId.replace(/:/g, '%3A').replace(/@/g, '%40');

  const r = await fetch('https://teams.microsoft.com/api/chatsvc/amer/v1/users/ME/conversations/' + chatIdEnc + '/messages/' + messageId + '?behavior=softDelete', {
    method: 'DELETE',
    headers: {
      'authorization': 'Bearer ' + token,
      'behavioroverride': 'redirectAs404',
      'x-ms-migration': 'True'
    }
  });
  return r.status + ' ' + r.statusText;
})()"
```

**HTTP 200 = success.** The message shows as "This message has been deleted" in the chat. Only soft-delete is available via API.

## chatId formats

| Chat type | Format | Example |
|---|---|---|
| Meeting chat | `19:meeting_xxx@thread.v2` | `19:meeting_NDQ2Nz...@thread.v2` |
| 1:1 chat | `19:*@unq.gbl.spaces` | `19:8:orgid:xxx@unq.gbl.spaces` |
| Group chat | `19:*@thread.v2` | `19:xxx_yyy@thread.v2` |

**Finding the chatId:** look in the DOM for elements with `id` containing `19:`. Alternatively, capture it from DevTools Network when sending a test message.

## API request capture (reverse engineering)

If the API changes and you need to rediscover endpoints, capture network requests:

```javascript
// capture-teams.js pattern — intercept POST requests
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('.browser-profile', {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  page.on('request', (req) => {
    if (req.method() === 'POST' && (req.url().includes('chat') || req.url().includes('message'))) {
      console.log('URL:', req.url());
      console.log('Headers:', JSON.stringify(req.headers(), null, 2));
      console.log('Body:', req.postData());
    }
  });
  await page.goto('https://teams.microsoft.com', { waitUntil: 'networkidle' });
  // User sends a test message in the UI, script captures the request
})();
```

This pattern works for any web app, not just Teams. Use it to reverse-engineer undocumented APIs.

## UI fallback (for short messages without special chars)

If the API fails (token expired, endpoint changed), send via UI:

```bash
# 1. Navigate to the chat
node scripts/browser.js goto "https://teams.microsoft.com/v2/chat/<chatId>"

# 2. Focus the textbox
node scripts/browser.js exec eval "document.querySelector('div[role=textbox]').focus()"

# 3. Type the message (short, no accents, no newlines)
node scripts/browser.js exec type "your message"

# 4. Press Enter to send
node scripts/browser.js exec press Enter
```

## Gotchas (validated empirically)

- **Don't use `keyboard.type` with newlines** — Enter sends the message. Use `\n` in the message body via API instead.
- **Don't use `execCommand insertText`** — Teams uses Trusted Types policy, blocks it.
- **Don't use paste-text from clipboard** — pastes the previous clipboard content, not what you want.
- **Don't use m365 CLI** — requires Azure AD appId that you likely don't have.
- **Token expires in ~1 hour** — re-extract if you get 401.
- **ic3 token may not work for chatsvc** — use chatsvcagg token as fallback.
- **1:1 chats use `@unq.gbl.spaces` format**, not `@thread.v2`.
- **chatsvc endpoint may vary** — `https://teams.microsoft.com/api/chatsvc/amer/v1` or `https://chatsvcagg.teams.microsoft.com`.
- **`keyboard.type` doesn't support accents or special characters** in Teams — use the API for those.
- **Status must be lowercase** in API calls (if applicable to your endpoint).

## Anti-patterns

- **Don't** try to log in programmatically — open headed and let the user log in
- **Don't** hardcode tokens — extract from localStorage at runtime
- **Don't** reuse a token older than 1 hour — re-extract
- **Don't** use UI for messages with newlines or special characters — use the API
- **Don't** hard-delete — only softDelete is available via API
