# Teamtailor Automation

Automate job applications on Teamtailor-based career sites. Teamtailor is a popular ATS used by many companies. Applications can be submitted via browser UI or directly via HTTP API.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Before doing anything manually, check if the consuming repo has scripts that wrap these operations.** Run `ls scripts/teamtailor*.js` to see what's available.

## Setup

```bash
# Open the company's career site (headed for first visit, headless after)
node scripts/browser.js open "https://<company>.teamtailor.com" --headed
```

## Apply with LinkedIn (browser flow)

Teamtailor supports "Apply with LinkedIn" which auto-fills name, email, photo, and CV from the LinkedIn profile.

```bash
# 1. Navigate to the job page
node scripts/browser.js goto "https://<company>.teamtailor.com/jobs/<job-id>"

# 2. Click "Apply with LinkedIn" button
node scripts/browser.js exec eval "(function(){
  const btns = document.querySelectorAll('a, button');
  for (const b of btns) {
    if (b.textContent.includes('Apply with LinkedIn') || b.textContent.includes('LinkedIn')) {
      b.click(); return 'clicked';
    }
  }
  return 'not_found';
})()"

# 3. If LinkedIn auth popup appears, wait for redirect back
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('form') && !location.href.includes('linkedin.com')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# 4. Fill custom questions (text, dropdown, radio, checkbox)
# Use find or eval to locate each field and fill it

# 5. Submit the application
node scripts/browser.js exec eval "(function(){
  const btn = document.querySelector('button[type=\"submit\"], input[type=\"submit\"]');
  if (btn) { btn.click(); return 'submitted'; }
  return 'not_found';
})()"

# 6. Email verification may be required — check inbox for verification link
# Click the verification link in the email to confirm the application
```

## Apply via HTTP API (direct POST)

Teamtailor has a public API. After the first successful application (which creates a Connect profile), subsequent applications at the same company auto-fill.

```bash
# POST /applications with the form data
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

**Note:** the API structure varies per company. Capture the actual POST request from a successful browser application using the request capture pattern (see main Browser Automation guide) to get the exact fields and structure.

## Connect profile

After the first successful application at a Teamtailor company, a Connect profile is created. Future applications at the same company auto-fill name, email, photo, and CV from this profile.

## Email verification

Some Teamtailor applications require email verification:
1. After submitting, check the inbox for a verification email
2. The email contains a verification link
3. Click the link (or navigate to it) to confirm the application
4. Only after verification is the application complete

```bash
# Navigate to the verification link (extract from email)
node scripts/browser.js goto "<verification-link>"
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 30; i++) {
    if (document.body.innerText.includes('verified') || document.body.innerText.includes('confirmed')) return 'verified';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

## Gotchas

- **Custom questions vary per company** — each company configures its own questions. Capture the form structure with a snapshot before filling.
- **LinkedIn auth popup** — may open in a new tab. Handle it with tab management.
- **Email verification** — some companies require it, some don't. Check after submit.
- **Connect profile** — only created after the first successful application. Subsequent applications are faster.
- **File upload** — some forms have hidden file inputs. Use `exec upload <path>` after clicking the file chooser button.
- **API structure varies** — don't assume the POST structure is the same across companies. Capture and replay.

## Anti-patterns

- **Don't** assume all Teamtailor sites have the same custom questions — they're company-specific
- **Don't** skip email verification if required — the application won't be complete
- **Don't** try to log in programmatically — open headed and let the user log in to LinkedIn
- **Don't** hardcode company URLs or job IDs — read them from the consuming repo's data source
