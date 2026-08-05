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

Run all sources in parallel:

- [ ] **Gmail inbox:** search for unread emails since last review. Filter: everything related to job search and job sites (recruiters, HR, platforms, newsletters with jobs, application responses). Ignore obvious spam. Save `last_review_at` to DB to know since when to search
- [ ] **Gmail `Job Alerts` folder:** check `Job Alerts` label (alerts from platforms configured via `radar` skill). Classify each alert by fit: Must/Strong/Nice per PROFILE.md. Only present Must and Strong in the summary. Ignore Nice unless user asks to see all
- [ ] **LinkedIn messages:** unread messages in inbox. Filter recruiters, HR, application responses
- [ ] **LinkedIn notifications:** application notifications (status changes, recruiter messages)
- [ ] **LinkedIn Saved Jobs:** navigate to `https://www.linkedin.com/my-items/saved-jobs/`. For each saved job: check if still open, evaluate fit against profile (Must/Strong/Nice), check if already applied (query DB by URL or company+role). Present Must/Strong matches in summary as `new_job_must`/`new_job_strong`. If user already applied, skip. If job is closed, mark as `closed` and remove from saved
- [ ] **Platforms:** only if there are pending applications in DB. Navigate to each platform, check status of existing applications
- [ ] **Pending follow-ups:** query DB for applications without response after X days (contextual: 3 days for urgent, 5 for normal, 7 for cold)

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
