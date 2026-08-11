---
name: targets
description: Active direct sourcing. Registers and creates standout profiles on the 40 target companies' career sites, then applies to matching positions.
trigger: targets
---
# Targets — Active direct sourcing

## Trigger

**Keyword: `targets`**

The user says `targets` (or variants: "register on companies", "apply to target companies", "company direct", "direct sourcing") and the full registration + application flow is triggered.

## Purpose

The third sourcing pillar alongside `radar` (passive alerts) and `apply` (LinkedIn Easy Apply). This flow goes directly to the career sites of the 40 target companies (19 LATAM + 21 Argentina), registers the user, creates a standout profile, and applies to matching positions.

## Pre-flight

- [ ] **Browser:** always use `node scripts/browser.js` for open/close/goto. See AGENTS.md "Browser session" and "Parallel execution" for details. Never call `playwright-cli open` directly
- [ ] **Parallel execution:** if running alongside other flows (e.g: `apply` or `news`), attach a session with `node scripts/browser.js attach --session targets-1` and pass `--session targets-1` to all browser commands and scripts. Use `detach` when done (never `close` — it's ref-counted)
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```
- [ ] Load strategy (see AGENTS.md "Strategy levels"):
  ```bash
  node scripts/db.js "SELECT data->'strategy' AS strategy FROM users WHERE id = 1"
  ```
  Respect: `targets_batch_size` (max companies per session, 0 = don't run, "all" = no limit), `match_threshold`, `relax_must_haves`. If `targets` is not in `sources_active`, skip this flow entirely
- [ ] Load profile, job preferences, CV and photo paths:
  ```bash
  node scripts/db.js "SELECT data->'profile' AS profile, data->'job_preferences' AS prefs, data->'cv_path' AS cv_path, data->'photo_path' AS photo_path, data->'style_profile' AS style_profile FROM users WHERE id = 1"
  ```
- [ ] Load company registrations to see current state:
  ```bash
  node scripts/db.js "SELECT id, company, region, sector, careers_url, ats_platform, registration_status, profile_completed, applied_jobs_count, notes FROM company_registrations WHERE user_id = 1 ORDER BY registration_status, region, company"
  ```
- [ ] Load existing applications for dedup:
  ```bash
  node scripts/db.js "SELECT company, url FROM applications WHERE user_id = 1"
  ```

## Must-haves filter (from job_preferences)

Before applying to any job, verify against Must-haves from `users.data.job_preferences`. Discard if:
- Not remote (hybrid with mandatory office days = discard, unless `relax_must_haves` includes `remote`)
- Doesn't match `ai_focus` preference (if `ai_focus.weight = Must`, role must involve the user's AI role types)
- Junior/Intern level (per `deal_breakers`)
- In `industries_avoid` list (per `industries_avoid.weight`)
- Salary below `job_preferences.salary.value.min` (if mentioned and `salary.weight = Must`)
- Not in user's accepted locations (per `location` and `timezones` preferences)

**Gold Rule 4:** Manager role is highly valued but sacrificable if the pay and project are interesting enough. Don't discard IC roles automatically if the AI focus and compensation are strong. Check `relax_must_haves` for `manager`.

## Flow

### Phase 1 — Registration & profile creation

For each company with `registration_status = 'pending'` (or `profile_completed = false`):

1. **Navigate to careers URL** using `node scripts/browser.js goto <url>` (or `open` if no session)
2. **Detect ATS** if not already identified. Common signals:
   - URL contains `greenhouse.io` → **Greenhouse**
   - URL contains `lever.co` → **Lever**
   - URL contains `ashbyhq.com` → **Ashby**
   - URL contains `workday` → **Workday**
   - URL contains `smartrecruiters.com` → **SmartRecruiters**
   - URL contains `teamtailor.com` → **Teamtailor**
   - URL contains `eightfold.ai` → **Eightfold**
   - URL contains `successfactors` → **SAP SuccessFactors**
   - URL contains `workable.com` → **Workable**
   - URL contains `phenom` → **Phenom**
   - URL contains `attrax` → **Attrax**
   - URL contains `gupy` → **Gupy**
   - None of the above → **Custom** (manual inspection needed)
3. **Find the registration / sign up / create account page**
4. **Login method priority:**
   - Google login (preferred, reuses Gmail session from onboarding)
   - LinkedIn login (reuses LinkedIn session from onboarding)
   - Email + password (create account, save credentials to `company_registrations.data` as `{email, password}`)
   - If no account creation possible → mark `registration_status = 'manual_login_needed'`, notify user (Gold Rule 5)
5. **Complete profile** to make it stand out:
   - Full name (from `users.data.profile.full_name`)
   - Title/headline: use `profile.title` + top skills (e.g: "Software Engineer | AI Strategy & Agent-First Workflows")
   - Summary/bio: use `profile.summary`, adapted to the platform's character limit
   - Location: from `users.data.personal_info` (city, country) or `form_answers.location`
   - Upload CV: use `profile.cv_path` or `personal_info.cv_pdf_path` (from DB, never hardcoded)
   - Upload photo: use `users.data.photo_path` if the platform accepts it
   - Skills: add all from `profile.skills`
   - Experience: fill from `profile.experience` if the platform has structured fields
   - Languages: from `profile.languages`
   - Work preferences: from `job_preferences.modalities`, `job_preferences.role_types`
   - Salary expectation: from `job_preferences.salary.value` (only if field is required)
6. **Update DB after each company:**
   ```bash
   node scripts/db.js "UPDATE company_registrations SET registration_status = 'registered', profile_completed = true, ats_platform = '<ats>', login_method = '<google|linkedin|email>', profile_url = '<url if available>', last_visit_at = NOW(), updated_at = NOW(), data = '<json with credentials if email login>'::jsonb WHERE id = <id>" --write
   ```
7. **Subscribe to job alerts** if the ATS or career site supports it. This is critical for passive monitoring of new openings:
   - **Greenhouse**: look for "Subscribe to alerts" or "Email me new jobs" link on the job board. Enter email, select job categories or keywords (AI, Engineering, Remote)
   - **Lever**: look for "Subscribe" or "Alerts" button. Enter email, select departments or locations
   - **Ashby**: look for "Subscribe to alerts" link. Enter email, select teams or locations
   - **Workable**: look for "Subscribe" or "Job Alerts" link. Enter email, select job categories
   - **SmartRecruiters**: look for "Job Alerts" or "Subscribe" link. Enter email, select filters
   - **Teamtailor**: look for "Subscribe" or "Alerts" link. Enter email, select categories
   - **Eightfold**: AI matching may auto-suggest relevant jobs. Look for "Save search" or "Alerts" option
   - **Workday**: often has " Save Search" or "Job Alerts" after searching. Set up with filters
   - **Custom ATS**: look for any "Subscribe", "Alerts", "Notify me", or RSS feed icon. If none exists, skip this step and note it in `company_registrations.notes`
   - **Keywords for alerts**: derived from `profile.skills`, `profile.title`, and `job_preferences` (e.g: AI, the user's primary role, seniority level, key tech skills)
   - **Frequency**: daily if available, weekly otherwise
   - **Email**: use the user's email (from `users.data.profile.email`) so alerts route through the Gmail filter
   - Update DB with alert status:
     ```bash
     node scripts/db.js "UPDATE company_registrations SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{alerts_subscribed}', 'true'::jsonb), notes = COALESCE(notes, '') || ' | Alerts subscribed' WHERE id = <id>" --write
     ```
   - If alerts not available on the platform, note it:
     ```bash
     node scripts/db.js "UPDATE company_registrations SET notes = COALESCE(notes, '') || ' | No native alerts' WHERE id = <id>" --write
     ```

**If a company has no matching roles or no remote options:**
- Mark `registration_status = 'no_fit'` with reason in `notes`
- Do not register

**If a company requires manual login (no Google/LinkedIn, no email signup):**
- Mark `registration_status = 'manual_login_needed'`
- Open headed browser (Gold Rule 5), notify user, wait for confirmation

### Phase 2 — Search & apply

For each company with `registration_status = 'registered'` and `applied_jobs_count = 0` (or user requests more):

1. **Navigate to the company's job board**
2. **Search with filters:**
   - Keywords: derived from `profile.title`, `profile.skills`, and `job_preferences` (the user's primary role + key skills + seniority level)
   - Location: from `job_preferences.location` and `job_preferences.timezones`
   - Seniority: from `job_preferences.seniority`
3. **Filter by Must-haves** (see above). For each matching job:
   - Check dedup against `applications` table
   - If already applied → skip
4. **Warm Sourcing & Referral Pre-Check (Strategy #1 & #4):**
   - **Gate:** only run if `referrals` is in `strategy.sources_active`. If not, skip to step 5.
   - Run `node scripts/linkedin-warm-sourcing.js --company "<Company>" --role "<Role>" --json`
   - If internal contact/alumni/ex-colleague found: stage referral request in `messages` and set card status to `discovered` (Strategy #1).
   - If NO internal contact found: if `strategy.cold_outreach = true`, extract recruiter info and stage recruiter outreach DM in `messages` (Strategy #4). If `cold_outreach = false`, skip outreach. Either way, micro-align CV keywords to JD via `scripts/generate-cv.js` and proceed to ATS application.
5. **Apply** following the ATS-specific flow (see ATS guide below)
6. **Register each application in DB:**
   ```bash
   node scripts/db.js "INSERT INTO applications (user_id, platform, company, role, url, status, data) VALUES (1, '<company_lowercase>', '<company>', '<role>', '<url>', 'applied', '<json with match_reason, ats_type, location, salary_if_known>'::jsonb)" --write
   ```
7. **Update company registration:**
   ```bash
   node scripts/db.js "UPDATE company_registrations SET applied_jobs_count = applied_jobs_count + <N>, last_applied_at = NOW(), updated_at = NOW() WHERE id = <id>" --write
   ```

### Phase 3 — Report

Present to user:

```
## Targets report

### Registration summary
- Registered: X/40 companies
- Profile completed: X/40
- No fit (no remote/Argentina/tech): X
- Manual login needed: X

### Applications summary
- Total applications via targets: X
- By company:
  | Company | Applied | Roles |
  |---|---|---|
  | Mercado Libre | 3 | Sr EM AI, AI Architect, Platform Eng |
  | Bitso | 2 | Sr EM, AI Engineer |
  ...

### Pending (need attention)
- [manual_login_needed] Santander Tecnología — requires manual login
- [no_fit] Nubank — all roles hybrid, no 100% remote
```

## ATS-specific application guide

### Greenhouse
- URL pattern: `job-boards.greenhouse.io/<company>` or `boards.greenhouse.io/<company>`
- "Apply" button → form with personal info, resume upload, custom questions
- Resume: upload CV file directly
- Questions: answer based on profile (years of experience, salary, location, work authorization)
- Submit → confirmation page

### Lever
- URL pattern: `jobs.lever.co/<company>`
- "Apply for this job" → form with name, email, phone, resume, links (GitHub, LinkedIn, portfolio)
- Resume: upload CV file
- Custom questions: answer from profile
- Submit → email confirmation

### Ashby
- URL pattern: `jobs.ashbyhq.com/<company>`
- "Apply" → multi-step form (personal info, experience, resume, questions)
- Resume: upload CV file
- May require cover letter — use a brief, tailored version from profile summary
- Submit → confirmation

### Workday
- URL pattern: `mywd.<company>.com` or `<company>.wd1.myworkdayjobs.com`
- **Notoriously difficult to automate.** Dynamic forms, anti-bot measures
- If automation fails after 3 attempts → mark company as `manual_apply_needed`, notify user
- Create account first, then search and apply

### SmartRecruiters
- URL pattern: `careers.smartrecruiters.com/<company>`
- "Apply now" → form with personal info, resume, questions
- Resume: upload CV file
- May offer Google/LinkedIn prefill
- Submit → confirmation

### Teamtailor
- URL pattern: `<company>.teamtailor.com` or `<company>.na.teamtailor.com`
- "Apply" → form with personal info, CV, cover letter (optional)
- Resume: upload CV file
- Submit → confirmation

### Eightfold
- URL pattern: `<company>.eightfold.ai/careers`
- AI-powered matching. May suggest roles based on profile
- "Apply" → form, may offer LinkedIn import
- Resume: upload CV file
- Submit → confirmation

### Custom / Unknown ATS
- Navigate to the careers page
- Look for "Apply" or "Postulate" or "Send CV" button
- If it redirects to LinkedIn → apply via LinkedIn flow instead
- If it's an email submission → draft email with CV attached, show to user (Gold Rule 6)
- If no apply button → mark as `no_application_system` in notes

## Anti-ban

- Wait 3-5 seconds between actions (don't spam clicks)
- Don't apply to more than 5 jobs per company per session
- If a captcha or block appears → pause and notify user
- Vary navigation order when browsing job lists
- Take snapshots before interacting (LinkedIn-style tiptap editors are not the only ones with dynamic refs)

## Resumability

The flow is fully resumable. The `company_registrations` table tracks state per company:
- `pending` → not yet visited
- `registered` → account created, profile completed
- `no_fit` → no matching roles (with reason in notes)
- `manual_login_needed` → requires user intervention
- `manual_apply_needed` → Workday or similar that can't be automated

If the session is interrupted, the next run picks up where it left off by querying:
```bash
node scripts/db.js "SELECT * FROM company_registrations WHERE user_id = 1 AND registration_status = 'pending' ORDER BY region, company"
```

## DB access

**All DB access via `scripts/db.js`** (see `db` skill). Read-only by default, `--write` for inserts/updates.

### company_registrations table

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER FK → users | Always 1 |
| `company` | TEXT | Company name (unique per user) |
| `region` | TEXT | `latam` or `argentina` |
| `sector` | TEXT | Industry sector |
| `careers_url` | TEXT | Direct URL to careers page |
| `ats_platform` | TEXT | Detected ATS type |
| `registration_status` | TEXT | `pending`, `registered`, `no_fit`, `manual_login_needed`, `manual_apply_needed` |
| `profile_completed` | BOOLEAN | Whether profile was fully filled |
| `profile_url` | TEXT | URL to user's profile on the platform (if available) |
| `login_method` | TEXT | `google`, `linkedin`, `email` |
| `applied_jobs_count` | INTEGER | How many jobs applied to via this flow |
| `last_visit_at` | TIMESTAMPTZ | Last time the careers page was visited |
| `last_applied_at` | TIMESTAMPTZ | Last time an application was submitted |
| `notes` | TEXT | Free-form notes (ATS details, role observations, no_fit reasons) |
| `data` | JSONB | Credentials (if email login), extra metadata |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Typical queries:
```bash
# Pending companies
node scripts/db.js "SELECT id, company, region, careers_url, ats_platform, notes FROM company_registrations WHERE user_id = 1 AND registration_status = 'pending' ORDER BY region, company"

# Registered but no applications yet
node scripts/db.js "SELECT id, company, careers_url, ats_platform FROM company_registrations WHERE user_id = 1 AND registration_status = 'registered' AND applied_jobs_count = 0 ORDER BY company"

# Update after registration
node scripts/db.js "UPDATE company_registrations SET registration_status = 'registered', profile_completed = true, ats_platform = '<ats>', login_method = '<method>', profile_url = '<url>', last_visit_at = NOW(), updated_at = NOW() WHERE id = <id>" --write

# Mark as no_fit
node scripts/db.js "UPDATE company_registrations SET registration_status = 'no_fit', notes = '<reason>', last_visit_at = NOW(), updated_at = NOW() WHERE id = <id>" --write

# Increment applied count
node scripts/db.js "UPDATE company_registrations SET applied_jobs_count = applied_jobs_count + <N>, last_applied_at = NOW(), updated_at = NOW() WHERE id = <id>" --write
```

## Rules

- **Browser:** always use `node scripts/browser.js` for open/close/goto. Never `playwright-cli open` directly
- **Resumable.** Every action updates `company_registrations`. If interrupted, next run continues from where it left off
- **Must-haves are non-negotiable.** Don't register or apply to companies that don't match the user's `job_preferences` (remote, location, AI focus, salary, industries_avoid)
- **Gold Rule 4.** Manager is preferred but sacrificable for interesting IC roles with AI focus and good compensation
- **Gold Rule 5.** If manual login needed → open headed browser, notify user, wait
- **Gold Rule 6.** If applying via email (not ATS form) → show draft to user before sending
- **Anti-ban.** 3-5 second delays, max 5 applications per company per session
- **Dedup.** Check `applications` table before applying. Don't apply to the same job twice
- **Persist everything.** Registration status, profile completion, applications, credentials (in `data` JSONB)
- **CV and photo paths** come from `users.data.cv_path` and `users.data.photo_path`. Never hardcode paths
- Single user (repo owner)

## Dependencies

- Depends on `onboarding` (DB, browser profile, Gmail + LinkedIn sessions)
- Depends on `profile` (Must-haves to filter, profile data to fill forms)
- Consume by `daily` (can be added as a third pillar alongside `news` + `apply`)
