---
name: apply
description: Searches for jobs on LinkedIn, filters by profile Must-haves, applies via Easy Apply, registers each application in DB.
trigger: apply
---
# Apply

## Trigger

**Keyword: `apply`**

The user says `apply` (or variants: "apply to N jobs", "postulate", "search jobs") and the full search and application flow is triggered.

## Pre-flight (applies to ALL applications: LinkedIn Easy Apply AND direct career pages)

- [ ] Verify active LinkedIn session. If session closed → open browser with wrapper (see AGENTS.md "Browser session"): `node scripts/browser.js open <url> --headed` (Gold Rule 5) → notify user → wait for confirmation
- [ ] **Browser:** always use `node scripts/browser.js` for open/close/goto. See AGENTS.md "Browser session" for details. Never call `playwright-cli open` directly, never open Chrome directly
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```
- [ ] Load strategy (see AGENTS.md "Strategy levels"):
  ```bash
  node scripts/db.js "SELECT data->'strategy' AS strategy FROM users WHERE id = 1"
  ```
  Respect: `apply_batch_size` (max jobs per session), `match_threshold` (must_only / must_strong / must_strong_nice), `relax_must_haves` (loosen Must-have filtering). If `apply_batch_size = 0`, don't auto-apply, only present matches for manual approval
- [ ] Read profile and existing applications via db CLI:
  ```bash
  node scripts/db.js "SELECT data->'profile' AS profile, data->'job_preferences' AS prefs, data->'personal_info' AS personal FROM users WHERE id = 1"
  node scripts/db.js "SELECT url FROM applications WHERE user_id = 1"
  ```
- [ ] **DB is the single source of truth for ALL form fields.** Before filling ANY form (LinkedIn, Lever, Greenhouse, Workday, SuccessFactors, custom sites), the agent must have the profile data loaded in context. **Never invent, guess, or fabricate any value.** If a required field is not in the DB, STOP, ask the user, save the answer to DB, then continue. This is Gold Rule 5c.
- [ ] **Captcha policy: NEVER attempt to solve captchas programmatically.** This is Gold Rule 5b. When a captcha appears (hCaptcha, reCAPTCHA, image challenge, drag-and-drop, etc.), the agent must: (1) ensure browser is headed, (2) notify the user and wait, (3) continue only after user confirms. Never retry in a loop. Never attempt to click captcha elements, solve challenges, or bypass them.

## Flow

### 1. Search jobs

**Preferred: use the automation script** (see AGENTS.md "Scripts de automatizacion"):

```bash
# Dry-run first to see what's available
node scripts/linkedin-easy-apply.js --dry-run --max 15

# Apply to top N jobs
node scripts/linkedin-easy-apply.js --max 10
```

The script handles: search with Easy Apply filter, form filling with standard answers, radio/combobox/checkbox handling, DB registration, and captcha detection (stops on captcha).

**Manual fallback** (when script fails or forms have complex open-ended questions):

Search LinkedIn Jobs with filters:
- Keywords derived from profile (primary role, seniority, AI-related terms)
- Location: Worldwide or remote
- Work type: Remote
- Experience level: per profile (mid-senior, director)
- Easy Apply: yes (filter `f_AL=true`)
- Sort: Date posted (most recent first)

Paginate until collecting 20-30 candidates.

### 2. Filter by Must-haves

For each job, verify against profile Must-haves. Discard if:
- Doesn't match any Must-have
- Requires visa/location the user doesn't have (e.g: US-only, EU-only)
- Not a software/tech role
- Already applied (check against DB)

Keep 10-15 matching positions.

### 3. Apply via Easy Apply

For each selected job:

1. Navigate to the job URL
2. Click "Easy Apply"
3. Advance through form steps:
   - Contact info: pre-filled by LinkedIn, verify
   - Resume: already loaded in LinkedIn profile, verify
   - Additional questions: answer based on profile and preferences
     - Years of experience: use real value from profile
     - Salary expectations: use profile range from DB (`job_preferences.salary.value`: min/max/currency). Convert to local currency if the form requires it. **Never invent a salary number.**
     - Location: use `personal_info.city` + `personal_info.country` from DB
     - Work authorization: answer honestly
     - Availability: use `job_preferences.availability.value` from DB
   - **For any field not in the DB: STOP, ask the user, save answer to DB, then fill.** Gold Rule 5c.
4. Review → Submit
5. **If a captcha appears at any point: STOP, ensure browser is headed, notify user, wait.** Gold Rule 5b. Never attempt to solve it.
6. Verify "Application submitted" on screen
7. Register in DB via db CLI:

```bash
node scripts/db.js "INSERT INTO applications (user_id, platform, company, role, url, status, data) VALUES (1, 'linkedin', '<company>', '<role>', '<url>', 'applied', '<json>'::jsonb)" --write
```

`data` should include: match reason, method (easy_apply), location, questions_answered count.

### 4. Anti-ban

- Wait 2-3 seconds between actions (don't spam clicks)
- Don't apply to more than 15 jobs per session
- **If a captcha or block appears: STOP IMMEDIATELY. Do NOT attempt to solve it. Do NOT retry in a loop. Ensure browser is headed, notify the user, and wait for them to solve it.** This is Gold Rule 5b. The agent fills the entire form, triggers submit, and when the captcha appears, it stops and asks the user. Period.
- Vary navigation order (don't go sequentially through the results list)

### 5. Summary

Upon completion, present table with:
- Company, role, URL
- Total applied
- Total skipped with reason

### 6. Direct applications (non-LinkedIn: Lever, Greenhouse, Workday, SuccessFactors, custom sites)

When applying directly to a company career page (not via LinkedIn Easy Apply), the same pre-flight rules apply. The flow is:

1. **Load profile data from DB first** (pre-flight checklist). Have all values in context before opening the form.
2. Navigate to the application URL.
3. Fill ALL form fields using ONLY data from the DB:
   - Name: `profile.full_name` or `personal_info`
   - Email: `profile.email`
   - Phone: `personal_info.phone`
   - Address: `personal_info.address`, `personal_info.city`, `personal_info.state`, `personal_info.postal_code`, `personal_info.country`
   - Salary: `job_preferences.salary.value` (min/max/currency). Convert to local currency if the form requires it.
   - LinkedIn URL: `profile.linkedin_profile`
   - GitHub URL: `profile.github`
   - CV: `profile.cv_path` or `personal_info.cv_pdf_path`
   - Work experience: `profile.experience[]`
   - Education: `profile.education[]`
   - Skills: `profile.skills[]` or `profile.tech_stack`
   - Languages: `profile.languages[]`
4. **If a field is required but NOT in the DB: STOP, ask the user, save to DB, then fill.** Gold Rule 5c. Never invent.
5. Upload CV when prompted.
6. Submit the form.
7. **If a captcha appears: STOP, ensure headed, notify user, wait.** Gold Rule 5b. Never solve programmatically.
8. Verify submission confirmation on screen.
9. Register in DB via db CLI (same INSERT as LinkedIn flow, with `platform` = the ATS detected: 'lever', 'greenhouse', 'workday', etc.).

## Dependencies

- Depends on `onboarding` (DB to register)
- Depends on `profile` (Must-haves to filter)
- Consumed by `daily`
