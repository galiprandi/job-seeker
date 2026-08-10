---
name: news
description: Reviews job application updates from Gmail, LinkedIn and platforms. Prepares drafts, presents executive summary by priority, validates with the user and sends replies.
trigger: news
---
# News

## Trigger

**Keyword: `news`**

The user says `news` (or variants: "updates", "check", "any updates") and the full review routine is automatically triggered. No further instructions needed — the agent executes the entire flow from start to finish.

Also runs in parallel when the user launches an application.

## Flow

### 0. Pre-flight

- [ ] Verify active LinkedIn and Gmail sessions. If session closed → open browser with wrapper (see AGENTS.md "Browser session"): `node scripts/browser.js open <url> --headed` (Gold Rule 5) → notify user → wait for confirmation
- [ ] **Browser:** always use `node scripts/browser.js` for open/close/goto. See AGENTS.md "Browser session" for details. Never call `playwright-cli open` directly, never open Chrome directly
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```
- [ ] Load strategy (see AGENTS.md "Strategy levels"):
  ```bash
  node scripts/db.js "SELECT data->'strategy' AS strategy FROM users WHERE id = 1"
  ```
  Respect: `follow_up_days` (days before sending follow-up), `cold_outreach` (whether to send cold messages to recruiters). If `news` not in `sources_active`, warn the user

### 1. Collect updates (in parallel)

**Parallelization strategy:** when subagents are available, dispatch background subagents (`subagent_general`) per source to collect updates simultaneously. Each subagent returns a structured list of items (sender, subject, snippet, category guess, action items, scheduling links if any). The main agent then merges and classifies. If subagents are not available (e.g: single-session constraint), fall back to sequential collection.

**Subagent dispatch pattern:**

```
┌─────────────────────────────────────────────────────┐
│  Main agent (orchestrator)                          │
│  - Loads preferences, strategy, availability        │
│  - Dispatches subagents in parallel                 │
│  - Merges results, classifies, presents summary     │
├─────────────────────────────────────────────────────┤
│  Subagent A (Gmail)     Subagent B (LinkedIn)       │
│  - Inbox unread         - Messages unread           │
│  - Job Alerts folder    - Notifications             │
│  - Extract sched links  - Saved Jobs                │
│  - Returns JSON list    - Returns JSON list         │
├─────────────────────────────────────────────────────┤
│  Subagent C (DB)        Subagent D (Sched links)    │
│  - Pending follow-ups   - Opens each Calendly/SR   │
│  - Pipeline stages      - Filters by availability   │
│  - Returns JSON list    - Returns slot table        │
└─────────────────────────────────────────────────────┘
```

**Important:** subagents share the same browser. To avoid conflicts, use **attached sessions** with `--session` (see AGENTS.md "Parallel execution"):
- Gmail subagent: `node scripts/browser.js attach --session news-gmail` then `node scripts/browser.js goto <url> --session news-gmail`
- LinkedIn subagent: `node scripts/browser.js attach --session news-linkedin` then `node scripts/browser.js goto <url> --session news-linkedin`
- Alternatively, use **separate tabs** within the same session (`tab-new`) if subagents can't use separate sessions
- DB subagent doesn't need browser, only `scripts/db.js`
- Scheduling link subagent: `node scripts/browser.js attach --session news-sched` then opens each link with `--session news-sched`
- When done: `node scripts/browser.js detach --session news-gmail` (never `close` — it's ref-counted and would refuse or kill the browser for other agents)

**If subagents are NOT available** (e.g: tool not supported, single foreground agent constraint), fall back to sequential collection as before. The flow must work in both modes.

**Subagent prompt template** (adapt per source):

```
You are a job search assistant. Collect updates from <source> and return a structured list.

Context:
- Last review: <last_review_at>
- User profile: <profile summary from DB>
- Strategy: <strategy level and params>

