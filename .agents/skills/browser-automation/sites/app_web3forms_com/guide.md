---
name: web3forms
description: Automate Web3Forms dashboard with playwright-cli. Covers keyboard navigation of form settings, submissions, spam protection, and integrations. Use when managing Web3Forms forms, checking submissions, or configuring spam protection. Part of the browser-automation skill.
verified: 2026-09-08
---

# Web3Forms Dashboard Automation

Automate the Web3Forms dashboard via `playwright-cli` using keyboard-first patterns. Web3Forms is a standard HTML app with simple navigation — keyboard interaction works without any special configuration.

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
# Focus a nav link by text
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const links = document.querySelectorAll('nav a, [role=navigation] a');
  const target = Array.from(links).find(a => a.textContent.includes('Settings'));
  if (target) { target.focus(); return 'focused: ' + target.href; }
  return 'not_found';
})()"

# Activate the focused link
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**Note:** Some nav items (Inbox, Spam) may not appear in `nav a` queries — they may be rendered as buttons or in a different container. Use `find` or a broader selector if a link is not found.

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

# If login needed: user logs in manually, then save state
node .agents/skills/browser-automation/scripts/browser.js save-state
node .agents/skills/browser-automation/scripts/browser.js close

# Next sessions: load state and go headless
node .agents/skills/browser-automation/scripts/browser.js open "https://app.web3forms.com"
node .agents/skills/browser-automation/scripts/browser.js load-state
```

## Core flows

### Read submissions

```bash
# Navigate to submissions page
node .agents/skills/browser-automation/scripts/browser.js goto "https://app.web3forms.com/forms/<form_id>/submissions"

# Wait for submissions to load
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 30; i++) {
    const rows = document.querySelectorAll('tr, [role=row]');
    if (rows.length > 0) return 'ready: ' + rows.length + ' rows';
    await new Promise(r => setTimeout(r, 500));
  }
  return 'timeout';
})()"

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

# Find and change the spam protection select/radio
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
- **Do NOT rely on `nav a` for all navigation items.** Some items (Inbox, Spam) may be rendered differently. Use `find` or direct URL navigation as fallback.

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
