# Strider (onstrider.com) — Automation Guide

**Validated:** 2026-08-17
**Prerequisite:** [Parent SKILL.md](../../SKILL.md) for golden rules, wrapper, and core patterns

## Overview

Strider is a LATAM-focused job platform that matches developers with US companies. It acts as an intermediary (EOR). The platform has a profile system, job opportunities feed, and a multi-step application flow with a compatibility check questionnaire.

**Canonical domain:** `app.onstrider.com`
**Profile URL:** `https://app.onstrider.com/profile`
**Jobs URL:** `https://app.onstrider.com/` (home shows active opportunities)

## Setup

### Login

First login is manual (headed mode). The platform uses email + password or Google OAuth.

```bash
node scripts/browser.js open "https://app.onstrider.com" --headed
# user logs in manually
node scripts/browser.js save-state
node scripts/browser.js close
```

Subsequent sessions reuse the saved profile. No captcha observed during login.

### Cookie banner

A cookie consent banner appears on first visit. Click "Accept" before interacting:

```bash
node scripts/browser.js exec eval "(async function(){
  var btns = document.querySelectorAll('button, a');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.trim() === 'Accept' && btns[i].offsetParent !== null) {
      btns[i].click();
      return 'accepted';
    }
  }
  return 'not_found';
})()"
```

## Core flows

### 1. Read profile

Navigate to the profile page and extract the current state:

```bash
node scripts/browser.js goto "https://app.onstrider.com/profile"
node scripts/browser.js exec eval "(async function(){
  await new Promise(r => setTimeout(r, 3000));
  var body = document.body.innerText;
  var idx = body.indexOf('Open to roles');
  return idx > -1 ? body.substring(idx, idx + 800) : 'not_found';
})()"
```

The profile page shows: name, location, completeness %, roles, main skills (with years), bio, pay rate, work experience list.

### 2. Update roles and skills

The "Edit" button next to "Open to roles" opens a modal dialog with both roles and skills in one form.

**Open the dialog:**

```bash
# Find the Edit button near "Open to roles" — use snapshot to get the ref
node scripts/browser.js exec snapshot
# Look for: button "Edit" [ref=eXXX] near "Open to roles"
node scripts/browser.js exec click <ref>
```

**Add a role:** Click on a role name in the "Other roles you might consider" list:

```bash
node scripts/browser.js exec eval "(async function(){
  var dialog = document.querySelector('[role=dialog]');
  if (!dialog) return 'no_dialog';
  var items = dialog.querySelectorAll('button, div[role=button], li, div');
  for (var i = 0; i < items.length; i++) {
    if (items[i].textContent.trim() === '<ROLE_NAME>' && items[i].offsetParent !== null) {
      items[i].click();
      return 'clicked';
    }
  }
  return 'not_found';
})()"
```

**Update skills:** Skills are autocomplete inputs with a dropdown of predefined options. `fill` and native value setter do NOT persist — see [react-autocomplete-inputs.md](react-autocomplete-inputs.md) for the working pattern.

**Update years of experience:** Each skill has a combobox (select) for years. Use `select` with the combobox ref from snapshot:

```bash
node scripts/browser.js exec select <combobox_ref> "10+ years"
```

**Save:**

```bash
node scripts/browser.js exec eval "(async function(){
  var dialog = document.querySelector('[role=dialog]');
  var btns = dialog.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.trim() === 'Save' && btns[i].offsetParent !== null) {
      btns[i].click();
      return 'saved';
    }
  }
  return 'no_save';
})()"
```

**Verify:** Check that the profile page reflects the changes after the dialog closes.

### 3. Update bio

The bio is a simple textarea in a modal. `fill` works directly:

```bash
# Find Edit button near "Bio" via snapshot
node scripts/browser.js exec click <bio_edit_ref>
# Find the "Short bio" textbox via find
node scripts/browser.js exec find "Short bio"
# Fill
node scripts/browser.js exec fill <textarea_ref> "<bio text>"
# Save
```

Bio limit: 1000 characters. A counter shows `NNN / 1000`.

### 4. Add work experience

Click "Add new" in the Work experience section. A modal opens with:
- Company name (autocomplete with suggestions + "Create <name>" option)
- Company website
- Title (autocomplete with standardized role suggestions)
- Closest role type
- Skills used (clickable from suggested main skills)
- Company location
- Remote checkbox
- Start date (date input, format: `YYYY-MM-DD`)
- "I currently work in this role" checkbox
- Description (DraftJS editor — see [draftjs-editor-fill.md](draftjs-editor-fill.md))

**Company name autocomplete:** Type the name, wait for suggestions, click "Create <name>" if the company isn't in the list.

