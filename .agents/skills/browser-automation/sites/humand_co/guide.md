---
name: humand
description: Automate job applications on Humand.co-based career sites via guest session API.
verified: 2026-09-02
---

# Humand.co Automation

Automate job applications on Humand.co-based career sites. Humand is an ATS used by some companies. Applications are submitted via their internal API with a guest session.

## Setup

```bash
# Open the company's career site
node .agents/skills/browser-automation/scripts/browser.js open "https://<company>.humand.co" --headed
```

## Apply via API (guest session)

Humand uses a guest session flow: get the job, upload CV to S3, POST the application.

### 1. Get the job

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://<company>.humand.co/jobs/<job-id>/apply"
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 30; i++) {
    if (document.querySelector('form') || document.querySelector('input')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### 2. Upload CV to S3

Humand uploads files to S3 before submitting the application. The upload URL is obtained from their API.

```bash
# Get the S3 upload URL (capture the actual request from a browser session)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  // Humand's frontend requests a presigned S3 URL, then PUTs the file there
  // Capture this request to get the exact endpoint
  const r = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'cv.pdf', contentType: 'application/pdf' })
  });
  const data = await r.json();
  return JSON.stringify(data);
})()"
```

### 3. Submit the application

```bash
# POST /api/jobs/apply with the form data + S3 CV URL
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  const r = await fetch('/api/jobs/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      first_name: '<Your First Name>',
      last_name: '<Your Last Name>',
      phone: '<your phone>',
      email: '<your@email.com>',
      birth_date: '<YYYY-MM-DD>',
      resume: '<S3 URL from step 2>',
      linkedin_url: '<your LinkedIn URL>',
      consent: true
    })
  });
  return r.status + ' ' + r.statusText;
})()"
```

### 4. Verify

```bash
# Check for thank you page or success message
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  if (document.body.innerText.includes('thank you') || document.body.innerText.includes('gracias')) return 'success';
  return 'no_confirmation';
})()"
```

## Required fields

| Field | Description | Source |
|---|---|---|
| `first_name` | First name | User profile |
| `last_name` | Last name | User profile |
| `phone` | Phone number | User profile |
| `email` | Email address | User profile |
| `birth_date` | Birth date (YYYY-MM-DD) | User profile |
| `resume` | S3 URL of uploaded CV | From step 2 |
| `linkedin_url` | LinkedIn profile URL | User profile |
| `consent` | Privacy consent (boolean) | Always true |

**Never invent values.** If a field is missing from the data source, stop and ask the user.

## Gotchas

- **Guest session** — Humand doesn't require login. Each application uses a guest session.
- **S3 upload first** — the CV must be uploaded to S3 before submitting the application. The application POST references the S3 URL, not the file directly.
- **API structure may vary** — capture the actual requests from a browser session to get the exact endpoints and fields for each company.
- **Thank you page** — after a successful application, a thank you page appears. Verify by checking page content.

## Anti-patterns

- **Don't** submit the application without first uploading the CV to S3
- **Don't** hardcode personal data — read from the consuming repo's data source
- **Don't** assume the API structure is the same across all Humand.co sites — capture and verify
- **Don't** skip the consent field — it's required