Instructions:
1. Open <url> using: node scripts/browser.js open <url> (from the repo root directory)
2. <source-specific steps: read unread messages, extract sender/subject/snippet/date>
3. For each item, identify: sender, subject, date, snippet (first 200 chars), category guess (interview/offer/recruiter_new/recruiter_reply/rejected/newsletter/new_job), action items (calendar link? CV requested? form to fill?), and any scheduling URLs
4. Return a markdown table with all items found. Do NOT reply to anything, do NOT archive, do NOT click scheduling links (just extract the URL)
5. Close the tab when done

Return format:
| # | Sender | Subject | Date | Category | Action items | Scheduling URL |
```

Sources to collect (dispatch as parallel subagents when possible, sequential otherwise):

- [ ] **Gmail inbox:** search for unread emails since last review. Filter: everything related to job search and job sites (recruiters, HR, platforms, newsletters with jobs, application responses). Ignore obvious spam. Save `last_review_at` to DB to know since when to search
- [ ] **Gmail `Job Alerts` folder:** check `Job Alerts` label (alerts from platforms configured via `radar` skill). Classify each alert by fit: Must/Strong/Nice per PROFILE.md. Only present Must and Strong in the summary. Ignore Nice unless user asks to see all
- [ ] **LinkedIn messages:** unread messages in inbox. Filter recruiters, HR, application responses
- [ ] **LinkedIn notifications:** application notifications (status changes, recruiter messages)
- [ ] **LinkedIn Saved Jobs:** navigate to `https://www.linkedin.com/my-items/saved-jobs/`. For each saved job: check if still open, evaluate fit against profile (Must/Strong/Nice), check if already applied (query DB by URL or company+role). Present Must/Strong matches in summary as `new_job_must`/`new_job_strong`. If user already applied, skip. If job is closed, mark as `closed` and remove from saved
- [ ] **Platforms:** only if there are pending applications in DB. Navigate to each platform, check status of existing applications
- [ ] **Pending follow-ups:** query DB for applications without response after X days (contextual: 3 days for urgent, 5 for normal, 7 for cold)
- [ ] **Scheduling links (parallel subagent):** if any email or message contains a scheduling link (Calendly, SmartRecruiters self-schedule, Workable, HubSpot meetings, etc.), dispatch a background subagent (`subagent_general`) to open each link, read available slots, and filter them against `users.data.availability` (preferred_hours, timezone, blocked days). The subagent returns a filtered list of slots that match the user's preferences. This runs in parallel with the rest of the news flow so the user doesn't wait. The subagent prompt must include:
  - The scheduling URL(s) found
  - The user's availability preferences from DB (load before dispatching)
  - Instructions: open each link with `node scripts/browser.js open <url>`, take snapshot, extract all available time slots, filter by preferred_hours and blocked days, return a markdown table of matching slots sorted by day then time
  - The browser wrapper must be used (Gold Rule). The subagent should NOT book a slot, only list filtered options

### 2. Classify and prioritize

Each item is classified into a category and assigned contextual priority:

| Category | Description | Default priority |
|---|---|---|
| `interview` | Interview invitation, scheduling | High |
| `offer` | Job offer, salary proposal | High |
| `recruiter_new` | New recruiter outreach (no prior application) | Medium |
| `recruiter_reply` | Recruiter reply to an application | Medium |
| `follow_up` | Application without response, needs following up | Medium-Low |
| `rejected` | Application rejection | Low |
| `new_job_must` | New job matching Must-have | Medium-High |
| `new_job_strong` | New job matching Strong | Medium |
| `new_job_nice` | New job matching Nice | Low |
| `newsletter` | Newsletter with relevant jobs | Low |

Contextual priority adjusts based on:
- Salary vs expectation (higher than expected → raises priority)
- Profile fit (AI Strategy + Manager + remote → raises)
- Time urgency (interview in 24h → high)
- Process stage (more advanced → higher priority)

### 3. Prepare drafts

**Gold Rule 6: ALWAYS show draft to user before sending. Never send without approval.**

For each item that requires a response:

1. **Extract action items from the original message** — before researching anything, parse the message and list what concrete actions the sender requests: is there a calendar link? do they ask for a CV? do they ask to fill out a form? do they ask to schedule? Highlight **immediate actions** (e.g: "there's a Google Calendar link, you can schedule now") vs **actions requiring a decision** (e.g: "they ask to confirm interest")
2. **Research the company** (web search): what they do, size, funding, culture, stack if visible
3. **Analyze fit** with user's profile (goal #1: AI workflows, goal #2: Manager sacrificable)
4. **Prepare draft** using user's style (warm, direct, in Spanish or English depending on context)

