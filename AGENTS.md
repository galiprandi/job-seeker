# Job Seeker — Rules

## Gold Rules

### Gold Rule 1
Personal assistant for job searching. Evaluate impact, refine the idea, never be sycophantic. Only persist to the repo when the triggering idea is sharp.

### Gold Rule 2
Full autonomy. Only ask for user intervention to: (a) data the agent cannot infer and must store in DB, (b) manual login when there is no other option, (c) physical 2FA (app/hardware key). **If the agent can resolve something on its own (e.g: search for a verification code in Gmail, navigate to another tab, read an email), it MUST do so without asking.** Never ask "do you see the button?" or "should I search?" or "can you give me the code?". Search, execute, continue.

### Gold Rule 3 — User preferences always up to date
When the user states a preference, goal, personal data, or decision criterion, the agent must **immediately update** all relevant artifacts (AGENTS.md, PROFILE.md, APPLICATIONS.md, DB, etc.) without the user needing to ask explicitly. Never let a stated preference remain only in the conversation context.

### Gold Rule 4 — User's professional goal
The primary goal is **applying knowledge to optimize workflows and processes with AI**. The Manager role is highly valued but **sacrificable** if the pay and project are interesting enough. This hierarchy must be respected when evaluating opportunities, filtering jobs, and drafting responses to recruiters.

### Gold Rule 5 — Headed re-login
When a session expires or re-login is needed on any platform (LinkedIn, Gmail, etc.), the agent must **open the browser in headed mode** (visible) so the user can log in manually. Never attempt to log in programmatically with the user's credentials. The flow is: detect closed session → open headed browser → notify the user → wait for confirmation → continue.

### Gold Rule 5b — Captchas are human-only
When a captcha (hCaptcha, reCAPTCHA, image challenge, etc.) appears, the agent must **never attempt to solve it programmatically**. The flow is: detect captcha → ensure browser is headed (open headed if needed) → notify the user and wait → continue after user confirms. The agent fills the entire form, triggers submit, and when the captcha appears, it stops and asks the user. Never retry captchas in a loop.

### Gold Rule 5c — Never invent form data
Before filling any form field, the agent must **check the DB first** (`users.data.profile`, `users.data.personal_info`, `users.data.job_preferences`, `preferences`). If a value is not in the DB, the agent must **stop, ask the user, save the answer to DB, then continue**. Never guess or invent values like salary, company name, phone, or any personal data.

### Gold Rule 6 — Draft before replying
Before replying to any recruiter or job-related contact message, the agent must **always show a draft or at least the idea** of the response to the user. Never send without approval. The flow is: detect message that requires a reply → **extract action items from the original message** (is there a calendar link? do they ask for a CV? do they ask to schedule?) → analyze the proposal → research the company → present analysis + action items + draft → wait for approval → send.

### Gold Rule 7 — Anti-LLM style in messages
Every message drafted for recruiters or job-related contacts must pass an **anti-LLM checklist** before showing the draft to the user:

