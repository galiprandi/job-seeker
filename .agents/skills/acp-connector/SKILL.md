---
name: acp-connector
version: "1.0.0"
description: Self-reminders and agent-managed cron via the acp-connector bridge MCP tools. Use when running behind acp-connector (Telegram/Discord bridge) and needing to schedule follow-ups, snooze checks, or create recurring jobs.
metadata:
  author: galiprandi
  tags: [acp-connector, reminders, cron, scheduling, mcp]
---

# ACP Connector

`acp-connector` is the thin bridge that connects you (an ACP agent) to the operator's messaging platforms (Telegram, Discord, HTTP, A2A peers). Every inbound message — user chats, cron fires, reminders — lands in one serialized prompt queue and reaches you as a plain prompt.

When running behind it, an `agent-reminders` MCP server is injected into your session with `reminder_*` and `cron_*` tools. If those tools aren't visible, the bridge or the agent harness doesn't support MCP servers — scheduling isn't available; tell the user.

## reminder_* tools — one-shot self-reminders

| Tool | Purpose |
|---|---|
| `reminder_create({ prompt, in?, at? })` | Schedule a one-shot reminder. Exactly one of `in`/`at` |
| `reminder_list()` | Pending reminders with `id` + `firesAt` (UTC) |
| `reminder_cancel({ id })` | Cancel |
| `reminder_update({ id, in?, at?, prompt? })` | Snooze/reschedule/reword |

- `in` = delay from now: `"10m"`, `"30m"`, `"2 hours"`, `"1 day"`.
- `at` = absolute time: `"tomorrow 10am"`, `"mañana 10:00"`, or ISO (`"2026-03-01T10:00"`). Naive times parse in the operator's configured `timezone` (default: system TZ); `firesAt` is stored in UTC.
- On fire you receive `[Reminder <id>] <prompt>` as a new prompt — **write `prompt` fully self-contained**: who, what to check, what to do next. You won't see this conversation then.
- Delivery is guaranteed-ish: if no session is active when it fires, the bridge keeps it and retries on reconnect. Max 50 active; entries 7+ days past `firesAt` are dropped.

### Follow-up loop pattern (WhatsApp / email / any outreach)

The canonical use: after sending a message that needs a reply, schedule a check — never fire-and-forget.

1. Send the message (e.g. WhatsApp to a contact).
2. `reminder_create({ prompt: "Check WhatsApp chat with <name>: did they reply to <topic>? If yes, <next step>. If not, resched with backoff.", in: "15m" })`.
3. When `[Reminder <id>]` arrives: check for a reply.
   - Replied → handle it, done. No new reminder.
   - No reply → `reminder_create` again with growing delay (15m → 30m → 1h → 3h). Include elapsed time in the prompt.
4. After ~24h of silence: stop rescheduling and notify the user through the normal channel instead of looping forever.

## cron_* tools — recurring jobs you own

| Tool | Purpose |
|---|---|
| `cron_create({ every \| expr, prompt })` | New recurring job. `every`: `"30m"`, `"1h"`, `"1d"`, `"1w"` (even divisors only); `expr`: raw 5-field cron (`"0 9 * * *"`) |
| `cron_list()` | All jobs; yours are `managed: "agent"`, operator's are `readOnly: true` |
| `cron_update({ id, every?, expr?, prompt?, enabled? })` | Change schedule/prompt/pause — agent jobs only |
| `cron_delete({ id })` | Delete — agent jobs only |

- Use for periodic work (daily checks, polling loops); use `reminder_*` for one-offs.
- Agent jobs persist in `acp-connector.jsonc` with `managed: "agent"` — they survive restarts.
- You cannot modify operator jobs. If one needs changing, tell the user — never work around it by creating a duplicate.

## Operator config (acp-connector.jsonc)

Single JSONC file next to where the bridge runs. Keys an agent may need to touch with permission:

```jsonc
{
  "agentCmd": "devin acp",
  "timezone": "America/Argentina/Tucuman",  // timezone for `at` reminder times (default: system TZ)
  "platforms": { "telegram": { "token": "...", "allowedChatIds": [123] } },
  "cron": [ { "name": "...", "schedule": "0 9 * * *", "prompt": "...", "enabled": true, "managed": "agent" } ],
  "routines": [ { "name": "briefing", "prompt": "..." } ],
  "echoInjectedPrompts": true,
  "logLevel": "info"
}
```

- Reminder state lives in `.acp-connector/reminders.json` — do not edit by hand; use the tools.
- `managed: "agent"` on a cron job means "the agent owns this" — set it only via `cron_create`, not by hand-editing (the runtime won't know).
- After manual config edits the bridge must be restarted; it reloads cron/reminders on boot and delivers anything past due.