Draft types:

- [ ] **interview:** confirm + propose 2-3 time slots based on user availability
- [ ] **offer:** thank + ask for details (salary, benefits, equity, start date) before negotiating
- [ ] **recruiter_new:** express interest or decline based on profile fit. If interested, share availability. Mention something specific about the researched company
- [ ] **recruiter_reply:** respond based on context (schedule, send additional info, negotiate)
- [ ] **follow_up:** brief message reminding about the application and reiterating interest
- [ ] **rejected:** thank + keep door open (optional, only if company is of interest)
- [ ] **new_job_must:** prepare complete application (cover letter + CV) for auto-apply
- [ ] **new_job_strong/nice:** only list in summary, don't prepare draft

Drafts are saved to `messages.draft` as JSONB.

### 4. Executive summary

Present to user ordered by priority (high → low).

**Template for promising proposal** (new recruiter outreach with JD + action items):

```
🎉 Promising proposal: [Role] at [Company]

Company: [what they do, size, funding, partners, expansion]
Fit: [Excellent/Good/Fair. Why]
Reports to: [CTO/VP Eng/etc]
Compensation: [Not mentioned / $X]
Work mode: [Not mentioned / Remote / Hybrid]

📆 Calendar to book: [link]
📎 JD: Read ([key points of the role in 1 line])

Want me to research more about [Company]?
Want me to prepare a reply draft?
```

**Format for remaining items** (ordered by priority):

```
## Updates summary (12 items)

### High priority (3)
1. [interview] Google - Engineering Manager AI - Technical interview Tuesday 15:00
   → Draft: confirm + propose time slots
   → [Approve] [Edit] [Reject]

2. [offer] Stripe - $7k/mo - Offer with 0.1% equity
   → Draft: thank + ask for details
   → [Approve] [Edit] [Reject]

3. [interview] Remote - AI Strategy Lead - Recruiter screening Thursday
   → Draft: confirm + propose time slots
   → [Approve] [Edit] [Reject]

### Medium priority (5)
4. [recruiter_new] Meta - Recruiter outreach for Staff EM
   → Draft: express interest
   → [Approve] [Edit] [Reject]
...

### Low priority (4)
10-12. [rejected] 3 rejections (Mercado Libre, Globant, Bumeran)
   → [Batch: thank all] [Ignore]

13. [newsletter] Get on Board - 15 new jobs this week
   → [View jobs] [Ignore]
```

### 5. Hybrid validation

- **One by one** for high priority (interview, offer): user approves, edits, or rejects each draft individually
- **Batch** for medium and low priority: user can approve all items in a category with one action
- **Auto-apply** Must-match: agent applies automatically and notifies in the summary
- If user edits a draft → update before sending
- If user rejects → mark as `ignored` in DB

### 6. Sending

- After approval (individual or batch), agent sends automatically
- Gmail: reply to email or send new
- LinkedIn: reply to message or send DM
- Platforms: complete application form
- Record send in DB (`messages.sent_at`, `messages.status = sent`)

### 7. Cleanup

- [ ] **Delete** irrelevant emails (rejections, non-relevant job alerts, marketing) — ask user before batch deleting
- [ ] **Archive** emails already replied to or processed
- [ ] **Mark as spam** recurring job alerts if user requests it

### 8. Close

- [ ] Update `last_review_at` in DB
- [ ] Update application stages based on responses received. **Use `pipeline.js --move <id> <stage>`** instead of direct UPDATE to keep the audit trail in `data.stage_history`. Canonical stages: `discovered`, `contacted`, `applied`, `in_review`, `screening`, `interview`, `offer`, `hired`, `rejected`, `withdrawn`, `skipped`. See AGENTS.md "Pipeline kanban"
- [ ] Report to user: "Sent 5 replies, 2 automatic applications, 3 items ignored, 8 emails deleted"

