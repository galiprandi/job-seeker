---
name: humand
description: Automate job applications on Humand.co-based career sites via guest session API.
verified: 2026-09-02
domains:
  - humand.co
  - app.humand.co
---

# Humand.co Automation

Automate job applications on Humand.co-based career sites. Humand is an ATS used by some companies. Applications are submitted via their internal API with a guest session (no login required).

## Setup

```bash
# Open the company's career site
# NOTE: real URL pattern is jobs.humand.co/<company-slug>, NOT <company>.humand.co
node .agents/skills/browser-automation/scripts/browser.js open "https://jobs.humand.co/<company-slug>" --headed
```

A proprietary cookie banner may appear on first load. Accept/dismiss it before proceeding:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i   # find the accept/reject button @eN
node .agents/skills/browser-automation/scripts/browser.js exec click @eN
```

## Apply via API (guest session)

Humand uses a guest session flow: create a guest session token, upload the CV file asset, POST the application. All calls run in-page via `exec eval` so they inherit the site's origin and cookies.

### 1. Open the job apply page

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://jobs.humand.co/<company-slug>/jobs/<job-id>/apply"
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!(document.querySelector('form') || document.querySelector('input'))"
```

### 2. Create the guest session

The `communityId` is a numeric ID embedded in the page HTML (e.g. `"communityId":8554`). Extract it, then request the guest session token.

```bash
# Extract communityId from the page HTML
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const m = document.documentElement.innerHTML.match(/\"communityId\"\\s*:\\s*(\\d+)/);
  return m ? m[1] : 'not_found';
})()"

# Create the guest session
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  const r = await fetch('/api/file-assets/guest-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instanceId: <communityId> })
  });
  const data = await r.json();
  return JSON.stringify(data);   // -> { guestSessionToken }
})()"
```

### 3. Upload the CV file asset

```bash
# Register the file asset -> { fileAsset, uploadUrl }
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  const r = await fetch('/api/file-assets/public', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      guestSessionToken: '<token from step 2>',
      name: 'cv.pdf',
      type: 'FILE',
      contentType: 'application/pdf',
      public: true,
      size: <bytes>,
      sizeInBytes: <bytes>
    })
  });
  return JSON.stringify(await r.json());   // -> { fileAsset, uploadUrl }
})()"

# PUT the file bytes to uploadUrl (presigned). Do it from Node-side tooling
# (not fetch) if the file lives on disk: read the file and PUT its body to
# the returned uploadUrl with the same contentType.
```

### 4. Submit the application

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  const r = await fetch('/api/jobs/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId: <job-id>,
      formVersionId: <formVersionId>,        // tenant-specific; capture from the real form
      fieldAnswers: { /* tenant-specific fields; capture from a real submission */ },
      communityId: <communityId>,
      submitterId: '<submitterId>',          // from file-assets flow / tenant config
      submissionDate: '<YYYY-MM-DD>'         // today
    })
  });
  return r.status + ' ' + r.statusText;
})()"
```

### 5. Verify

```bash
# Check for thank you page or success message
node .agents/skills/browser-automation/scripts/browser.js exec wait --text "gracias"
# or:
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const t = document.body.innerText.toLowerCase();
  if (t.includes('thank you') || t.includes('gracias')) return 'success';
  return 'no_confirmation';
})()"
```

## Required fields

Fields vary per tenant. The guaranteed shape:

| Field | Description | Source |
|---|---|---|
| `jobId` | Numeric job ID | Job URL / `GET /api/jobs?...&boardId=<n>` |
| `formVersionId` | Form version | Capture from the real apply form/request |
| `fieldAnswers` | Answers to the tenant's fields (name, email, phone, birth date, resume fileAsset, LinkedIn URL, consent...) | User profile + captured schema |
| `communityId` | Numeric tenant ID embedded in page HTML | Step 2 |
| `submitterId` | Submitter identifier | Guest session / tenant flow |
| `submissionDate` | YYYY-MM-DD, today | Generated |

**Never invent values.** If a field is missing from the data source, stop and ask the user.

## Gotchas

- **Guest session** - Humand doesn't require login. Each application uses a guest session token.
- **S3 upload first** - the CV must be uploaded (file asset + presigned `uploadUrl` PUT) before submitting the application. The apply POST references the fileAsset, not the file directly.
- **API structure varies per tenant** - capture the actual requests from a real browser application to get the exact endpoints, `formVersionId`, and `fieldAnswers` keys for each company.
- **Thank you page** - after a successful application, a thank you page appears. Verify by checking page content.
- **Jobs listing** - `GET /api/jobs?...&boardId=<n>`; job IDs are pure numerics.

## Anti-patterns

- **Don't** submit the application without first uploading the CV file asset.
- **Don't** hardcode personal data - read from the consuming repo's data source.
- **Don't** assume the API structure is the same across all Humand.co sites - capture and verify.
- **Don't** skip the consent field - it's required.

## Corrections + agent-browser notes (verified 2026-10-24)
- Real URL: `jobs.humand.co/<company-slug>` - NOT `<company>.humand.co`. Beware: `careers.humand.co` is Humand's own careers site (Teamtailor), NOT the ATS.
- Real apply flow:
  1. `POST /api/file-assets/guest-session` `{instanceId:<communityId numeric>}` -> `{guestSessionToken}` (communityId embedded in HTML, e.g. `"communityId":8554`)
  2. `POST /api/file-assets/public` `{guestSessionToken,name,type:"FILE",contentType,public,size,sizeInBytes}` -> `{fileAsset,uploadUrl}` -> `PUT uploadUrl` with the file
  3. `POST /api/jobs/apply` `{jobId,formVersionId,fieldAnswers,communityId,submitterId,submissionDate(YYYY-MM-DD today)}`
- `/api/uploads/sign` does NOT exist (404) - any older documented apply payload using it is wrong; fields vary per tenant.
- Jobs: `GET /api/jobs?...&boardId=<n>`; pure numeric IDs.
- Proprietary cookie banner on first load.
- All in-page calls via `exec eval` (fetch inherits origin + cookies). `find`/`snapshot -i` for UI interactions like the cookie banner.
