# LinkedIn Voyager API Reference

*Validated Aug 2026. These are undocumented internal endpoints — they may change without notice.*

## CSRF token

Extract from `JSESSIONID` cookie:
```js
var csrf = document.cookie.split('; ').find(function(c){return c.indexOf('JSESSIONID=')===0});
csrf = csrf ? csrf.split('=')[1].replace(/"/g,'') : '';
```

The value typically starts with `ajax:` prefix.

## Self profile ID

```js
var selfId = (document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g)||[])
  .sort(function(a,b){
    return document.documentElement.outerHTML.split(a).length - document.documentElement.outerHTML.split(b).length;
  }).pop();
```

Most frequent `ACoAA...` match in the page HTML is usually the logged-in user.

## Endpoints

### Bulk inbox fetch

```
GET /voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.<ID>&variables=(mailboxUrn:urn%3Ali%3Afsd_profile%3A<selfId>)
```

Headers: `accept: application/vnd.linkedin.normalized+json+2.1`, `x-restli-protocol-version: 2.0.0`, `csrf-token`

Query ID: `messengerConversations.0d5e6781bbee71c3e51c8843c6519f48` (valid Aug 2026, changes over time)

Returns normalized JSON with conversations containing: participants, unreadCount, lastActivityAt, lastMessage (text, deliveredAt, isFromSelf), threadId.

### Send text — new conversation (legacy)

```
POST /voyager/api/messaging/conversations?action=create
Content-Type: application/json
```

Body:
```json
{
  "keyVersion": "LEGACY_INBOX",
  "conversationCreate": {
    "eventCreate": {
      "value": {
        "com.linkedin.voyager.messaging.create.MessageCreate": {
          "attributedBody": {"text": "...", "attributes": []},
          "attachments": []
        }
      }
    },
    "recipients": ["<fsd_profile_id>"],
    "subtype": "MEMBER_TO_MEMBER"
  }
}
```

Returns: `{"data":{"value":{"createdAt":...,"conversationUrn":"urn:li:fs_conversation:2-...","backendConversationUrn":"urn:li:messagingThread:2-..."}}}`

### Send text — reply (legacy)

```
POST /voyager/api/messaging/conversations/{chatId}/events?action=create
Content-Type: application/json
```

`chatId` = the `2-XXXXX==` part of the threadId (URL-encoded)

Body:
```json
{
  "eventCreate": {
    "value": {
      "com.linkedin.voyager.messaging.create.MessageCreate": {
        "attributedBody": {"text": "...", "attributes": []},
        "attachments": []
      }
    }
  }
}
```

### Upload attachment — register

```
POST /voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload
Content-Type: application/json
```

Body:
```json
{
  "mediaUploadType": "MESSAGING_FILE_ATTACHMENT",
  "fileSize": <bytes>,
  "filename": "<name>"
}
```

Returns:
```json
{
  "data": {
    "value": {
      "urn": "urn:li:digitalmediaAsset:...",
      "mediaArtifactUrn": "urn:li:digitalmediaMediaArtifact:(...)",
      "singleUploadUrl": "https://www.linkedin.com/dms-uploads/...",
      "pollingUrl": "https://www.linkedin.com/dms/processStatus/..."
    }
  }
}
```

### Upload attachment — binary

```
PUT <singleUploadUrl>
Content-Type: <mime type>
Body: <raw file bytes>
```

Returns HTTP 201 on success.

### Upload — poll status (optional)

```
GET <pollingUrl>
```

Returns:
```json
{
  "asset": "urn:li:digitalmediaAsset:...",
  "status": {
    "urn:li:digitalmediaRecipe:messaging-document": "NEW" | "AVAILABLE"
  },
  "assetStatus": "ALLOWED"
}
```

The asset does NOT need to be `AVAILABLE` before sending — the dash endpoint accepts it immediately after upload.

### Send message with attachment (dash endpoint)

```
POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage
Content-Type: text/plain;charset=UTF-8    ← NOT application/json
```

Body:
```json
{
  "message": {
    "body": {"attributes": [], "text": "..."},
    "renderContentUnions": [
      {
        "file": {
          "assetUrn": "urn:li:digitalmediaAsset:...",
          "byteSize": <bytes>,
          "mediaType": "application/pdf",
          "name": "filename.pdf",
          "url": "blob:https://www.linkedin.com/<uuid>"
        }
      }
    ],
    "conversationUrn": "urn:li:msg_conversation:(urn:li:fsd_profile:<self_id>,<thread_id>)",
    "originToken": "<uuid-v4>"
  },
  "mailboxUrn": "urn:li:fsd_profile:<self_id>",
  "trackingId": "<16 binary bytes as string>",
  "dedupeByClientGeneratedToken": false
}
```

Returns:
```json
{
  "value": {
    "entityUrn": "urn:li:msg_message:...",
    "backendConversationUrn": "urn:li:messagingThread:...",
    "deliveredAt": 1234567890,
    "renderContentUnions": [{"file": {...}}]
  }
}
```

**Critical details:**
- `content-type` MUST be `text/plain;charset=UTF-8`, not `application/json`
- `trackingId` is 16 random bytes as a string (binary, NOT a UUID)
- `url` is a `blob:` URL from `URL.createObjectURL(fileBlob)` — required even though client-side
- `conversationUrn` format: `urn:li:msg_conversation:(urn:li:fsd_profile:<self_id>,<thread_id>)`
- Attachments go in `renderContentUnions`, NOT in `attachments` (silently dropped)

## What does NOT work

- `POST /voyager/api/messaging/conversations?action=create` with `attachments` array → 500 (regardless of attachment structure)
- `POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage` with `content-type: application/json` → 400
- `POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage` with string `trackingId` → 400 (must be binary)
- `POST /voyager/api/voyagerMediaUploadMetadata?action=upload` → 400 (wrong endpoint, use `voyagerVideoDashMediaUploadMetadata`)

## Realtime (read-only)

LinkedIn uses long-polling HTTP (not WebSocket) for realtime updates:

- `GET /realtime/realtimeFrontendSubscriptions?ids=List(...)` — subscribe to presence/message topics
- `GET /realtime/realtimeFrontendClientConnectivityTracking?action=sendHeartbeat` — heartbeats

These are for receiving notifications, not for sending messages. Send uses the endpoints above.