## DB access

**All DB access via `scripts/db.js`** (see `db` skill). Read-only by default, `--write` for inserts/updates.

Schema (create on first run with `--write`):

```bash
node scripts/db.js "CREATE TABLE IF NOT EXISTS applications (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), platform TEXT, company TEXT, role TEXT, url TEXT, status TEXT DEFAULT 'applied', applied_at TIMESTAMPTZ DEFAULT NOW(), data JSONB DEFAULT '{}')" --write

node scripts/db.js "CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, application_id INTEGER REFERENCES applications(id) NULL, user_id INTEGER REFERENCES users(id), channel TEXT, direction TEXT, sender TEXT, subject TEXT, body TEXT, draft TEXT, status TEXT DEFAULT 'pending', received_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, data JSONB DEFAULT '{}')" --write
```

Typical queries:

```bash
# Pending follow-ups
node scripts/db.js "SELECT id, company, role, applied_at FROM applications WHERE user_id = 1 AND status = 'applied' AND applied_at < NOW() - INTERVAL '5 days'"

# Save a draft
node scripts/db.js "INSERT INTO messages (user_id, channel, direction, sender, subject, body, draft, status, received_at) VALUES (1, 'gmail', 'inbound', '<sender>', '<subject>', '<body>', '<draft>', 'draft', NOW())" --write

# Mark sent
node scripts/db.js "UPDATE messages SET status = 'sent', sent_at = NOW() WHERE id = <id>" --write

# Update last_review_at
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{last_review_at}', '\"<iso>\"') WHERE id = 1" --write
```

`users.data.last_review_at` (JSONB) tracks the last review timestamp.

## Rules

- Run sources in parallel to minimize time
- Drafts always use `style_profile` from DB
- Follow-up timing is contextual: 3 days urgent, 5 normal, 7 cold
- Auto-apply only Must-match. Strong and Nice are listed, not applied
- Gmail filter: everything related to job search and job sites
- Platforms: only check if there are pending applications in DB
- Persist everything: applications, messages, drafts, sends
- `last_review_at` in `users.data` to know since when to search
- If no updates: reply "No updates. Last review: [date]"
- Single user (repo owner)

## LinkedIn learnings

- LinkedIn uses tiptap editor — `ref`s change after every action. ALWAYS take a new snapshot before interacting
- Messages: navigate to `linkedin.com/messaging/` → snapshot → look for unread conversations
- Notifications: navigate to `linkedin.com/notifications/` → snapshot
- `mcp6_send_message` and `mcp6_connect_with_person` require `confirm_send: true` (if using LinkedIn MCP)

### Voyager GraphQL inbox endpoint (bulk fetch — PREFERRED over UI scraping)

**Use this instead of opening conversations one by one.** One HTTP call returns ALL conversations with participants, unread count, last message preview, and last activity timestamp.

**Script:** `scripts/linkedin-inbox.js` — run via:
```bash
node scripts/browser.js tab-new "https://www.linkedin.com/messaging/" --name linkedin
sleep 3
node scripts/browser.js exec eval --tab linkedin "$(cat scripts/linkedin-inbox.js)"
```

**Returns JSON array:** `[{participants, unreadCount, lastActivityAt, lastMessage: {text, deliveredAt, isFromSelf}, threadId}, ...]`

**How it works:**
- Endpoint: `GET /voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.<ID>&variables=(mailboxUrn:urn%3Ali%3Afsd_profile%3A<selfId>)`
- Headers: `csrf-token` (from JSESSIONID cookie, stripped of quotes), `accept: application/vnd.linkedin.normalized+json+2.1`, `x-restli-protocol-version: 2.0.0`
- Runs inside `page.evaluate()` so it has all cookies automatically (no need to extract li_at)
- Query ID changes over time. To find the current one: intercept network requests via `performance.getEntriesByType('resource')` and grep for `messengerConversations`
- Self fsd_profile_id: extract from HTML via `document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g)` (most frequent match)

