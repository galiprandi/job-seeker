---
name: daily
description: Periodic routine that runs news, cleans up inbox and applies if there's no recent activity. Designed to run 1-2 times per day.
trigger: daily
---
# Daily

## Trigger

**Keyword: `daily`**

The user says `daily` (or variants: "routine", "check and apply", "check everything") and the full routine is triggered.

## Purpose

Compose the `news` and `apply` flows with decision logic to keep the job search active without manual intervention. Designed to run 1-2 times per day.

## Pre-flight

- [ ] Verify active LinkedIn and Gmail sessions. If session closed → open headed browser (Gold Rule 5) → notify user → wait for confirmation
- [ ] Always use Chrome profile `.browser-profile`
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```

## Flow

### 1. News (check updates)

Run the full `news` flow:
- Review Gmail inbox + Job Alerts folder + LinkedIn messages/notifications
- Classify by fit (Must/Strong/Nice)
- If there are messages that require a response:
  - Prepare drafts (Gold Rule 6)
  - Present executive summary by priority
  - Wait for user validation
  - Send
- If no relevant updates: continue to step 2

### 2. Cleanup inbox

- Archive processed job emails (old alerts, read newsletters)
- Mark obvious spam as spam
- Don't archive unanswered recruiter messages

### 3. Decide whether to apply

Query DB via db CLI:

```bash
node scripts/db.js "SELECT max(applied_at) AS last_application FROM applications WHERE user_id = 1"
```

- If `last_application` is less than 2 days ago → done. Report: "Last application: X. No need to apply today."
- If `last_application` is 2 days or more ago → run `apply` flow with N=10-15 jobs

### 4. Final summary

Present the user with a consolidated session summary:

- Updates found and actions taken (replies sent, pending drafts)
- Inbox cleanup: how many emails archived
- Applications: how many new applications, table with company/role/URL
- If no applications: reason (recent activity)

## Dependencies

- Depends on `news` (check updates)
- Depends on `apply` (apply if no recent activity)
- Depends on `onboarding` (DB to query last_application)
- Depends on `profile` (Must-haves for apply)

## Automation notes

This flow is designed to eventually be automated via cron (GitHub Action scheduled or local cron that triggers a Devin cloud session with prompt `daily`). In the meantime, the user triggers it manually by saying `daily`.
