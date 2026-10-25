---
name: web3forms
description: Automate Web3Forms dashboard with agent-browser. Covers keyboard navigation of form settings, submissions, spam protection, and integrations. Use when managing Web3Forms forms, checking submissions, or configuring spam protection. Part of the browser-automation skill.
verified: 2026-09-08
domains:
  - app.web3forms.com
  - web3forms.com
---

# Web3Forms Dashboard Automation

Automate the Web3Forms dashboard via `agent-browser` using keyboard-first patterns. Web3Forms is a standard HTML app with simple navigation — keyboard interaction works without any special configuration.

## Keyboard shortcuts

Web3Forms does not have app-specific keyboard shortcuts. It uses standard HTML navigation — all interactions work via `Tab`, `Shift+Tab`, and `Enter`. No settings need to be enabled.

### Navigation

The sidebar nav links are standard `<a>` tags. Focus + Enter navigates to each section.

| Section | URL pattern |
|---|---|
| Form Setup | `https://app.web3forms.com/forms/<form_id>/setup` |
| Settings | `https://app.web3forms.com/forms/<form_id>/settings` |
| Submissions | `https://app.web3forms.com/forms/<form_id>/submissions` |
| Integrations | `https://app.web3forms.com/forms/<form_id>/integrations` |

**Usage:**
```bash
# Find a nav link by text and click it (PREFERRED — semantic locator)
node .agents/skills/browser-automation/scripts/browser.js exec find text "Settings" click

# Alternative: focus the link via find, then activate with Enter
node .agents/skills/browser-automation/scripts/browser.js exec find text "Settings" focus
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**Note:** Some nav items (Inbox, Spam) may not be links — they can be rendered as buttons or in a different container. If `find text` does not match, try `find role link "<name>"` / `find role button "<name>"`, or take a `snapshot -i` and click the ref.

### Direct URL navigation (PREFERRED)

Web3Forms URLs are stable and predictable. For known destinations, navigate directly:

```bash
# Go to submissions
node .agents/skills/browser-automation/scripts/browser.js goto "https://app.web3forms.com/forms/<form_id>/submissions"

# Go to settings
node .agents/skills/browser-automation/scripts/browser.js goto "https://app.web3forms.com/forms/<form_id>/settings"
```

## Setup

```bash
# Open Web3Forms (headed for login)
node .agents/skills/browser-automation/scripts/browser.js open "https://app.web3forms.com" --headed

# If login needed: user logs in manually. The session persists in .browser-profile —
# no save/load step exists or is needed.

# Next sessions: just reopen
node .agents/skills/browser-automation/scripts/browser.js open "https://app.web3forms.com"
```

## Core flows

### Read submissions

```bash
# Navigate to submissions page
node .agents/skills/browser-automation/scripts/browser.js goto "https://app.web3forms.com/forms/<form_id>/submissions"

# Wait for submissions to load
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "document.querySelectorAll('tr, [role=row]').length > 0"

# Extract submission data
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const rows = document.querySelectorAll('tr, [role=row]');
  return JSON.stringify(Array.from(rows).slice(0, 20).map(r => ({
    text: r.textContent.trim().substring(0, 200),
  })));
})()"
```

### Change spam protection level

Web3Forms has three spam protection levels: Strict, Basic, and None. Strict can cause false positives with legitimate submissions.

```bash
# Navigate to settings
node .agents/skills/browser-automation/scripts/browser.js goto "https://app.web3forms.com/forms/<form_id>/settings"

# Try a semantic locator first (unverified after agent-browser migration — control may be a select or radios)
node .agents/skills/browser-automation/scripts/browser.js exec find role radio "Basic" click

# Fallback: set the select/radio via eval
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  // Look for select or radio group with spam protection options
  const select = document.querySelector('select[name*=\"spam\"], select[id*=\"spam\"]');
  if (select) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    nativeSetter.call(select, 'basic');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return 'select_changed';
  }
  // Try radio buttons
  const radios = document.querySelectorAll('input[type=radio][name*=\"spam\"]');
  for (const r of radios) {
    if (r.value === 'basic' || r.value === 'Basic') { r.click(); return 'radio_clicked'; }
  }
  return 'not_found';
})()"
```

**Gotcha:** If legitimate submissions are being classified as spam, switch from Strict to Basic. This is a common issue during testing.

### Check form configuration

```bash
# Navigate to form setup
node .agents/skills/browser-automation/scripts/browser.js goto "https://app.web3forms.com/forms/<form_id>/setup"

# Read form details
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const main = document.querySelector('[role=main], main, .form-setup');
  if (main) return main.innerText.substring(0, 3000);
  return 'not_found';
})()"
```

## Anti-patterns

- **Do NOT use Strict spam protection during testing.** Strict mode classifies many legitimate submissions as spam. Use Basic for testing, switch to Strict only in production after verifying deliverability.
- **Do NOT hardcode the form access key in scripts.** The access key is a secret. Store it in environment variables or a secret manager (e.g. Infisical), not in tracked files.
- **Do NOT rely on `nav a` for all navigation items.** Some items (Inbox, Spam) may be rendered differently. Use `find role button`/`find role link` or direct URL navigation as fallback.

## API reference

Web3Forms has a simple public API for form submission (no authentication required — the access key acts as the credential).

### Submit form

```
POST https://api.web3forms.com/submit
Content-Type: application/json

{
  "access_key": "<ACCESS_KEY>",
  "name": "Sender Name",
  "email": "sender@example.com",
  "message": "Message content",
  "subject": "Optional subject",
  "from_name": "Optional from name",
  "replyto": "optional-reply-to@example.com"
}
```

**Response (success):**
```json
{ "success": true, "message": "Email sent successfully" }
```

**Response (error):**
```json
{ "success": false, "message": "Error description" }
```

**Note:** The access key is exposed in client-side code by design (it's a public form endpoint). For production, consider using a backend proxy or serverless function to keep the key out of the client bundle. Alternatively, inject the key at build time from a secret manager.

## agent-browser notes (verified 2026-10-24)
- `save-state`/`load-state` do not exist — the session persists in `.browser-profile/`.
- BLOCKER: `app.web3forms.com` gets stuck on the Cloudflare JS Challenge (headless and headed, ~50s without clearing) — the dashboard is NOT accessible via automated browser.
- Reliable path: `POST https://api.web3forms.com/submit` directly (documented above) — works without a browser.