**Decision logic after fetch:**
- `unreadCount > 0` → open that thread in UI to read full message and respond
- `lastMessage.isFromSelf === true` → waiting for reply, no action needed
- `lastMessage.isFromSelf === false` AND `unreadCount === 0` → already read but no reply sent (may need follow-up)
- `lastActivityAt` → compare against `last_review_at` to detect new activity since last run
- `threadId` → extract the `2-XXXXX` part for direct navigation: `https://www.linkedin.com/messaging/thread/<threadId>/`

**Important:** The query ID (`messengerConversations.0d5e6781bbee71c3e51c8843c6519f48`) was valid as of Aug 2026. If the endpoint returns HTML instead of JSON, the query ID is stale. Re-extract it from `performance.getEntriesByType('resource')` after loading the messaging page.

### Voyager send message endpoint (text only — no attachment)

**Use this to send text messages without opening the compose UI.** One HTTP call sends the message and returns the conversation URN.

**Script:** `scripts/linkedin-send-new.js` — edit `RECIPIENT_ID` and `MESSAGE_TEXT` inside, then:
```bash
node scripts/browser.js exec eval --tab linkedin "$(cat scripts/linkedin-send-new.js)"
```

**New conversation (first message to a connection):**
- Endpoint: `POST /voyager/api/messaging/conversations?action=create`
- Body: `{"keyVersion":"LEGACY_INBOX","conversationCreate":{"eventCreate":{"value":{"com.linkedin.voyager.messaging.create.MessageCreate":{"attributedBody":{"text":"...","attributes":[]}}}},"recipients":["<fsd_profile_id>"],"subtype":"MEMBER_TO_MEMBER"}}`
- Returns: `{"data":{"value":{"createdAt":...,"conversationUrn":"urn:li:fs_conversation:2-...","backendConversationUrn":"urn:li:messagingThread:2-..."}}}`

**Reply to existing conversation:**
- Endpoint: `POST /voyager/api/messaging/conversations/{chatId}/events?action=create`
- `chatId` = the `2-XXXXX` part of the threadId (URL-encoded)
- Body: `{"eventCreate":{"value":{"com.linkedin.voyager.messaging.create.MessageCreate":{"attributedBody":{"text":"...","attributes":[]}}}}}`

**Headers (same as inbox):** `csrf-token`, `x-restli-protocol-version: 2.0.0`, `accept: application/vnd.linkedin.normalized+json+2.1`, `content-type: application/json`

**Recipient format:** `fsd_profile_id` (e.g. `ACoAA...`). Extract from profile page HTML: `document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g)` (most frequent match, excluding self).

### Voyager upload attachment endpoint (works — but send with attachment does NOT)

**Upload works. Sending a message with the uploaded attachment via HTTP endpoint does NOT work.** The UI send uses WebSocket which cannot be replicated via fetch/XHR. For attachments, use the UI flow (see "Attach file" section below).

**Upload flow (2 steps):**

Step 1 — Register upload:
- Endpoint: `POST /voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload`
- Body: `{"mediaUploadType":"MESSAGING_FILE_ATTACHMENT","fileSize":<bytes>,"filename":"<name>"}`
- Returns: `{"data":{"value":{"urn":"urn:li:digitalmediaAsset:...","mediaArtifactUrn":"urn:li:digitalmediaMediaArtifact:(...)","singleUploadUrl":"https://www.linkedin.com/dms-uploads/...","pollingUrl":"https://www.linkedin.com/dms/processStatus/..."}}}`

Step 2 — Upload binary:
- `PUT` to `singleUploadUrl` with `Content-Type: application/pdf` (or appropriate MIME) and raw file bytes as body
- Returns HTTP 201 on success

Step 3 — Poll status (optional):
- `GET` the `pollingUrl` until `status["urn:li:digitalmediaRecipe:messaging-document"]` is `AVAILABLE`

**What does NOT work (tested Aug 2026):**
- `POST /voyager/api/messaging/conversations?action=create` with `attachments` array → 500 `UNKNOWN_MESSAGING_PLATFORM_DOWNSTREAM_EXCEPTION` regardless of attachment structure (tried: `MessageAttachment` wrapper, flat fields, URN string array, `mediaArtifactUrn` vs `urn`, `mediaType: FILE`, `content-type: text/plain`)
- `POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage` → 400 (requires WebSocket-based tracking, `conversationUrn` format is strict, `trackingId` must be binary)
- The real UI send uses **WebSocket** — confirmed by intercepting all fetch/XHR POSTs during a UI send with attachment: no messaging endpoint call was captured

