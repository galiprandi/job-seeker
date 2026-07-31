---
name: profile
description: Captures and structures the user's profile from CV + questionnaire to make decisions on their behalf. Ensures quality matching.
trigger: profile
---
# Profile

## Phase 1: CV (online or PDF)

Ask user for CV (URL or PDF). Extract:

- [ ] Full name and title/profession
- [ ] Professional summary (elevator pitch)
- [ ] Work experience (company, role, period, achievements, team size, reporting line)
- [ ] Technical skills (tech stack, tools)
- [ ] Soft skills (leadership, communication, etc.)
- [ ] Certifications and courses
- [ ] Education (degrees, institutions)
- [ ] Languages and proficiency level
- [ ] Quantifiable achievements (metrics, impact)
- [ ] Notable projects
- [ ] Open source contributions

Save to `users.data.profile` as JSONB.

## Phase 2: Questionnaire (CV gaps)

Questions in blocks of 4, multi-select where applicable. Each answer must have a weight: **Must** (non-negotiable), **Strong** (strong preference), **Nice** (would be a plus).

### Block 1: Role and level
- [ ] Role type (IC, manager, mixed, architect, director/CTO)
- [ ] Target seniority (senior, staff, principal, manager, director, VP, C-level)
- [ ] Expected reporting line (CEO, CTO, VP Eng, other director)
- [ ] Technical involvement (% of time coding vs management)

### Block 2: Work mode and geography
- [ ] Work mode (remote, hybrid, on-site)
- [ ] Current location and willingness to relocate
- [ ] Accepted timezones (Americas, Europe, Asia, global)
- [ ] Contract type (employee, contractor, B2B)

### Block 3: Compensation
- [ ] Salary range (min, expected, currency)
- [ ] Equity expectations (% , realistic stage)
- [ ] Important benefits (health, education budget, equipment, etc.)
- [ ] Flexibility on must-haves (e.g: 100% remote absolute or accepts 1 quarterly trip)

### Block 4: Team and autonomy
- [ ] Current vs desired team size
- [ ] Expected hiring/firing authority
- [ ] Budget authority (own budget decisions)
- [ ] Multiple squads / org scope

### Block 5: Company type and stack
- [ ] Company size (startup, scale-up, corporate)
- [ ] Stage (pre-seed, seed, Series A-C, public)
- [ ] Preferred tech stack or open to others
- [ ] Product type (own product, internal platform, consulting)

### Block 6: Industry and mission
- [ ] Preferred industries
- [ ] Industries to avoid (with nuance: absolute or accepts partial exposure?)
- [ ] Mission/values of interest (education, health, climate, fintech, dev tools, etc.)
- [ ] Graduated deal-breakers (crypto, gambling, research, freelance, junior)

### Block 7: AI and culture
- [ ] AI focus (mandatory, preferred, indifferent)
- [ ] Type of AI role (strategy, adoption, platform, agents, RAG, evals)
- [ ] Work culture (async, sync, documentation-first, meetings)
- [ ] Expected impact in first 6 months

### Block 8: Availability and language
- [ ] Availability (immediate, 2 weeks, 1 month)
- [ ] Current situation (employed active change, passive, unemployed)
- [ ] Working languages
- [ ] Travel (0%, occasional, up to 25%, indifferent)

Save to `users.data.job_preferences` as JSONB with weights.

## Phase 3: Voice and style

### 3a: Automatic inference
- [ ] Open headless browser with persistent profile
- [ ] Read last 20-50 sent messages on LinkedIn (filter "You:")
- [ ] Read relevant sent emails in Gmail (to recruiters, HR, companies)
- [ ] Infer: tone, default language, writing characteristics, average length
- [ ] Extract 3-5 representative samples (1-2 recruiter, 2-3 personal)

### 3b: Confirmation with options
Ask the user:
- [ ] Tone (formal, casual-professional, casual, direct/no-nonsense)
- [ ] Default language (Spanish, English, depends on context)
- [ ] Preferred length (short 1-3 lines, medium 4-6, long 7+)
- [ ] Preferred greeting (Hi [name], Dear, no greeting, other)
- [ ] Preferred closing (Regards, Cheers, no closing, other)
- [ ] Use bullet lists in messages? (yes, no)
- [ ] Emojis in professional messages? (yes, no, only in personal)

### 3c: Validation
- [ ] Save inference + preferences to `users.data.style_profile` as JSONB
- [ ] Show 3 messages drafted with the style to the user for validation
- [ ] If user corrects → update style_profile

## Phase 4: Platforms (output, not input)

- [ ] Consult `PLATFORMS.md`
- [ ] Cross-reference user profile vs role types/industries/seniority of each platform
- [ ] Assign Tier 1/2/3 to platforms based on fit
- [ ] Save to `users.data.platforms` as JSONB
- [ ] Don't ask the user. This is the output of analysis

## Rules

- CV is source of truth. Questionnaire covers what the CV doesn't say
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
