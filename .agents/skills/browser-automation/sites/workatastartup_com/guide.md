---
name: workatastartup
description: YC Work at a Startup. Account signup, 7-step profile wizard, job apply with founder message.
domains:
  - workatastartup.com
  - www.workatastartup.com
  - account.ycombinator.com
---

# YC Work at a Startup — validated 2026-10-21 (unverified after agent-browser migration)

Prerequisite: read parent `SKILL.md`. All commands via `node .agents/skills/browser-automation/scripts/browser.js exec <cmd>`.

## Flow

- Job link → `exec find text "Apply to role" click` → `account.ycombinator.com` signup (email, first/last, username, password — `find label "<field>" fill "<value>"`).
- Wizard: About me → Location → Role → Experience (upload resume to autofill: `snapshot -i` → `exec upload @eN "<cv-path>"`) → Skills → Career → Share → `Finish`.
- `My enrollments`/directory confirms profile live. Per-job apply opens a `dialog[open]` with a message box to the founder — `snapshot -i` the dialog, `fill @eN` the textarea, then Send. "Applied" text confirms (`exec wait --text "Applied"`).

## Gotchas

- Skills step multiselect (react-select): click the control → `exec keyboard type "<skill>"` → click the `[role=option]` ref from a fresh `snapshot -i`; repeat per skill. Programmatic value-set fails.
- Radio groups register only via the label-wrapper `generic` ref, not the `input` — target the wrapper `@eN`.
- "What job type(s)" is checkboxes (Full-time/Contractor/Cofounder).
- YC profile is reusable across hundreds of startups — one-time setup.