- [ ] **No em-dashes** (—). Use commas, periods, or parentheses.
- [ ] **No bullet points** in chat/DM messages. Bullets are for docs, not LinkedIn messages.
- [ ] **Conversational tone**, not formal/structured. A human doesn't write polished paragraphs in a DM.
- [ ] **Maximum 2 short paragraphs**. If it's longer, it's over-explaining.
- [ ] **Don't mention company research** in a way that sounds like it was googled 2 minutes ago. If mentioning something, make it natural.
- [ ] **Don't repeat JD keywords** obviously (e.g: "agent orchestration, RAG and evaluation strategies" sounds like copy-paste from the JD).
- [ ] **Use style_profile** from the DB (user's previous messages) as reference for tone and length. If no style_profile exists, mimic the recruiter's tone (if they write short, reply short).

If the draft doesn't pass the checklist, rewrite before showing.

### Gold Rule 8 — Language
The agent speaks to the user and to recruiters in **the user's language**. The user's language is determined from the user's messages and the `style_profile` in DB. If the user writes in Spanish, the agent communicates in Spanish. If a recruiter writes in English, the reply to that recruiter is in English. Never default to English unless the user's language is English.

### Gold Rule 9 — Repo is candidate-agnostic
The repo must be **cloneable and usable by anyone** without editing any file. All candidate-specific data (name, email, phone, CV path, photo path, salary, location, skills, role, experience, form answers, search keywords, target companies, blog URL, LinkedIn URL) lives in the **database** (`users.data.*`), never in `.md`, `.js`, `.json`, or any tracked file.

**What goes in the repo (generic, reusable):**
- Playbooks, patterns, flows, rules, ADRs, platform catalogs
- Script logic (how to search, how to fill forms, how to send emails)
- DB schema documentation (what keys exist, what they mean)
- Examples using `<Role>`, `<City>`, `<Your Name>` placeholders

**What NEVER goes in the repo:**
- Real names, emails, phone numbers, addresses
- Real CV paths, photo paths, LinkedIn URLs, blog URLs
- Real salary numbers, company names from the user's history
- Real search keywords tied to one person's profile
- Hardcoded form answers (years of experience, language levels, etc.)

**When a script needs candidate data:** read it from DB at runtime. If a key is missing, stop and ask the user (Gold Rule 5c). Never hardcode a fallback with a real person's data.

**When writing examples in docs:** use `<placeholder>` syntax (e.g: `"<Role>"`, `"<City>"`, `<your-username>`). Never use a real person's data as an example.

**Enforcement:** before committing, grep the diff for personal data patterns (names, emails, phone numbers, paths with real names). If found, move to DB and replace with placeholders.

### Gold Rule 10 — Browser isolation
**ALWAYS use the work browser via the wrapper script.** Never use any other browser instance (personal Chrome, Safari, Firefox, etc.) even if it's available or already open.

**Mandatory workflow:**
- **Open:** `node scripts/browser.js open <url>` (only this command)
- **Navigate:** `node scripts/browser.js goto <url>` (only this command)
- **Close:** `node scripts/browser.js close` (only this command)

**What is prohibited:**
- Never call `playwright-cli open` directly
- Never call `npx playwright` or `npx @playwright/cli` for open/goto/close
- Never open Chrome/Safari/Firefox manually or via shortcuts
- Never reuse an existing personal browser session

**Why:** The wrapper guarantees:
1. The `.browser-profile` directory is always used (isolated work sessions)
2. Browser mode preference (`headed_logins_only`, `headless`, `headed`) is respected automatically
3. Session management (prevent multiple instances, proper cleanup)
4. Cookie/state isolation between work and personal browsing

**Exception:** For other playwright-cli commands (click, fill, snapshot, eval, etc.), use `npx @playwright/cli` directly AFTER opening via the wrapper. The wrapper only wraps open/goto/close.

**Enforcement:** Before any browser operation, verify the command starts with `node scripts/browser.js`. If not, stop and correct it.

## Strategy levels

The job search has configurable aggressiveness. The agent asks the user about their situation, proposes a level, and saves it to DB. All flows read and respect it.

### Levels

| Level | Situation | apply_batch | targets_batch | daily_freq | match_threshold | follow_up_days | relax_must_haves | cold_outreach | sources |
|---|---|---|---|---|---|---|---|---|---|
| `passive` | Employed, open to opportunities | 0 | 0 | on-demand | Must only | 7 | none | false | radar, news |
| `selective` | Employed, looking for better | 5 | 5 | 1x/day | Must only | 5 | none | false | radar, apply, targets, news |
| `active` | Unemployed or about to be | 10 | 10 | 2x/day | Must+Strong | 3 | manager (accept IC if AI focus strong) | true | radar, apply, targets, news |
| `aggressive` | Needs a job now | 15 | all | 2x/day | Must+Strong+Nice | 2 | manager + remote (accept hybrid if project is great) | true | radar, apply, targets, news |

### Parameters

Each level sets these parameters. The user can customize individual ones after choosing a level:

| Parameter | Type | What it controls |
|---|---|---|
| `apply_batch_size` | int | Max jobs per `apply` session (0 = no auto-apply) |
| `targets_batch_size` | int | Max companies per `targets` session (0 = don't run, "all" = no limit) |
| `daily_frequency` | string | How often to run `daily`: `on-demand`, `1x/day`, `2x/day` |
| `match_threshold` | string | Which matches to act on: `must_only`, `must_strong`, `must_strong_nice` |
| `follow_up_days` | int | Days before sending a follow-up on an application |
| `relax_must_haves` | array | Which Must-haves to relax: `manager`, `remote`, `salary`, `ai_focus` |
| `cold_outreach` | bool | Whether to send cold messages to recruiters at target companies |
| `sources_active` | array | Which sourcing pillars to use: `radar`, `apply`, `targets`, `news` |

### Storage

- `preferences` table: `workflow.strategy_level` = level name (`passive`, `selective`, `active`, `aggressive`)
- `users.data.strategy` = JSONB with all parameter values (allows per-user customization)

### How the agent sets it

1. **Onboarding** (step 4b): after browser_mode, ask the user about their situation
2. **Keyword `strategy`**: user can change it anytime. Agent asks questions, proposes level, allows customization
3. **Memory skill**: detects situation changes ("me despidieron", "encontré trabajo", "necesito algo ya") and proposes a level change (Gold Rule 3)

### How flows respect it

At pre-flight, every flow loads:
```bash
node scripts/db.js "SELECT value FROM preferences WHERE user_id = 1 AND category = 'workflow' AND key = 'strategy_level' AND status = 'active'"
node scripts/db.js "SELECT data->'strategy' AS strategy FROM users WHERE id = 1"
```

Then adjusts behavior:
- `apply`: `apply_batch_size` limits applications per session. `match_threshold` filters which jobs to apply. `relax_must_haves` loosens Must-have filtering
- `targets`: `targets_batch_size` limits companies per session. Same match/relax logic
- `daily`: `daily_frequency` controls how often it runs. `sources_active` controls which pillars to activate
- `news`: `follow_up_days` controls follow-up timing. `cold_outreach` enables cold messages
- If a source is not in `sources_active`, the flow skips it entirely
- If `apply_batch_size = 0`, `apply` doesn't auto-apply, only presents matches for manual approval

## Flows

The system has 8 flows + 1 cross-cutting behavior. Each flow has a trigger (keyword the user says) and a skill file with step-by-step detail. AGENTS.md is the index: the agent reads what exists and when to trigger it here, and loads the skill detail only when needed.

### Flow map

| Flow | Skill | Trigger | What it does | When it triggers |
|---|---|---|---|---|
| Onboarding | `.agents/skills/onboarding/` | `onboarding` | Environment bootstrap: node, .gitignore, npm install, headed Gmail + LinkedIn login, create Neon DB, create users table, save .env, ask browser_mode + strategy + interview availability | Freshly cloned repo or first use. User says `onboarding` or agent detects missing `.env` or DB |
| Profile | `.agents/skills/profile/` | `profile` | Extract user profile from CV + questionnaire with Must/Strong/Nice weights. Saves to `users.data.profile` | After onboarding. User says `profile`, "update profile", or uploads a CV |
| Strategy | `.agents/skills/strategy/` | `strategy` | Configure job search aggressiveness level. Interrogates user, proposes level, saves to DB. All flows respect it | After onboarding. User says `strategy`, "cambiar estrategia", "more aggressive". Also set during onboarding |
| Radar | `.agents/skills/radar/` | `radar` | Register user on job boards, configure alerts with profile keywords, set up career site alerts, create Gmail filter to route alerts to `Job Alerts` folder | After profile exists. User says `radar`, "set up alerts", "register on platforms" |
| Targets | `.agents/skills/targets/` | `targets` | Active direct sourcing: register and create standout profiles on the 40 target companies' career sites, then apply to matching positions | After profile exists. User says `targets`, "register on companies", "apply to target companies" |
| News | `.agents/skills/news/` | `news` | Review Gmail inbox + Job Alerts folder + LinkedIn messages/notifications + LinkedIn Saved Jobs. Classify by fit. Prepare drafts. Validate and send | User says `news`, "check updates". Also runs as part of `daily` |
| Apply | `.agents/skills/apply/` | `apply` | Search jobs on LinkedIn, filter by profile Must-haves, apply via Easy Apply, register each application in DB | User says `apply`, "apply to N jobs". Also runs as part of `daily` if no recent activity |
| Daily | `.agents/skills/daily/` | `daily` | Periodic routine: runs `news` → inbox cleanup → if haven't applied recently, runs `apply` or `targets` based on strategy | User says `daily`, "routine", "check and apply". Designed to run 1-2 times per day |
| Memory | `.agents/skills/memory/` | (always on) | Autonomous preference detection, storage and injection. Detects preferences from conversation, saves to `preferences` table, loads active ones at the start of every flow | Always. Not triggered by a keyword. Runs during every interaction |

### Sourcing pillars

Three complementary sourcing strategies:

| Pillar | Flow | Strategy | Reach |
|---|---|---|---|
| Passive | `radar` | Platforms send alerts to Gmail `Job Alerts` folder | Broad (Otta, Torre, Built In, etc.) |
| Active (LinkedIn) | `apply` | Search and Easy Apply on LinkedIn | Broad (LinkedIn's entire job board) |
| Active (direct) | `targets` | Go directly to 40 target companies' career sites | Deep (specific companies, tailored profiles) |

### Flow dependencies

```
onboarding → profile → strategy
                ↓          ↓
            radar, apply, targets → news ← (consumes radar alerts)
                ↓                       ↑
                └─────── daily ─────────┘
```

- `onboarding` must run before anything else. Without `.env` and DB nothing works. Also sets `browser_mode`, `strategy_level`, and `availability` (interview time preferences).
- `profile` depends on `onboarding`. Without a profile there's no quality matching.
- `strategy` depends on `onboarding` (DB). Sets the aggressiveness level that all flows respect.
- `radar` depends on `profile`. Alerts use profile keywords.
- `targets` depends on `profile` (Must-haves to filter, profile data to fill forms) and `onboarding` (browser profile with Gmail + LinkedIn sessions for login). Consumes `users.data.target_companies` for the company list.
- `news` consumes what `radar` produces (alerts in `Job Alerts` folder) + direct messages.
- `apply` depends on `profile` (to filter by Must-haves) and `onboarding` (DB to register).
- `daily` composes `news` + `apply`/`targets` with decision logic based on `SELECT max(applied_at) FROM applications`. Which pillars it activates depends on `strategy.sources_active`.
- `memory` is cross-cutting: runs during every flow (detection) and at every pre-flight (injection). Depends on `onboarding` (DB). Implements Gold Rule 3. Can detect strategy-level changes ("me despidieron" → propose `active`).

### Tools

| Tool | Location | Usage |
|---|---|---|
| `playwright-cli` | `.agents/skills/playwright-cli/SKILL.md` | Browser automation. Open/close/goto via `scripts/browser.js` wrapper (guarantees profile + reads browser_mode from DB). All other commands (click, fill, snapshot) via `playwright-cli` directly |
| `db` | `.agents/skills/db/SKILL.md` | Safe Postgres CLI (`scripts/db.js`). Reads `DATABASE_URL` from `.env`, JSON output, read-only by default (`--write` for writes). All DB access goes through this |
| `linkedin-search` | `scripts/linkedin-search.js` | Search LinkedIn posts for job openings. Extracts author, vanity, email, content. `--json` for piping, `--scroll <n>` for more results |
| `linkedin-invite` | `scripts/linkedin-invite.js` | Send LinkedIn connection requests without note. Accepts vanities or `--from-search "<keywords>"` to search + invite in one command |
| `linkedin-easy-apply` | `scripts/linkedin-easy-apply.js` | Search + apply to Easy Apply jobs automatically. Fills forms with standard answers, handles radios/comboboxes/checkboxes, registers in DB. `--dry-run` to preview, `--max <n>` to limit |
| `gmail-send` | `scripts/gmail-send.js` | Send emails via Gmail web UI with CV attached. `--to`, `--subject`, `--body`/`--body-file`, `--cv`, `--no-cv`, `--cc`, `--bcc`. Supports ES/EN UI |
| `pipeline` | `scripts/pipeline.js` | Kanban board CLI. Prints pipeline grouped by stage. `--move <id> <stage>`, `--funnel`, `--card <id>`, `--stage <stage>`, `--company <name>`, `--closed`. No dependencies beyond `pg` |

### Browser session — wrapper script

**Always use `node scripts/browser.js` for opening, navigating, and closing the browser.** Never call `playwright-cli open` directly, never `npx @playwright/cli`, never `npx playwright cli`, never open Chrome directly. The wrapper guarantees the profile is always used and reads `browser_mode` from the DB automatically.

```bash
node scripts/browser.js open <url> [--headed|--headless]   # Open (profile always injected, headed/headless from DB or flag)
node scripts/browser.js goto <url>                         # Navigate current session
node scripts/browser.js close                              # Close current session
node scripts/browser.js close-all                          # Close all sessions
node scripts/browser.js list                               # List active sessions
node scripts/browser.js status                             # Show browser_mode pref + active sessions
```

**Key behaviors:**
- `--profile=.browser-profile` is hardcoded in the wrapper. It cannot be omitted
- If no `--headed`/`--headless` flag is passed to `open`, the wrapper reads `preferences.tooling.browser_mode` from the DB. `headed` → visible, everything else → headless. The caller passes `--headed` explicitly for manual logins (Gold Rule 5)
- If a session is already running, `open` automatically does `goto` instead of failing
- For all other playwright-cli commands (click, fill, snapshot, eval, etc.) use `playwright-cli` directly — the wrapper only wraps open/close/goto

### Documentation reference matrix

| To understand | Consult |
|---|---|
| Architecture decisions | `ADR.md` |
| Purpose, stack, bootstrap | `README.md` |
| Operational rules and flow map | `AGENTS.md` (this file) |
| **What data lives where (tables, JSONB keys, ownership)** | **`DATA.md`** |
| Job platforms | `PLATFORMS.md` |
| **Job search & networking strategies (ordered by effectiveness)** | **`STRATEGIES.md`** |
| Browser automation | `.agents/skills/playwright-cli/SKILL.md` |
| DB access (CLI) | `.agents/skills/db/SKILL.md` |
| Preference memory | `.agents/skills/memory/SKILL.md` |
| Each flow's detail | `.agents/skills/<flow>/SKILL.md` |

## Operational constraints

- Always `npx`, never global install. **Exception:** `playwright-cli` is globally installed, but **always use `node scripts/browser.js`** for open/close/goto (see "Browser session" section above). Never call `playwright-cli open` directly
- Browser visibility controlled by `preferences.tooling.browser_mode` (`headless`, `headed`, `headed_logins_only`, `ask_each_time`). Default: `headed_logins_only`. Set during onboarding, loaded at every pre-flight. Manual login/2FA is always headed (Gold Rule 5)
- Custom DB schema: create tables as needed
- JSONB for semi-structured data in `users.data`
- Single user (repo owner)
- `.env`, `.browser-profile/`, `.playwright-cli/` not tracked
- Job platforms = output of analysis, never user input
- **Consult `DATA.md` before assuming where data lives.** Never guess or discover by querying blindly. The data map is the source of truth for tables, JSONB keys, and flow ownership

### User job input mechanisms

The user can flag a job they're interested in via these channels. The agent detects and processes them during `news`:

| Mechanism | How it works | When it's detected |
|---|---|---|
| **Self-email** | User sends an email to themselves with the LinkedIn job URL in the body (no subject needed) | `news` Gmail inbox scan. Agent opens the URL, evaluates fit, checks if already applied, presents in summary |
| **LinkedIn Saved Jobs** | User clicks "Save" on a LinkedIn job posting | `news` navigates to `https://www.linkedin.com/my-items/saved-jobs/`. For each saved job: checks if open, evaluates fit, checks DB for existing application, presents Must/Strong matches |
| **Direct chat** | User pastes a job URL in the chat | Immediate. Agent opens, evaluates, and proposes action without waiting for `news` |

## Playbook de LinkedIn (validado en sesiones reales)

### Búsqueda de posts con vacantes (content search)

**Queries que funcionan (ordenadas por efectividad):**

Reemplazar `<Role>` con el título del perfil del usuario (ej: "AI Engineer", "Engineering Manager", "Full Stack Developer") y `<City>` con su ciudad o país.

1. `"<Role>" "hiring" LATAM` en `search/results/content/` con `sortBy="date_posted"` y filtro Posts. Es la query más productiva. Devuelve posts de reclutadores y hiring managers con emails de contacto visibles.
2. `"<Role>" "<City>" "hiring"` para búsquedas geo-específicas. Devuelve posts locales con emails directos.
3. `"<Role in user's language>" "buscamos"` (o equivalente en el idioma del usuario) para búsquedas en el idioma local. Menos volumen pero encuentra posts que no aparecen en inglés.
4. `#hiring + <Role> keywords` (hashtags). LinkedIn no soporta OR entre hashtags ni combinaciones complejas. Simplificar a un hashtag + keywords. El más productivo: `#hiring` + `"<Role>"`.

**Queries que NO funcionan:**
- Múltiples hashtags con OR (`#hiring OR #<Role>Jobs`): LinkedIn los trata como texto literal
- Combinaciones muy largas con muchos AND: devuelve 0 resultados o resultados irrelevantes
- Hashtags de nicho (`#latamjobs`, `#busquedasIT`, `#ofertasIT`): bajo volumen, casi sin resultados

**Patrón de extracción de posts:**
1. Ir a `search/results/content/?keywords=...&sortBy="date_posted"`
2. Snapshot → grep `button.*post by` para autores
3. grep `url.*in/` para profile URLs (3 URLs repetidas por autor)
4. grep `text:.*<Role keywords>|text:.*hiring` para contenido del post
5. grep `mailto:` para extraer emails de contacto directo
6. Scroll con `window.scrollBy(0, 5000)` + snapshot para más resultados
7. Por cada post relevante: enviar connection request + email si hay email visible

### Connection requests (invites)

**URL pattern para invites sin nota:**
```
https://www.linkedin.com/preload/custom-invite/?vanityName=<vanity>
```
- El vanity es el slug del profile URL (`/in/<vanity>/`)
- Para caracteres especiales (á, é, ç, ñ) usar URL encoding (`%C3%A1`, `%C3%A9`, `%C3%A7`, `%C3%B1`)
- El dialog "Add a note to your invitation" aparece automáticamente
- Buscar botón "Send without a note" con grep y click
- Si no aparece el dialog, el usuario ya es connection o el profile es 3rd+ (no se puede invitar)

**Límite de notas personalizadas:** LinkedIn tiene un límite de notas personalizadas por semana. Cuando se agota, enviar invites sin nota. No reintentar con nota.

**3rd+ connections:** No se puede enviar invite. Marcar como "no invite posible" y pasar al siguiente. No perder tiempo intentando workarounds.

### Easy Apply (LinkedIn Jobs)

**URL pattern para búsqueda con Easy Apply:**
```
https://www.linkedin.com/jobs/search/?keywords=<keywords>&location=Latin%20America&f_AL=true&f_WT=2&sortBy=DD
```
- `f_AL=true` = solo Easy Apply
- `f_WT=2` = solo Remote
- `sortBy=DD` = ordenado por fecha (más recientes primero)
- Keywords con OR (URL encoded): `%22<Role1>%22%20OR%20%22<Role2>%22%20OR%20%22<Skill1>%22`

**Flujo de Easy Apply (patrón repetible):**
1. Snapshot de la lista de jobs → grep `strong.*:` para títulos
2. Click en el job title (ref del `strong`)
3. Snapshot → grep `Easy Apply to` para el botón
4. Click Easy Apply → dialog se abre
5. Loop: buscar `Continue to next step` | `Review your application` | `Submit application` con grep, click, sleep 3
6. Si hay `textbox` con `*` (required), llenar y continuar
7. Si hay `combobox` con `Select an option`, seleccionar opción apropiada
8. Si hay `radio` groups con `Required`, click en el label generic (no el radio input)
9. Si hay `Please make a selection` (alert), falta un radio por seleccionar
10. Progress bar: 0% → 25% → 33% → 50% → 67% → 75% → 100% (varía por form)
11. En 100%: `Submit application` → click → `Your application was sent to <company>!`

**Tipos de preguntas frecuentes y dónde obtener las respuestas:**
- Años de experiencia con [tech]: `users.data.form_answers.<tech>_experience`
- Nivel de idiomas: `users.data.form_answers.english_level` / `spanish_level`
- Ubicación actual: `users.data.form_answers.location`
- Empresa actual: `users.data.form_answers.current_company`
- LinkedIn URL: `users.data.form_answers.linkedin_url`
- Salary expectation: `users.data.form_answers.salary_usd` / `salary_cop` / `salary_usd_max`
- Availability: `users.data.form_answers.notice_period` / `availability_date`
- Consent/privacy: siempre aceptar
- Diversidad/accesibilidad: `users.data.form_answers.diversity_*` (accessibility, gender, ethnicity)
- Discapacidad: `users.data.form_answers.disability`
- GenAI tools experience: `users.data.form_answers.genai_tools`
- AWS experience: `users.data.form_answers.aws_experience`
- English comfort (open text): `users.data.form_answers.english_comfort`

**Si una key no existe en `form_answers`:** el script saltea el campo (no lo inventa). El agente debe detenerse, preguntar al usuario, guardar la respuesta en DB (`jsonb_set` en `users.data.form_answers`), y luego continuar. Gold Rule 5c.

**Trampas comunes en Easy Apply:**
- Algunas empresas tienen forms extremadamente largos (8+ pasos, preguntas de diversidad específicas del país). Paciencia, llenar todo.
- Algunos forms tienen radios sin ref directo. Click en el `generic` label que envuelve el texto ("Yes", "No").
- Algunos forms tienen `combobox` que parecen seleccionados pero no lo están. Verificar con `option.*selected`.
- El botón "Continue" puede no avanzar si hay errores. Siempre grep `Please make a selection` | `Please enter a valid answer` | `Required` después de cada click.
- Algunos forms abren un file chooser al click "Adjuntar". Usar `playwright-cli upload <path>` inmediatamente.

### Emails directos a reclutadores

**Cuándo enviar email vs solo invite:**
- Si el post tiene `mailto:` link visible → enviar email con CV adjunto SIEMPRE
- Si no hay email → solo connection request
- Email + invite es la combinación más efectiva

**Gmail compose via browser:**
1. `goto "https://mail.google.com/mail/u/0/#inbox"`
2. Click "Redactar" button
3. Dialog aparece con: combobox "Destinatarios" (Para), textbox "Asunto", textbox "Cuerpo del mensaje"
4. Fill Para → Fill Asunto → Fill Cuerpo
5. Click "Adjuntar archivos" → `playwright-cli upload <cv_path>` (file chooser modal)
6. Click "Enviar" → verificar "Mensaje enviado"

**CV path:** se obtiene de `users.data.profile.cv_path` o `users.data.personal_info.cv_pdf_path`. El script `gmail-send.js` lo lee automáticamente de DB.

**Estructura de email efectiva (validada):**
- Asunto: `Aplicación - <Rol> - <Nombre>` (o `Application - <Role> - <Name>` si el post está en inglés)
- Body: 3-4 párrafos cortos, conversacional, no formal
- Mencionar: experiencia relevante específica del JD, logros concretos con números (ej: métricas de impacto de proyectos anteriores del usuario)
- Incluir: LinkedIn URL (`users.data.form_answers.linkedin_url`), blog URL (`users.data.form_answers.blog_url`) si es relevante al JD
- Adjuntar CV siempre
- No usar bullet points, no usar em-dashes, no repetir keywords del JD obviamente
- Pasar por Gold Rule 7 (anti-LLM checklist) antes de enviar

### Estrategia de outreach en orden de efectividad

1. **Easy Apply + email directo** (más efectivo): Easy Apply en LinkedIn Jobs + email al reclutador si el post tiene contacto
2. **Email directo con CV** (alto): cuando hay email visible en un post de LinkedIn
3. **Connection request sin nota** (medio): cuando no hay email, pero se puede conectar
4. **Connection request con nota** (alto pero limitado): mencionando un proyecto o blog post relevante del usuario. LinkedIn limita notas personalizadas por semana
5. **Easy Apply solo** (medio): rápido pero menos personalizado

### Datos del usuario para forms

Todos los datos personales viven en la DB, no en este archivo. El agente y los scripts los leen de:

| Dato | Ubicacion en DB |
|---|---|
| Nombre, email, telefono, CV path | `users.data.profile` (full_name, email, phone, cv_path) |
| Direccion, ciudad, pais | `users.data.personal_info` (address, city, state, country, postal_code) |
| Salario, disponibilidad, preferencias | `users.data.job_preferences` (salary, availability, modalities, etc.) |
| Respuestas a forms de Easy Apply | `users.data.form_answers` (ver claves arriba) |
| LinkedIn URL, blog URL | `users.data.form_answers.linkedin_url`, `form_answers.blog_url` |

**Nunca hardcodear datos personales en scripts, AGENTS.md, o cualquier archivo del repo.** Todo va a DB. Gold Rule 5c.

### Registro en DB

**Tabla `applications` columnas:** `id, user_id, platform, company, role, url, status, applied_at, data`

**Platforms usadas:**
- `linkedin` = Easy Apply jobs
- `linkedin_invite` = connection requests
- `email` = emails directos a reclutadores
- `kavak_career_site`, `clarika`, `homie`, etc. = career sites específicos

**Status values (pipeline stages, canonical):**

Active stages (left to right in the kanban):
- `discovered` = encontrado pero sin acción
- `contacted` = invite/email enviado, sin aplicación formal
- `applied` = aplicación enviada
- `in_review` = empresa revisando, sin respuesta
- `screening` = screening call agendada/done
- `interview` = entrevista técnica en curso
- `offer` = oferta recibida, negociando
- `hired` = aceptado, empezando

Closed stages (shown with `--closed`):
- `rejected` = empresa rechazó
- `withdrawn` = usuario retiró
- `skipped` = decidido no aplicar / no fit

**Pipeline kanban:** `node scripts/pipeline.js` prints the board. See "Pipeline kanban" section below.

**data JSONB:** incluir `source`, `match` (high/medium/low), `location`, `tech` array, y cualquier metadata relevante

### Timing y batch size

- Una sesión de apply puede procesar 7-10 Easy Apply jobs en ~30 min
- Connection requests: 8-10 por sesión (evitar límites de LinkedIn)
- Emails directos: 4-5 por sesión (cada uno toma ~2 min con attach)
- Total efectivo por sesión: 15-20 acciones de aplicación/contacto
- Algunas empresas tienen forms muy largos que toman ~10 min cada uno. El resto toma 2-5 min cada uno

## Scripts de automatizacion (validados en sesiones reales)

Estos scripts encapsulan los patrones repetitivos del playbook. Todos requieren que el browser este abierto via `node scripts/browser.js open` primero. Usan `playwright-cli` internamente.

### `scripts/linkedin-search.js` — Buscar posts con vacantes

Busca posts de LinkedIn, extrae autor + vanity + email + preview del contenido. Filtra por relevancia (AI/ML keywords) y dedupe.

```bash
# Busqueda basica (output human-readable)
node scripts/linkedin-search.js '"<Role>" "hiring" LATAM'

# Busqueda con mas scrolls y output JSON (para pipear a otros scripts)
node scripts/linkedin-search.js '"<Role>" "<City>" "hiring"' --scroll 3 --json

# Queries validadas:
#   '"<Role>" "hiring" LATAM'               (mas productiva)
#   '"<Role>" "<City>" "hiring"'      (geo-especifica Argentina)
#   '"ingeniero IA" "buscamos"'                  (español)
```

**Flags:** `--scroll <n>` (default 2), `--json` (raw JSON output)
**Output JSON:** `[{author, vanity, email, content}, ...]`

### `scripts/linkedin-invite.js` — Enviar connection requests

Navega a `/preload/custom-invite/?vanityName=<vanity>`, click "Send without a note". Anti-ban delay de 3s entre invites.

```bash
# Invitar a uno o mas vanities
node scripts/linkedin-invite.js franco-andr%C3%A9s-mena-ch%C3%A1vez-98019687

# Invitar a multiples
node scripts/linkedin-invite.js vanity1 vanity2 vanity3

# Buscar + invitar en un solo comando (pipea search -> invite)
node scripts/linkedin-invite.js --from-search '"<Role>" "hiring" LATAM'
```

**Flags:** `--from-search "<keywords>"` (busca y invita a todos los encontrados)
**Exit codes:** 0 = al menos uno enviado, 1 = todos fallaron, 2 = error

### `scripts/linkedin-easy-apply.js` — Aplicar via Easy Apply

Busca jobs con filtro Easy Apply, hace click, llena forms con respuestas estandar, submitea, registra en DB.

```bash
# Aplicar a los primeros 10 jobs (default)
node scripts/linkedin-easy-apply.js

# Keywords custom + limit
node scripts/linkedin-easy-apply.js --keywords '"<Role>" OR "<Skill>"' --max 5

# Solo listar, no aplicar
node scripts/linkedin-easy-apply.js --dry-run

# Output JSON
node scripts/linkedin-easy-apply.js --json
```

**Flags:** `--keywords <q>` (default: derived from DB profile.title + profile.skills), `--location <loc>` (default: from DB job_preferences.location), `--max <n>` (default 10), `--dry-run`, `--json`
**Auto-fill:** todos los valores se leen de `users.data.form_answers` (DB). El script llena: años de experiencia por tech, nivel de idiomas, ubicación, empresa actual, LinkedIn URL, salario, disponibilidad, GenAI tools, AWS, etc. Radios: Yes para skills, No para disability/sponsorship (valores configurables en DB). Comboboxes: English/Spanish level, seniority (from DB).
**Captcha:** detecta y detiene con exit 1 + mensaje. Nunca intenta resolver.
**DB:** registra cada aplicacion con `platform='linkedin'`, `status='applied'`.

### `scripts/gmail-send.js` — Enviar emails con CV adjunto

Abre Gmail compose, fill Para/Asunto/Cuerpo, adjunta CV, envia. Soporta CC/BCC y body desde archivo.

```bash
# Email basico con CV adjunto
node scripts/gmail-send.js \
  --to reclutador@empresa.com \
  --subject "Aplicacion - <Role> - <Tu Nombre>" \
  --body "Hola, vi tu post en LinkedIn..."

# Email sin CV
node scripts/gmail-send.js --to email@x.com --subject "..." --body "..." --no-cv

# Body desde archivo
node scripts/gmail-send.js --to email@x.com --subject "..." --body-file templates/email-ai-engineer.txt

# Multiples destinatarios + CC
node scripts/gmail-send.js --to a@x.com,b@x.com --cc c@x.com --subject "..." --body "..."
```

**Flags:** `--to <emails>` (required, comma-separated), `--subject <text>` (required), `--body <text>`, `--body-file <path>`, `--cv <path>` (default: from DB profile.cv_path), `--no-cv`, `--cc <emails>`, `--bcc <emails>`
**UI:** soporta Gmail en español (Redactar/Asunto/Cuerpo/Enviar/Adjuntar) e inglés (Compose/Subject/Body/Send/Attach)
**CV path: leido de DB (users.data.profile.cv_path o personal_info.cv_pdf_path)

### Pipeline completo en un comando

```bash
# 1. Asegurar browser abierto con sesion de LinkedIn
node scripts/browser.js open "https://www.linkedin.com"

# 2. Buscar posts, extraer contactos, invitar a todos
node scripts/linkedin-invite.js --from-search '"<Role>" "hiring" LATAM'

# 3. Aplicar via Easy Apply a 10 jobs
node scripts/linkedin-easy-apply.js --max 10

# 4. Para posts con email visible, enviar email con CV
node scripts/linkedin-search.js '"<Role>" "hiring" LATAM' --json | \
  jq -r '.[] | select(.email) | "--to \(.email) --subject \"Aplicacion - <Role>\" --body \"Hola \(.author), vi tu post...\""' | \
  xargs -I {} node scripts/gmail-send.js {}
```

### Cuando NO usar los scripts (modo manual)

- Forms de Easy Apply con preguntas abiertas complejas (ej: "Describe tu experiencia con <tech> en 300 palabras") que requieren respuestas personalizadas
- Posts de LinkedIn que requieren analizar el contenido para decidir si aplicar (match ambiguo)
- Emails a reclutadores que ya respondieron (usar Gold Rule 6: draft + approval)
- Career sites custom (Lever, Greenhouse, Workday) que no son LinkedIn Easy Apply
- Situaciones que requieren captcha (Gold Rule 5b: detener y pedir al usuario)

### Pipeline kanban

`scripts/pipeline.js` es el tablero kanban para tracking de aplicaciones y contactos. Unifica LinkedIn invites, emails directos y aplicaciones formales en un solo pipeline con stages canonicos.

```bash
# Tablero completo (active cards)
node scripts/pipeline.js

# Incluir closed (rejected, withdrawn, skipped)
node scripts/pipeline.js --closed

# Funnel summary (counts por stage)
node scripts/pipeline.js --funnel

# Filtrar por stage
node scripts/pipeline.js --stage interview

# Filtrar por company
node scripts/pipeline.js --company Ionix

# Mover una card a otro stage (actualiza status + agrega a stage_history)
node scripts/pipeline.js --move 82 interview

# Ver detalle de una card (con messages vinculados via application_id)
node scripts/pipeline.js --card 82
```

**Stages canonicos (ordenados):** `discovered` -> `contacted` -> `applied` -> `in_review` -> `screening` -> `interview` -> `offer` -> `hired`. Closed: `rejected`, `withdrawn`, `skipped`.

**Cuando el agente mueve cards:** cuando detecta un cambio de estado (recruiter responde, entrevista agendada, rechazo), usa `pipeline.js --move <id> <stage>` en lugar de un UPDATE directo. Esto mantiene el audit trail en `data.stage_history`.
