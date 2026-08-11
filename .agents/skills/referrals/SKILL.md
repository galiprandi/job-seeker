---
name: referrals
description: Discovers internal contacts (1st/2nd degree connections, university alumni, ex-colleagues) and recruiters at target companies, stages personalized referral requests or outreach DMs in DB, and applies dynamic ATS micro-alignment (JD-to-CV tailoring).
trigger: referrals
---
# Warm Sourcing & Referrals

## Trigger

**Keyword: `referrals` (or variants: "warm sourcing", "buscar contactos", "solicitar referido")**

The user says `referrals` or launches warm sourcing for a target company/role. Also executed as step 0 of the `apply` and `targets` flows to maximize conversion.

## Flow

### 0. Pre-flight

- [ ] Verify active browser session (see AGENTS.md "Browser session"): `node scripts/browser.js open <url> --headed` (Gold Rule 5) if session closed
- [ ] Load profile, university background, past companies, and job preferences from Postgres DB:
  ```bash
  node scripts/db.js "SELECT data->'profile' AS profile, data->'job_preferences' AS prefs, data->'style_profile' AS style FROM users WHERE id = 1"
  ```
- [ ] Load strategy (see AGENTS.md "Strategy levels"):
  ```bash
  node scripts/db.js "SELECT data->'strategy' AS strategy FROM users WHERE id = 1"
  ```
  Respect: `cold_outreach` (gates the recruiter-outreach branch in step 3). If `referrals` is not in `sources_active`, the flow should not run standalone — when invoked as step 0 of `apply`/`targets`, those flows handle the gate.
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```

### 1. Warm Contact & Recruiter Discovery

For a target company and role:

```bash
# Automated discovery script
node scripts/linkedin-warm-sourcing.js --company "<Company>" --role "<Role>" --json
```

The script searches for:
1. **1st & 2nd degree connections** currently working at `<Company>`
2. **University alumni** (matching institutions from `users.data.profile.education`)
3. **Ex-colleagues** (matching past employers from `users.data.profile.experience`)
4. **Recruiters & Hiring Managers** assigned to the role/company

### 2. Referral Request Staging (Highest Conversion — Strategy #1)

If an internal contact, alumni, or ex-colleague is found:

1. **Do NOT submit a cold application immediately.** A referral yields a **40% hire rate** vs **2-3% for cold Easy Apply**.
2. **Draft a personalized referral request message:**
   - Must pass **Gold Rule 7 (Anti-LLM Checklist)**: no em-dashes, no bullet points, conversational tone, max 2 short paragraphs, natural mention of shared background (alumni/ex-colleague/interest).
   - Tone: polite, non-demanding, asking for team insights or guidance on applying.
3. **Stage the draft in DB:**
   ```bash
   node scripts/db.js "INSERT INTO messages (user_id, channel, direction, sender, subject, body, draft, status, received_at, data) VALUES (1, 'linkedin', 'outbound', '<contact_name>', 'Solicitud de referido / consulta sobre equipo', '', '<draft_text>', 'draft', NOW(), '{\"category\": \"referral_request\", \"company\": \"<Company>\", \"vanity\": \"<vanity>\"}'::jsonb)" --write
   ```
4. **Register or update pipeline card** in stage `discovered`:
   ```bash
   node scripts/pipeline.js --move <id> discovered
   ```

### 3. Recruiter Outreach Staging (Multi-channel Combo — Strategy #4)

If NO internal referral path exists:

1. **Gate:** if `strategy.cold_outreach = false` → skip this step. Proceed to step 4 (ATS micro-alignment) and cold apply only.
2. Extract the Recruiter / Hiring Manager profile vanity or email.
3. Prepare a personalized recruiter DM outreach draft (3-4 lines: trigger + credibility anchor + clear ask).
4. Stage the draft in DB (`messages` table with `category: recruiter_outreach`).
5. Proceed to cold postulation via `apply` or `targets` while keeping the recruiter outreach staged for user approval (surfaced by `news` flow).

### 4. Dynamic ATS Micro-Alignment (JD-to-CV Tailoring)

Before submitting an application via ATS or email:

1. **Extract top 5 technical & domain keywords** from the target Job Description (e.g., `LangChain`, `System Architecture`, `PyTorch`, `Technical Leadership`).
2. Compare against `users.data.profile.skills` and `users.data.cv_markdown`.
3. Highlight matching achievements in the top summary/highlights of the CV markdown.
4. Generate the micro-aligned PDF CV using `scripts/generate-cv.js` before submitting:
   ```bash
   node scripts/generate-cv.js --output assets/cv_tailored_<company>.pdf
   ```

### 5. Presentation & Summary

Present the warm sourcing results to the user:
- **Internal contacts / Alumni found:** list with profile URLs and proposed referral draft.
- **Recruiters found:** list with proposed DM outreach draft.
- **Tailored CV generated:** link to tailored PDF.

## Dependencies

- Depends on `onboarding` (DB to register)
- Depends on `profile` (education & past experience data for alumni/ex-colleague matching)
- Integrated into `apply` and `targets` flows
