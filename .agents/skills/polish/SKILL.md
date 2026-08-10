---
name: polish
description: Optimizes the user's LinkedIn profile and CV to align with their declared professional goals. Audits, redacts improvements, applies with per-section approval, and exports a polished CV to PDF.
trigger: polish
---
# Polish — LinkedIn profile + CV optimization

## Trigger

**Keyword: `polish`** (or variants: "mejorar mi linkedin", "pulir perfil", "alinear cv", "optimizar perfil")

## Purpose

Takes the user's captured profile (`users.data.profile`) and job preferences (`users.data.job_preferences`) and uses them to optimize the two artifacts that recruiters see: the LinkedIn profile and the CV. This is an **output** flow, not an input flow — `profile` captures data, `polish` applies it externally.

## Dependencies

- `onboarding` (DB, browser profile, LinkedIn session)
- `profile` (requires `users.data.profile` and `users.data.job_preferences` with Must/Strong/Nice weights)

## Parallel execution

`polish` can run alongside other flows (e.g: `apply`, `news`, `targets`) by using an attached session:

```bash
node scripts/browser.js attach --session polish-1
node scripts/linkedin/profile-snapshot.js --session polish-1 --json
node scripts/linkedin/edit-section.js --section headline --data '{"text":"..."}' --session polish-1
node scripts/generate-cv.js --session polish-1
node scripts/browser.js detach --session polish-1
```

