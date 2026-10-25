---
name: teamtailor
description: Automate job applications on Teamtailor-based career sites via browser UI or HTTP API.
verified: 2026-09-02
domains:
  - teamtailor.com
---

# Teamtailor Automation

Automate job applications on Teamtailor-based career sites. Teamtailor is a popular ATS used by many companies. Applications can be submitted via browser UI or directly via HTTP API.

## Setup

```bash
# Open the company's career site (headed for first visit, headless after)
node .agents/skills/browser-automation/scripts/browser.js open "https://<company>.teamtailor.com" --headed
```

**Cookie banner first:** on first load a cookie banner blocks "Apply for this job" (it renders as `[disabled]`). Accept or reject it before anything else:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i   # locate the accept/reject button @eN
node .agents/skills/browser-automation/scripts/browser.js exec click @eN
```

## Apply via browser UI

```bash
# 1. Navigate to the job page
node .agents/skills/browser-automation/scripts/browser.js goto "https://<company>.teamtailor.com/jobs/<job-id>"

# 2. Click "Apply for this job" - opens the application modal
node .agents/skills/browser-automation/scripts/browser.js exec find text "Apply for this job" click

# 3. "Apply with LinkedIn" lives INSIDE that modal. Never match the first
#    "LinkedIn" text on the page (that's the corporate footer link).
#    Snapshot the modal and click the right @eN ref:
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i
node .agents/skills/browser-automation/scripts/browser.js exec click @eN

# NOTE: LinkedIn apply navigates the SAME tab (no popup). history.back() does
# NOT restore the form - if you cancel, re-goto the job URL.

# 4. Fill the form fields semantically (unverified after agent-browser migration):
node .agents/skills/browser-automation/scripts/browser.js exec find label "Name" fill "<name>"
node .agents/skills/browser-automation/scripts/browser.js exec find label "Email" fill "<email>"
# Custom questions: locate each with find label/text, or snapshot -i + @eN refs.

# 5. Consent checkbox is REQUIRED before submit:
node .agents/skills/browser-automation/scripts/browser.js exec find role "checkbox" click   # verify it targets the consent box via snapshot first

# 6. Submit:
node .agents/skills/browser-automation/scripts/browser.js exec find text "Submit application" click
# fallback: exec click 'button[type="submit"]'

# 7. Email verification may be required - check inbox for verification link.
#    Click the link in the email to confirm the application.
```

The form uses Rails-style `candidate[...]` field names - a JSON API is not confirmed for this tenant; capture the real POST if you need API replay.

## Apply via HTTP API (direct POST)

Teamtailor may accept a direct POST, but structure varies per company. After the first successful application (which creates a Connect profile), subsequent applications at the same company auto-fill.

```bash
# POST /applications with the form data (STRUCTURE UNVERIFIED - capture the real
# request from a successful browser application first)
curl -X POST "https://<company>.teamtailor.com/api/v1/jobs/<job-id>/applications" \
  -H "Content-Type: application/json" \
  -d '{
    "application": {
      "name": "<Your Name>",
      "email": "<your@email.com>",
      "phone": "<your phone>",
      "resume": "<base64 encoded CV or URL>",
      "answers": {
        "custom_question_<id>": "<answer>"
      }
    }
  }'
```

**Note:** the API structure varies per company. Capture the actual POST request from a successful browser application using the request capture pattern (see main Browser Automation guide) to get the exact fields and structure. Do not assume the JSON shape above is correct.

## Connect profile

After the first successful application at a Teamtailor company, a Connect profile is created. Future applications at the same company auto-fill name, email, photo, and CV from this profile.

## Email verification

Some Teamtailor applications require email verification:
1. After submitting, check the inbox for a verification email
2. The email contains a verification link
3. Click the link (or navigate to it) to confirm the application
4. Only after verification is the application complete

```bash
# Navigate to the verification link (extracted from the email)
node .agents/skills/browser-automation/scripts/browser.js goto "<verification-link>"
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "/verified|confirmed/i.test(document.body.innerText)"
```

## Gotchas

- **Custom questions vary per company** - each company configures its own questions. Capture the form structure with `exec snapshot -i` before filling.
- **LinkedIn apply navigates the same tab** - no popup. Cancelling requires a fresh `goto` to the job page; `history.back()` does not restore the modal state.
- **Email verification** - some companies require it, some don't. Check after submit.
- **Connect profile** - only created after the first successful application. Subsequent applications are faster.
- **File upload** - some forms have hidden file inputs. Use `exec upload <path>` after clicking the file chooser button.
- **API structure varies** - don't assume the POST structure is the same across companies. Capture and replay.

## Anti-patterns

- **Don't** assume all Teamtailor sites have the same custom questions - they're company-specific.
- **Don't** match the first "LinkedIn" text on the page - the apply button is inside the modal; the page-level one is a corporate link.
- **Don't** skip email verification if required - the application won't be complete.
- **Don't** submit without checking the consent checkbox - it's required.
- **Don't** try to log in programmatically - open headed and let the user log in to LinkedIn.
- **Don't** hardcode company URLs or job IDs - read them from the consuming repo's data source.

## agent-browser notes (verified 2026-10-24)
- Cookie banner blocks "Apply for this job" (`[disabled]`) - click accept/reject first.
- "Apply with LinkedIn" lives INSIDE the modal opened by "Apply for this job" - don't match the first "LinkedIn" on the page (corporate link).
- LinkedIn apply navigates the same tab (no popup); `history.back()` doesn't restore - re-goto the job if cancelled.
- Submit requires the consent checkbox checked.
- Form is `candidate[...]` Rails-style - the JSON API is not confirmed.
- `find text`/`find role`/`snapshot -i` cover the whole UI flow; `eval` only needed for the verification-wait or unusual fields.
