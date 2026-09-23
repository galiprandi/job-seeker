---
name: cloudflare-dash
description: Automate Cloudflare dashboard with playwright-cli. Covers Quick Search (Cmd+K), ARIA tablist keyboard navigation, Email Routing, DNS management, and account switching. Use when managing Cloudflare zones, DNS records, email routing rules, or dashboard settings. Part of the browser-automation skill.
verified: 2026-09-08
---

# Cloudflare Dashboard Automation

Automate the Cloudflare dashboard via `playwright-cli` using keyboard-first patterns. Cloudflare's dashboard is a well-structured SPA with excellent ARIA support — keyboard navigation is highly reliable.

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
node .agents/skills/browser-automation/scripts/browser.js exec fill <ref> "activity log"

# Navigate results with ArrowDown, then Enter to activate
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowDown
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**Gotcha:** The Quick Search button (`[ref=eXXX]`) is a `<button>`, not an `<input>`. Do NOT try to `fill` the button ref. After `Meta+k`, the actual `<input>` inside the dialog receives focus automatically — type into the focused element or find the input ref from a fresh snapshot.

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
# Focus a tab in the tablist (find its ref first)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const tabs = document.querySelectorAll('[role=tab]');
  const target = Array.from(tabs).find(t => t.textContent.includes('Activity Log'));
  if (target) { target.focus(); return 'focused'; }
  return 'not_found';
})()"

# Move to the next tab (right)
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowRight

# Activate the focused tab
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**Why this is better than clicking:** Tab refs change on every page mutation in the SPA. Arrow key navigation moves focus relative to the current tab — no ref needed. This is the most reliable pattern for Cloudflare tab navigation.

### Standard navigation links

Sidebar and nav links are standard `<a>` tags with `tabindex=0`. Focus + Enter works:

```bash
# Focus a nav link by text
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const links = document.querySelectorAll('nav a, [role=navigation] a');
  const target = Array.from(links).find(a => a.textContent.includes('Email Routing'));
  if (target) { target.focus(); return 'focused: ' + target.href; }
  return 'not_found';
})()"

# Activate the focused link
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

## Setup

```bash
# Open Cloudflare dashboard (headed for login)
node .agents/skills/browser-automation/scripts/browser.js open "https://dash.cloudflare.com" --headed

# If login needed: user logs in manually, then save state
node .agents/skills/browser-automation/scripts/browser.js save-state
node .agents/skills/browser-automation/scripts/browser.js close

# Next sessions: load state and go headless
node .agents/skills/browser-automation/scripts/browser.js open "https://dash.cloudflare.com"
node .agents/skills/browser-automation/scripts/browser.js load-state
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

# Click "Add missing records" button
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const btn = Array.from(document.querySelectorAll('button')).find(b =>
    b.textContent.includes('Add records') || b.textContent.includes('Agregar registros')
  );
  if (btn) { btn.click(); return 'clicked'; }
  return 'not_found';
})()"
```

## Anti-patterns

- **Do NOT click stale refs after SPA navigation.** Cloudflare's SPA mutates the DOM on every route change. After `goto` or tab activation, take a fresh `find` or `snapshot` before interacting.
- **Do NOT `fill` the Quick Search button.** After `Meta+k`, the dialog's `<input>` receives focus. Type into the focused input, not the button that opened the dialog.
- **Do NOT use two separate `press` calls for Cmd+K.** Use `press "Meta+k"` in a single call. `press Meta` then `press k` does not work — the modifier must be held.
