---
name: apply
description: Searches for jobs on LinkedIn, filters by profile Must-haves, applies via Easy Apply, registers each application in DB.
trigger: apply
---
# Apply

## Trigger

**Keyword: `apply`**

The user says `apply` (or variants: "apply to N jobs", "postulate", "search jobs") and the full search and application flow is triggered.

## Pre-flight

- [ ] Verify active LinkedIn session. If session closed → open headed browser (Gold Rule 5) → notify user → wait for confirmation
- [ ] Always use Chrome profile `.browser-profile`
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```
- [ ] Read profile and existing applications via db CLI:
  ```bash
  node scripts/db.js "SELECT data->'profile' AS profile, data->'job_preferences' AS prefs FROM users WHERE id = 1"
  node scripts/db.js "SELECT url FROM applications WHERE user_id = 1"
  ```

## Flow

### 1. Search jobs

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
     - Salary expectations: use profile range (e.g: 4500-5500 USD)
     - Location: "San Miguel de Tucuman, Argentina"
     - Work authorization: answer honestly
     - Availability: "2 weeks"
4. Review → Submit
5. Verify "Application submitted" on screen
6. Register in DB via db CLI:

```bash
node scripts/db.js "INSERT INTO applications (user_id, platform, company, role, url, status, data) VALUES (1, 'linkedin', '<company>', '<role>', '<url>', 'applied', '<json>'::jsonb)" --write
```

`data` should include: match reason, method (easy_apply), location, questions_answered count.

### 4. Anti-ban

- Wait 2-3 seconds between actions (don't spam clicks)
- Don't apply to more than 15 jobs per session
- If a captcha or block appears, pause and notify the user
- Vary navigation order (don't go sequentially through the results list)

### 5. Summary

Upon completion, present table with:
- Company, role, URL
- Total applied
- Total skipped with reason

## Dependencies

- Depends on `onboarding` (DB to register)
- Depends on `profile` (Must-haves to filter)
- Consumed by `daily`
