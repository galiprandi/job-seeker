---
name: profile
description: Captures and structures the user's profile from CV + questionnaire to make decisions on their behalf. Ensures quality matching.
trigger: profile
---
# Profile

## Pre-flight

- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```
- [ ] Load existing profile if present:
  ```bash
  node scripts/db.js "SELECT data->'profile' AS profile, data->'job_preferences' AS job_preferences, data->'style_profile' AS style_profile FROM users WHERE id = 1"
  ```
- [ ] If profile exists, validate changes before overwriting

## Flow overview

```
Step 1: CV analysis → extract experience, sector, profile, inferred seniority
Step 2: Gap questionnaire → only what the CV doesn't clarify (adaptive to inferred profile)
Step 3: Current situation + expectations → employment status, urgency, salary, work mode, availability
Step 4: Strategy → targets, sources, aggressiveness (informed by everything above)
Step 5: Polish suggestion → align CV and LinkedIn profile to the job target to maximize matches
```

## Step 1: CV analysis

Ask user for CV (URL or PDF). Extract:

- [ ] Full name and title/profession
- [ ] Professional summary (elevator pitch)
- [ ] Work experience (company, role, period, achievements, team size, reporting line if applicable)
- [ ] Core competencies and tools (tech stack, software, methodologies, equipment, whatever is relevant to the field)
- [ ] Soft skills (leadership, communication, etc.)
- [ ] Certifications and courses
- [ ] Education (degrees, institutions)
- [ ] Languages and proficiency level
- [ ] Quantifiable achievements (metrics, impact)
- [ ] Notable projects or relevant work samples

### Step 1b: Inferred profile

From the CV data, infer:

| Signal from CV | Inferred field | Used for |
|---|---|---|
| Years of experience, previous roles | `career_stage` (intern, junior, mid, senior, staff, principal, director+) | Which questionnaire blocks to show, seniority filtering |
| Team size managed, titles with Lead/Manager/Head | `has_management` (bool) | Whether to show management-related questions |
| Core competencies and tools | `core_skills` | Step 2 gap questions on skill preferences |
| Industries of previous employers | `industry_history` | Step 2 gap questions on industry preferences |
| Company sizes (startup vs corporate) | `company_size_history` | Step 2 gap questions on company size |
| Sector or functional area | `sector` | Step 2 gap questions, platform tiering |
| Languages and publications/conferences | `visibility_level` | Outreach tone, referral strategy |

Save to `users.data.profile` as JSONB, including the inferred fields:
```bash
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{profile}', '<json>'::jsonb) WHERE id = 1" --write
```

The inferred profile is preliminary. Step 2 confirms or corrects it.

## Step 2: Gap questionnaire

**Not a fixed set of blocks.** The agent generates questions based on what the CV already answered clearly. Only ask about gaps.

Each answer must have a weight: **Must** (non-negotiable), **Strong** (strong preference), **Nice** (would be a plus).

### Core questions (always ask if the CV doesn't clarify)

#### Role and career direction
- [ ] Role type (IC, manager, mixed, specialist, leadership) — adapt options to `career_stage` and `has_management`
- [ ] Career stage confirmation (the agent proposes the inferred value, user confirms or corrects)
- [ ] Growth direction (stay in current path, wants to pivot, wants to move to leadership, unsure)
- [ ] Mentorship expectations (wants mentorship, wants autonomy, indifferent) — only if `career_stage` is junior/mid

#### Management and autonomy (only if `has_management = true` or user expressed leadership aspirations)
- [ ] Expected reporting line (CEO, CTO/COO, VP, other director) — adapt to sector
- [ ] Expected hiring/firing authority
- [ ] Budget authority (own budget decisions)
- [ ] Org scope (single team, multiple squads, department, company-wide)

#### Work mode and geography
- [ ] Work mode (remote, hybrid, on-site)
- [ ] Current location and willingness to relocate
- [ ] Accepted timezones (Americas, Europe, Asia, global)
- [ ] Contract type (employee, contractor, freelancer)

#### Company type and sector
- [ ] Company size (startup, scale-up, mid-size, corporate)
- [ ] Company stage (early-stage, growth, established, public) — only if relevant to the sector
- [ ] Preferred sectors or industries (if `industry_history` shows concentration, confirm rather than ask open-ended)
- [ ] Sectors to avoid (with nuance: absolute or accepts partial exposure?)
- [ ] Product/service type (own product, internal platform, consulting, services) — adapt to field

#### Sector-specific focus
- [ ] Area of specialization within the field (the agent proposes based on CV, user confirms or refines)
- [ ] Tools/methodologies the user wants to keep using vs open to learn
- [ ] Type of impact desired in first 6 months (adapt to role type)

#### Deal-breakers
- [ ] Graduated deal-breakers (the agent presents an empty list, the user adds their own). Never pre-load deal-breakers like "junior" or any role level. Each user defines their own.

### How the agent decides what to ask

1. For each topic above, check if the CV already provides a clear answer
2. If clear → skip the question, save the inferred value with confidence note
3. If unclear or missing → ask the question
4. If the topic only applies to certain career stages (management questions) → skip if not applicable
5. Present questions in blocks of 4, multi-select where applicable

Save to `users.data.job_preferences` as JSONB with weights:
```bash
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{job_preferences}', '<json>'::jsonb) WHERE id = 1" --write
```

## Step 3: Current situation and expectations

Ask the user directly. These are not inferable from a CV.

### Employment status and urgency
- [ ] Current situation (employed active change, employed passive, unemployed, about to be unemployed, first job)
- [ ] How urgent is the search? (no urgency, in the coming months, soon, desperate)
- [ ] Availability to start (immediate, 2 weeks, 1 month, 3 months)

### Compensation
- [ ] Salary range (min, expected, currency)
- [ ] Equity/participation expectations (if applicable to sector and career stage)
- [ ] Important benefits (health, education budget, equipment, etc. — adapt to sector)
- [ ] Flexibility on must-haves (e.g: 100% remote absolute or accepts 1 quarterly trip)

### Availability for interviews
- [ ] Preferred time slot for interviews (e.g: "13:00 to 16:00 AR")
- [ ] Fixed blocked days/times (e.g: "Tuesday 14:00 to 15:00, English class")
- [ ] Timezone (default: America/Argentina/Buenos_Aires)

Save to `users.data`:
```bash
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{availability}', '{\"preferred_hours\":\"<start>-<end> AR\",\"timezone\":\"<tz>\",\"blocked\":{\"<day>\":\"<start>-<end> (<reason>)\"}}') WHERE id = 1" --write
```

The `news` flow uses this to filter available slots from scheduling links without asking the user each time.

## Step 4: Strategy

Now that the agent has the full profile (CV + gaps + situation), it can propose a strategy informed by everything above.

See the `strategy` skill for the full flow. Summary:

1. Show the 4 levels (passive, selective, active, aggressive)
2. Ask situation questions **adapted to the user's career stage**:
   - If `career_stage` is junior/mid: "Are you open to roles above your current level, or only same-level matches?" instead of "IC or Manager?"
   - If `career_stage` is senior+: "Would you accept IC roles or only Manager?" (only if `has_management = true`)
3. Propose a level based on answers
4. Allow customization of individual parameters
5. Save to DB (`preferences.workflow.strategy_level` + `users.data.strategy`)

The strategy's `relax_must_haves` resolves dynamically from the user's Must-weighted preferences (see AGENTS.md "Strategy levels"). No hardcoded keys.

## Step 5: Polish suggestion

After the strategy is defined, the agent **suggests aligning the CV and LinkedIn profile** to the job target to maximize match chances.

### What to do

1. Compare the user's current CV and LinkedIn profile (from `users.data.profile` and `users.data.linkedin_profile`) against the defined job target (role, seniority, sector, must-haves)
2. Identify gaps:
   - Keywords missing that recruiters search for
   - Titles or descriptions that don't align with the target role
   - Skills underrepresented relative to what the target market demands
   - LinkedIn headline/summary that doesn't position the user for the target
3. Present the analysis to the user
4. If the user agrees, trigger the `polish` skill which:
   - Audits the CV and LinkedIn profile section by section
   - Drafts improvements aligned with the target
   - Applies changes with per-section approval
   - Exports a polished CV to PDF

### How to present it

One short message, conversational (Gold Rule 7 applies):

> "Ahora que sabemos que buscas <role> en <sector>, tu CV y perfil de LinkedIn tienen algunas cosas que se pueden alinear mejor para que te encuentren más fácil. Querés que haga una revisión y te proponga cambios?"

If the user says yes → run `polish` flow.
If the user says no or later → skip, but remind them once at the end of onboarding.

## Phase: Voice and style

This runs as part of Step 1 or as a separate phase after Step 5. It's independent of the career stage changes.

### Automatic inference
- [ ] Open headless browser with persistent profile
- [ ] Read last 20-50 sent messages on LinkedIn (filter "You:")
- [ ] Read relevant sent emails in Gmail (to recruiters, HR, companies)
- [ ] Infer: tone, default language, writing characteristics, average length
- [ ] Extract 3-5 representative samples (1-2 recruiter, 2-3 personal)

### Confirmation with options
Ask the user:
- [ ] Tone (formal, casual-professional, casual, direct/no-nonsense)
- [ ] Default language (Spanish, English, depends on context)
- [ ] Preferred length (short 1-3 lines, medium 4-6, long 7+)
- [ ] Preferred greeting (Hi [name], Dear, no greeting, other)
- [ ] Preferred closing (Regards, Cheers, no closing, other)
- [ ] Use bullet lists in messages? (yes, no)
- [ ] Emojis in professional messages? (yes, no, only in personal)

### Validation
- [ ] Save inference + preferences to `users.data.style_profile` as JSONB
- [ ] Show 3 messages drafted with the style to the user for validation
- [ ] If user corrects → update style_profile

## Phase: Platforms (output, not input)

- [ ] Consult `PLATFORMS.md`
- [ ] Cross-reference user profile vs role types/industries/seniority of each platform
- [ ] Assign Tier 1/2/3 to platforms based on fit
- [ ] Save to `users.data.platforms` as JSONB
- [ ] Don't ask the user. This is the output of analysis

## Rules

- CV is source of truth. Questionnaire covers only what the CV doesn't say
- **CV-first inference drives the questionnaire.** The agent analyzes the CV, infers a preliminary profile, and generates only the gap questions that matter for that specific profile
- **Career stage determines which questions appear.** Management questions only for senior+ or users with management experience. Mentorship questions only for junior/mid. The repo never assumes a career stage
- **No hardcoded deal-breakers.** The deal-breakers list starts empty. Each user adds their own. Never pre-load role levels (junior, senior, etc.) as system deal-breakers
- **Sector-agnostic.** The profile flow works for any field (software, design, marketing, finance, operations, etc.). Never assume dev-specific concepts (tech stack, RAG, agents, IC) as universal. Adapt terminology to the user's field
- **All DB access via `scripts/db.js`** (see `db` skill). Read-only by default, `--write` for saves
- Persist everything to `users.data` as JSONB via `jsonb_set`:
  ```bash
  node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{profile}', '<json>'::jsonb) WHERE id = 1" --write
  node scripts/db.js "SELECT data->'profile' AS profile FROM users WHERE id = 1"
  ```
- If user already has a profile in DB, validate changes before overwriting
- Profile is updated when user changes CV or answers new questions
- Questions in blocks of 4, multi-select where applicable
- Each preference with weight: Must / Strong / Nice
- Platforms = output of analysis, never user input
- Single user (repo owner)