**Title autocomplete:** Type the role, wait for suggestions like "Add <title>", click to select.

**Start date:** Use native value setter with `YYYY-MM-DD` format:

```bash
node scripts/browser.js exec eval "(async function(){
  var input = document.querySelector('#startDate');
  var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, 'YYYY-MM-DD');
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
  return 'value:' + input.value;
})()"
```

**Description (DraftJS):** `fill` works directly on the DraftJS editor textbox. See [draftjs-editor-fill.md](draftjs-editor-fill.md).

**Save:** Click "Save" (not "Save and add another").

### 5. Apply to a job

Jobs appear on the home page with a countdown timer ("NNh NNmin to reply"). Each job shows matched/missing skills.

**Start application:** Click "I'm interested" button on the job card.

**Step 1/3:** Profile review (automatic).

**Step 2/3 — Compatibility check:** A multi-question form with:
- Number inputs for years of experience (per technology)
- Textareas for detailed answers (limit: 800 chars each)
- Radio buttons (Yes/No)
- Spinbutton for rating (1-5)
- "Link work experiences" comboboxes (required, per question)
- "This question doesn't apply" checkboxes (disables the link field)

**Fill number inputs** with native value setter:

```bash
node scripts/browser.js exec eval "(async function(){
  var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  var input = document.getElementById('answers.N.value');
  nativeSetter.call(input, '<VALUE>');
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
  return 'value:' + input.value;
})()"
```

**Fill textareas** with native value setter (same pattern, `HTMLTextAreaElement`).

**Link work experiences:** Each question has a "Link work experiences*" combobox. Click the textbox, wait for dropdown, click the matching work experience:

```bash
node scripts/browser.js exec click <link_textbox_ref>
node scripts/browser.js exec eval "(async function(){
  await new Promise(r => setTimeout(r, 2000));
  var suggestions = document.querySelectorAll('[role=option], [class*=suggestion], [class*=option]');
  for (var i = 0; i < suggestions.length; i++) {
    if (suggestions[i].textContent.trim().match(/<COMPANY>.*<DATE>/i)) {
      suggestions[i].click();
      return 'clicked';
    }
  }
  return 'not_found';
})()"
```

**Important:** If a work experience was already linked in a previous question, it may not appear in the dropdown for subsequent questions. Link a different one or use the checkbox "This question doesn't apply."

**Checkbox "doesn't apply":** Clicking it disables the link field. If the spinbutton/rating is also disabled by this checkbox, uncheck it first, set the value, then decide whether to re-check.

**Next button:** The form does NOT advance if required "Link work experiences" fields are empty. No error messages are shown — the button click silently fails. Check all link fields are filled before clicking Next.

**Step 3/3 — Review:** Shows a summary. Click "Submit application."

**Post-submit:** The platform may require an "English Check" (2 recorded videos in English). This is a human-only step — the agent cannot record videos.

### 6. Navigate to a specific job

Jobs have a UUID-based URL:

```
https://app.onstrider.com/job-opportunities/<UUID>
```

The home page link uses a different URL format with query params. Navigate directly to the UUID URL if you have it.

## API reference

No internal API endpoints were captured during this session. The platform appears to use a Next.js backend with server-side rendering. API capture would require network inspection during form submissions.

## Anti-patterns

- **Don't use `fill` on skill autocomplete inputs** — React state reverts the value. Use the type-prefix + click-option pattern instead.
- **Don't use native value setter on skill inputs** — Same issue: React reverts on blur.
- **Don't assume "Next" will show validation errors** — It silently fails if required fields are empty. No error messages appear.
- **Don't reuse work experience options across questions** — Once a work experience is linked in one question, it may not appear in the dropdown for others.
- **Don't use `fill` on the date input** — Use native value setter with `YYYY-MM-DD` format. `fill` times out.
- **Don't forget the cookie banner** — It blocks interaction on first visit. Accept it first.
- **Don't assume the job is on the home page** — Jobs have a countdown timer and may expire. Navigate directly to the job UUID URL if you have it.

## Gotchas

- **Profile completeness shows 100% even when skills are suboptimal.** The percentage measures field coverage, not match quality.
- **Skills are limited to 10.** Adding a new one requires replacing an existing one.
- **The "I'm interested" button is the only way to start an application.** There's no "Apply" button on the job detail page from the referral link.
- **The application form is a single page with all questions visible.** Scrolling is needed to reach all questions and the Next button.
- **The spinbutton for AI tools rating is disabled when "doesn't apply" is checked.** Uncheck it to set the value, then decide whether to re-check based on the question's relevance.