All scripts in this flow accept `--session`. Use `detach` when done (never `close` — it's ref-counted and would refuse or kill the browser for other agents). See AGENTS.md "Parallel execution".

## Gate de validacion (pre-flight obligatorio)

Before executing any phase, verify that dependencies are satisfied. If any check fails, **do not proceed** — tell the user what is missing and how to resolve it:

```bash
# 1. Verify onboarding completed: DB exists and has user
node scripts/db.js "SELECT id, name, email, data FROM users WHERE id = 1"
# If no row → "Necesitas ejecutar `onboarding` primero. No hay DB configurada."

# 2. Verify profile exists with minimum data
node scripts/db.js "SELECT data->'profile' AS profile, data->'job_preferences' AS prefs FROM users WHERE id = 1"
# If profile is null/empty → "Necesitas ejecutar `profile` primero. No hay perfil capturado."
# If job_preferences is null/empty → "Necesitas completar el cuestionario de `profile`. No hay preferencias declaradas."

# 3. Verify minimum fields within profile
# Required for Phase 1 (LinkedIn): profile.title, profile.experience[], profile.skills[]
# Required for Phase 2 (CV): profile.full_name, profile.email, profile.experience[], profile.education[]
# If any required field missing → "Tu perfil esta incompleto. Falta: <fields>. Ejecuta `profile` para completarlo."

# 4. Verify LinkedIn session is active
node scripts/browser.js ensure
# If fails → "Necesitas iniciar sesion en LinkedIn. Ejecuta `onboarding` o abre el browser headed para login."

# 5. Verify linkedin_profile URL exists in DB
node scripts/db.js "SELECT data->'linkedin_profile' AS url FROM users WHERE id = 1"
# If null → "No tengo tu URL de LinkedIn. Ejecuta `onboarding` para guardarla."
```

**Only if all 5 checks pass**, continue to Phase 1.

## Phase 1 — LinkedIn profile optimization

### 1a. Audit (read-only)

1. Load from DB: `profile`, `job_preferences`, `linkedin_profile`, `style_profile`, `strategy` (for strategy_level)
2. Navigate to the user's LinkedIn profile: `node scripts/browser.js goto <linkedin_profile_url>`
3. Extract current state of each section using `scripts/linkedin/profile-snapshot.js`:
   - Headline (title under photo)
   - About (summary)
   - Experience (each role: title, company, period, description)
   - Education
   - Skills (list + top 3 pinned)
   - Featured (if any)
   - Open to work (if active, which roles)
   - Languages
   - Certifications
4. Save snapshot to DB: `users.data.linkedin_snapshot`
5. **Gap analysis:** compare current state vs objectives:
   - Does headline reflect target role + AI focus?
   - Does About have a clear pitch aligned to `job_preferences.role_types` and `ai_focus`?
   - Does Experience have quantified achievements or just task descriptions?
   - Do Skills include those from `job_preferences.stack` and AI-related skills?
   - Is Open to Work active with the correct roles (if strategy is `active`/`aggressive`)?
6. Present gap report to user with specific recommendations

### 1b. Apply improvements (with per-section approval)

For each section with gaps, **draft all changes** for that section and **show them together** to the user for approval:

1. **Headline:** draft 2-3 options aligned to `profile.title` + top skills + `job_preferences.ai_focus`. Example: `"Software Engineer | AI Strategy & Agent-First Workflows | Remote"`
2. **About:** draft 3-4 paragraph summary positioning the user for target roles, mentioning AI focus if Must, ending with a soft CTA
3. **Experience:** for each role, rewrite descriptions as quantified achievements (format: "Action + Context + Result"). Use data from original CV (`profile.experience[]`)
4. **Skills:** reorder to put the most target-aligned skills in top 3. Add missing skills from `job_preferences.stack`
5. **Open to work:** if `strategy_level` is `active` or `aggressive`, activate "Open to work" with roles from `job_preferences.role_types` and `job_preferences.seniority`

**Per-section approval flow:**
- Show all changes for the section (before → after for each field)
- User approves the entire section, rejects it, or requests edits
- If approved: navigate to the section's edit URL, apply all changes via `scripts/linkedin/edit-section.js`
- Save each applied change to `users.data.linkedin_polish_log` (audit trail with before/after)

### LinkedIn edit URLs

LinkedIn uses direct URLs to edit each section:
- Headline: `https://www.linkedin.com/in/<vanity>/edit/details/` → click pencil icon on headline
- About: `https://www.linkedin.com/in/<vanity>/edit/details/` → click pencil icon on about
- Experience: `https://www.linkedin.com/in/<vanity>/edit/details/experiences/`
- Skills: `https://www.linkedin.com/in/<vanity>/edit/details/skills/`
- Open to work: `https://www.linkedin.com/in/<vanity>/edit/details/recruiteroptin/`

LinkedIn editors are contenteditable (tiptap/slate). Use `scripts/lib/playwright-helpers.js` patterns (`fillContenteditable`, `clickWithEvents`).

## Phase 2 — CV optimization

### 2a. Analyze current CV

1. Read current CV from `profile.cv_path` (PDF) or `profile.cv_url`
2. Extract structure: summary, experience, education, skills, projects
3. Compare vs LinkedIn snapshot (from Phase 1a) and vs `job_preferences`
4. Identify gaps:
   - Does the CV summary position for the target role?
   - Does experience use impact verbs and quantification?
   - Are key target stack skills missing?
   - Is there irrelevant experience that dilutes the message?
   - Is the format ATS-friendly (selectable text, no complex tables)?

### 2b. Draft improved CV

1. Generate CV in Markdown format (intermediate, reviewable):
   - Header: name, title, contact (email, phone, LinkedIn, GitHub, blog)
   - Summary: 2-3 lines aligned to target role + AI focus
   - Experience: each role with 3-5 bullets of quantified achievements
   - Skills: grouped by category (Languages, AI/ML, Cloud, Tools)
   - Education: degree, institution, year
   - Projects: 2-3 relevant projects with impact
   - Languages: with proficiency level
2. Show the drafted CV to the user for review (rendered, not raw Markdown)
3. Iterate if the user requests changes
4. Save the final CV to:
   - `users.data.cv_markdown` (Markdown content, for future iterations)
   - PDF file generated via browser headless

### 2c. PDF generation via browser headless

The PDF flow uses `scripts/generate-cv.js`:
1. Convert Markdown to HTML with clean CV CSS (ATS-friendly, single page if possible)
2. Write HTML to a temp file
3. Open browser headless: `node scripts/browser.js open file://<path> --headless`
4. Export to PDF via playwright-cli
5. Save PDF path to `users.data.cv_path` (updates existing path)
6. Close browser

The user never sees Markdown or HTML. They see only the final PDF. If they want adjustments, they tell the agent what to change and the agent regenerates.

### 2d. CV tailoring per application (future, not part of this flow)

The optimized base CV is generic to the target role. For specific applications, the `apply` or `targets` flow can do "light tailoring" of the base CV (reorder skills, adjust summary to mention the company). This is documented as a future extension, not implemented now.

## Persistence in DB

New JSONB keys in `users.data`:

| Key | Type | What it holds | Written by | Read by |
|---|---|---|---|---|
| `linkedin_snapshot` | object | Current LinkedIn profile state at last audit: headline, about, experience[], skills[], education[], open_to_work | `polish` | `polish` (compare before/after), `news` (context) |
| `linkedin_polish_log` | array | Audit trail of applied changes: `[{section, before, after, applied_at}]` | `polish` | `polish` (re-audit) |
| `cv_markdown` | string | Optimized CV in Markdown format | `polish` | `apply`, `targets` (tailoring), `polish` (iteration) |

Existing keys that get updated:
| Key | Note |
|---|---|
| `cv_path` | Updated to the path of the new generated PDF |

## Final report

```
## Polish report

### LinkedIn profile
| Section | Status | Changes applied |
|---|---|---|
| Headline | Updated | "<old>" → "<new>" |
| About | Updated | Added AI focus paragraph + CTA |
| Experience (3 roles) | Updated | Rewrote 8 bullets as quantified achievements |
| Skills | Reordered | Pinned: <skill1>, <skill2>, <skill3> |
| Open to work | Activated | Roles: <role1>, <role2>, <role3> |

### CV
- Format: Markdown → PDF (via headless browser)
- Sections optimized: summary, experience, skills
- Saved to: users.data.cv_markdown + <pdf_path>

### Pending (need attention)
- [manual] LinkedIn "Featured" section: add 2-3 projects (requires manual curation)
```

## Rules

- **Per-section approval:** show all changes for a section together. User approves the entire section or rejects it
- **Gold Rule 5c:** do not invent quantified achievements. If the CV has no metrics, draft the bullet without a number and mark it as `[TODO: add metric]` for the user to complete
- **Gold Rule 9:** the flow is generic. All data comes from DB. Examples in this SKILL use `<placeholder>` syntax
- **Anti-LLM style (Gold Rule 7):** the About and experience bullets must sound human, not generated. No em-dashes, no bullet lists in About (it is prose), no obvious JD keywords
- **Resumable:** each change is persisted individually. If interrupted, the next run continues from where it left off
- **Non-destructive:** always save the `before` in `linkedin_polish_log`. The user can revert
- **Single user** (repo owner)

## Scripts

### `scripts/linkedin/profile-snapshot.js`

Extracts the current LinkedIn profile state via browser automation. Returns JSON with all sections.

```bash
node scripts/linkedin/profile-snapshot.js [--session <name>] [--json]
```

Reads from the browser page (must be on the user's LinkedIn profile page). Outputs JSON to stdout.

### `scripts/linkedin/edit-section.js`

Edits a specific section of the LinkedIn profile. Handles navigation to edit URLs, contenteditable interaction, and save.

```bash
node scripts/linkedin/edit-section.js --section <headline|about|experience|skills|open-to-work> --data <json> [--session <name>]
```

`--data` is a JSON string with the new content for the section. Format depends on the section:
- `headline`: `{"text": "<new headline>"}`
- `about`: `{"text": "<new about text>"}`
- `experience`: `{"roles": [{"id": "<role_id>", "description": "<new description>"}]}`
- `skills`: `{"pinned": ["<skill1>", "<skill2>", "<skill3>"], "add": ["<skill4>"]}`

### `scripts/generate-cv.js`

Converts `cv_markdown` from DB (or `--markdown <path>`) to a PDF via browser headless.

```bash
node scripts/generate-cv.js [--output <path>] [--markdown <path>]
```

If `--markdown` is not provided, reads `users.data.cv_markdown` from DB. If `--output` is not provided, saves to `.browser-profile/cv-polished-<timestamp>.pdf`. Updates `users.data.cv_path` in DB after generating.

## Dependencies

- Depends on `onboarding` (DB, browser profile, LinkedIn session)
- Depends on `profile` (requires `users.data.profile` and `users.data.job_preferences`)
- `apply` and `targets` can consume `cv_markdown` and `cv_path` for future tailoring