**Conclusion:** For messages with attachments, use the UI flow. The endpoint is only useful for text-only messages.

### Attach file (UI flow — REQUIRED for attachments)

Since the endpoint cannot send attachments, use the UI:

1. Navigate to the conversation thread
2. Take snapshot, find `button "Attach a file to your conversation with <name>"` ref
3. Click it → file chooser opens
4. `node scripts/browser.js exec upload "<file_path>" --tab linkedin`
5. Wait 3s for upload to process
6. Fill the textbox with the message text
7. Take snapshot, verify Send button is enabled (`[cursor=pointer]`)
8. Click Send
9. Verify message appears in the thread

**Attach buttons only appear when a conversation is open** (not in the messaging overlay/list view). Navigate to a specific thread first.

### Tiptap editor (compose message)

- **`fill` with the textbox ref works** for writing text into tiptap. Example: `node scripts/browser.js exec fill e770 "message text" --tab linkedin`. This is the reliable method
- **`type` without a ref does NOT work** — it types into whatever is focused but tiptap's contenteditable doesn't always receive it. Always use `fill <ref>` instead
- **`type <text>` (positional, no ref) fails** with multiline text — playwright-cli parses it as multiple arguments. Never use `type` for LinkedIn messages
- **The snapshot does NOT show typed text inline** — tiptap paragraphs appear empty (`paragraph [ref=eXXX]` with no text). To verify text was entered, use `eval`: `node scripts/browser.js exec eval --tab linkedin "document.querySelector('[contenteditable=true]')?.innerText?.substring(0,300)"`
- **Send button**: starts `disabled`, becomes enabled (`[cursor=pointer]`) when there is text OR an attachment. Check with grep: `grep "button.*Send" page-snapshot.yml`
- **Internal paragraph refs** inside the textbox (e.g. `e860`, `e861`) are NOT stable — they change after every action and clicking them often fails with "Ref not found". Always interact with the textbox ref itself, not its children

### Attachments (CV / files)

- **Attach a file**: click the "Attach a file" button → a file chooser opens (`[File chooser]: can be handled by upload`) → use `node scripts/browser.js exec upload "/path/to/file.pdf" --tab linkedin`
- **Verify attachment**: after upload, the snapshot shows `figure "filename.pdf • XXX KB Attached"` with a heading and a remove button
- **Attachment persists** across snapshots and text editing — no need to re-attach after writing the message
- **Send with attachment**: the Send button enables with attachment alone (even before text). Always verify both text (via `eval`) and attachment (via snapshot grep) before clicking Send

### Conversation list

- **Filter by unread**: click the "Unread" button (ref changes per snapshot) to see only unread conversations. If "No unread messages" appears, there are none
- **Search by name**: fill the "Search messages" searchbox with the sender name, press Enter, then click the matching conversation heading
- **Conversation previews**: the list shows last message preview (`paragraph` under each `heading level=3`). "You:" prefix means German sent the last message (waiting for reply). Sender name without "You:" means they sent last (may need action)
- **Thread URL pattern**: `https://www.linkedin.com/messaging/thread/2-XXXXX/` — the ID is stable per conversation and can be stored in DB for direct navigation

### Verified send flow (Aug 2026)

1. Navigate to conversation (click heading in list or goto thread URL)
2. Take snapshot, find "Attach a file" button ref
3. Click it → file chooser opens
4. `exec upload "/path/to/file.pdf"` → attachment appears in snapshot
5. Take new snapshot, find textbox ref (e.g. `e770`)
6. `exec fill e770 "message text"` (use `\n` for line breaks, works in tiptap)
7. Verify text via `eval` (innerText)
8. Verify Send button is NOT `disabled`
9. Click Send button
10. Verify "German Aliprandi sent the following messages" appears in snapshot
