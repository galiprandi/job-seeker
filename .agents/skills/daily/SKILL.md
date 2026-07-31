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
  Respect: `daily_frequency` (on-demand / 1x/day / 2x/day), `sources_active` (which pillars to activate), `apply_batch_size` and `targets_batch_size` (passed to sub-flows). If `daily` not in `sources_active`, warn the user

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

Decision logic respects strategy:
- If `strategy.daily_frequency = on-demand` → don't auto-run apply/targets, only run news
- If `strategy.daily_frequency = 1x/day` → run apply/targets if last application > 2 days ago
- If `strategy.daily_frequency = 2x/day` → run apply/targets if last application > 1 day ago
- Which pillar to run depends on `strategy.sources_active`:
  - If `apply` in sources_active and `apply_batch_size > 0` → run `apply` with N = `apply_batch_size`
  - If `targets` in sources_active and `targets_batch_size > 0` → run `targets` with batch = `targets_batch_size`
- If `last_application` is recent enough → done. Report: "Last application: X. No need to apply today."

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
