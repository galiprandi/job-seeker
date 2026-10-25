---
name: cloudflare-dash
description: Automate Cloudflare dashboard with agent-browser. Covers Quick Search (Cmd+K), ARIA tablist keyboard navigation, Email Routing, DNS management, and account switching. Use when managing Cloudflare zones, DNS records, email routing rules, or dashboard settings. Part of the browser-automation skill.
verified: 2026-09-08
domains:
  - dash.cloudflare.com
---

# Cloudflare Dashboard Automation

Automate the Cloudflare dashboard via `agent-browser` using keyboard-first patterns. Cloudflare's dashboard is a well-structured SPA with excellent ARIA support — keyboard navigation is highly reliable.

## Keyboard shortcuts

Cloudflare's dashboard has strong keyboard support. No settings need to be enabled — shortcuts work out of the box.

### Quick Search (Cmd+K / Ctrl+K)

The Quick Search dialog is the primary entry point for navigation. It opens a command palette that can navigate to any section, zone, or setting.

| Shortcut | Action |
|---|---|
| `Meta+k` / `Ctrl+k` | Open Quick Search |
| `ArrowDown` / `ArrowUp` | Navigate search results |
| `Enter` | Activate selected result |
| `Escape` | Close Quick Search |

**Usage:**
```bash
# Open Quick Search — focus moves to search input automatically
node .agents/skills/browser-automation/scripts/browser.js exec press "Meta+k"

# Type a query (focus is already on the search input)
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "activity log"

# Navigate results with ArrowDown, then Enter to activate
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowDown
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**Gotcha:** The Quick Search button (`@eN`) is a `<button>`, not an `<input>`. Do NOT try to `fill` the button ref. After `Meta+k`, the actual `<input>` inside the dialog receives focus automatically — `exec keyboard type` into it, or find the input ref from a fresh `snapshot -i` and `fill` it.

### ARIA tablist navigation

Cloudflare uses WAI-ARIA compliant tablists for section navigation (e.g., Email Routing has tabs: Overview, Activity Log, Routing rules, Settings). These support full keyboard navigation.

| Shortcut | Action |
|---|---|
| `Tab` | Move focus to the tablist |
| `ArrowRight` / `ArrowLeft` | Move focus between tabs |
| `Enter` | Activate focused tab |
| `Home` / `End` | First / last tab |

**Usage:**
```bash
# Focus a tab in the tablist via semantic locator (PREFERRED)
node .agents/skills/browser-automation/scripts/browser.js exec find role tab "Activity Log" focus

# Move to the next tab (right)
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowRight

# Activate the focused tab
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

If `find role tab` does not match (unverified after agent-browser migration), take a `snapshot -i` and click the tab's `@eN` ref directly.

**Why this is better than clicking:** Tab refs change on every page mutation in the SPA. Arrow key navigation moves focus relative to the current tab — no ref needed. This is the most reliable pattern for Cloudflare tab navigation.

### Standard navigation links

Sidebar and nav links are standard `<a>` tags with `tabindex=0`. Focus + Enter works:

```bash
# Focus a nav link by text (semantic locator)
node .agents/skills/browser-automation/scripts/browser.js exec find text "Email Routing" focus

# Activate the focused link
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

## Setup

```bash
# Open Cloudflare dashboard (headed for login)
node .agents/skills/browser-automation/scripts/browser.js open "https://dash.cloudflare.com" --headed

# If login needed: user logs in manually. The session persists in .browser-profile —
# no save/load step exists or is needed.

# Next sessions: just reopen
node .agents/skills/browser-automation/scripts/browser.js open "https://dash.cloudflare.com"
```

## Direct URL navigation (PREFERRED for known sections)

Cloudflare URLs are stable and well-structured. For known destinations, navigate directly instead of using Quick Search or clicking.

| Section | URL pattern |
|---|---|
| Dashboard home | `https://dash.cloudflare.com/<account_id>` |
| Email Routing overview | `https://dash.cloudflare.com/<account_id>/email-service/routing/<routing_id>/overview` |
| Email Routing activity log | `https://dash.cloudflare.com/<account_id>/email-service/routing/<routing_id>/activity-log` |
| Email Routing routing rules | `https://dash.cloudflare.com/<account_id>/email-service/routing/<routing_id>/routing-rules` |
| DNS records | `https://dash.cloudflare.com/<account_id>/<zone_name>/dns/records` |

**Note:** `account_id` and `routing_id` are long hex strings visible in the URL bar when navigating the dashboard. Extract them once and reuse.

## Email Routing

### Check routing status

```bash
# Navigate to Email Routing overview
node .agents/skills/browser-automation/scripts/browser.js goto "https://dash.cloudflare.com/<account_id>/email-service/routing/<routing_id>/overview"

# Read status from DOM
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const text = document.querySelector('[role=main]')?.innerText || '';
  const enabled = /Enabled|Activado/i.test(text);
  const dns = /Locked|Bloqueado|Enabled/i.test(text);
  return JSON.stringify({ routingEnabled: enabled, dnsConfigured: dns });
})()"
```

### Check activity log

```bash
# Navigate directly to activity log
node .agents/skills/browser-automation/scripts/browser.js goto "https://dash.cloudflare.com/<account_id>/email-service/routing/<routing_id>/activity-log"

# Or use ARIA tablist: focus Activity Log tab, ArrowRight to next tab, Enter
# (see ARIA tablist navigation above)

# Read log entries
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const rows = document.querySelectorAll('[role=row], tr');
  const entries = Array.from(rows).slice(0, 10).map(r => r.textContent.trim().substring(0, 100));
  return JSON.stringify(entries);
})()"
```

### Add missing DNS records

When Email Routing shows "DNS records not configured," use the Settings tab:

```bash
# Navigate to Email Routing settings
node .agents/skills/browser-automation/scripts/browser.js goto "https://dash.cloudflare.com/<account_id>/email-service/routing/<routing_id>/settings"

# Click "Add missing records" button (semantic locator, EN/ES)
node .agents/skills/browser-automation/scripts/browser.js exec find role button "Add records" click
# Spanish UI fallback:
node .agents/skills/browser-automation/scripts/browser.js exec find role button "Agregar registros" click
```

## Anti-patterns

- **Do NOT click stale refs after SPA navigation.** Cloudflare's SPA mutates the DOM on every route change. After `goto` or tab activation, take a fresh `find` or `snapshot` before interacting.
- **Do NOT `fill` the Quick Search button.** After `Meta+k`, the dialog's `<input>` receives focus. Type into the focused input, not the button that opened the dialog.
- **Do NOT use two separate `press` calls for Cmd+K.** Use `press "Meta+k"` in a single call. `press Meta` then `press k` does not work — the modifier must be held.

## agent-browser notes (verified 2026-10-24)
- `save-state`/`load-state` do not exist — the session persists in `.browser-profile/`.
- Headless can get stuck on Cloudflare's anti-bot challenge even with a session — use `--headed` for the first pass.
- `press Meta+k` returns success even if the shortcut did nothing — verify the effect with a follow-up eval/snapshot.
- `find` requires a type: `find text "..."` / `role` / `label` / `placeholder`.
- Missing session (Oct 2026): manual headed login required before validating post-auth sections (Quick Search, Email Routing, DNS).
