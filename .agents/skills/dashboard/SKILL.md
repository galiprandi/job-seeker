---
name: dashboard
description: Opens a local web dashboard that visualizes the job application pipeline, funnel stats, recent messages, and target company status. The agent opens it at the end of a round so the user can visually review the pipeline.
trigger: dashboard
---

# Dashboard

## When to open

Open the dashboard at the end of any round that changes the pipeline:
- After `apply` finishes applying to jobs
- After `news` finishes processing updates
- After `daily` completes its routine
- After `targets` finishes registering or applying
- When the user says `dashboard`, "show me the pipeline", "show dashboard"

## How to open

```bash
node scripts/dashboard.js --open
```

This starts a local server at `http://localhost:7531` and opens it in the user's default browser. The dashboard auto-refreshes every 30 seconds.

## What it shows

- **Stats bar**: active count, in-interview count, offers, rejections, closed total
- **Funnel chart**: visual bar chart of pipeline stages (discovered -> hired)
- **Kanban board**: columns for each active stage with cards showing company, role, match level, platform, and date
- **Target companies**: registration status summary (pending, registered, no fit, etc.)
- **Recent messages**: last 10 recruiter/contact messages with channel, sender, subject, and status

## Rules

- Always use `--open` flag so it opens automatically
- If port 7531 is in use, use `--port <alternative>`
- The dashboard is read-only. To move cards, use `scripts/pipeline.js --move <id> <stage>`
- The dashboard auto-refreshes, so the user can keep it open during a session
- Close the dashboard server with Ctrl+C when the session is done

## Script reference

### `scripts/pipeline.js` -- Pipeline kanban board

The kanban board for tracking applications and contacts. Unifies LinkedIn invites, direct emails, and formal applications into a single pipeline with canonical stages.

```bash
# Full board (active cards)
node scripts/pipeline.js

# Include closed (rejected, withdrawn, skipped)
node scripts/pipeline.js --closed

# Funnel summary (counts per stage)
node scripts/pipeline.js --funnel

# Filter by stage
node scripts/pipeline.js --stage interview

# Filter by company
node scripts/pipeline.js --company <company>

# Move a card to another stage (updates status + adds to stage_history)
node scripts/pipeline.js --move 82 interview

# View card detail (with linked messages via application_id)
node scripts/pipeline.js --card 82
```

**Canonical stages (ordered):** `discovered` -> `contacted` -> `applied` -> `in_review` -> `screening` -> `interview` -> `offer` -> `hired`. Closed: `rejected`, `withdrawn`, `skipped`.

**When the agent moves cards:** when it detects a status change (recruiter replies, interview scheduled, rejection), it uses `pipeline.js --move <id> <stage>` instead of a direct UPDATE. This maintains the audit trail in `data.stage_history`.
