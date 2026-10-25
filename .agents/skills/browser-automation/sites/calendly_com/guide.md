---
name: calendly
description: Calendly booking pages. Pick timezone, day, slot; fill invitee form; confirm.
domains:
  - calendly.com
  - www.calendly.com
---

# Calendly — validated 2026-10-22 (unverified after agent-browser migration)

Prerequisite: read parent `SKILL.md`. All commands via `node .agents/skills/browser-automation/scripts/browser.js exec <cmd>`.

## Flow

1. Click the date button (day number) on the calendar grid: `exec snapshot -i` → `click @eN` of the day button.
2. Set timezone FIRST: `exec find text "Time zone" click` → list opens → `exec find text "<city> Time" click`. Defaults to UTC otherwise.
3. Click the slot button (`HH:MM`): `exec find text "<HH:MM>" click`.
4. `exec find text "Next" click` → `exec find label "Name" fill "<name>"`, `exec find label "Email" fill "<email>"`, fill the notes textarea (`snapshot -i` → `fill @eN`) → `exec find text "Schedule Event" click`.
5. Verify: `exec wait --text "You are scheduled"` — plus invite-sent text.
