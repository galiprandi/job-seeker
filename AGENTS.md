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

### Gold Rule 5d — Human-intervention barriers: continue, ask at the end, resume
When the agent hits a platform barrier that requires human intervention and cannot be resolved autonomously (manual login, captcha, 2FA, complex profile setup, identity verification, etc.), it must **not stop and wait in the middle of a session**. The flow is: detect barrier → clearly note the exact step and URL where it was blocked → continue with the remaining applications/search tasks → at the end of the round, ask the user for help with that specific barrier → resume from the exact saved step/URL once the user completes it.

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

**Exception:** For other playwright-cli commands (click, fill, snapshot, eval, etc.), use `node scripts/browser.js exec <cmd>` (which resolves session + tab automatically) or call `playwright-cli` directly AFTER opening via the wrapper. The wrapper wraps open/goto/close/tabs/sessions/state/debug.

**Enforcement:** Before any browser operation, verify the command starts with `node scripts/browser.js`. If not, stop and correct it.

**Email:** SMTP preferred (`scripts/send-email.js`). Browser fallback available (see browser-ops skill).

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

The system has 9 flows + 1 cross-cutting behavior + 1 dashboard. Each flow has a trigger (keyword the user says) and a skill file with step-by-step detail. AGENTS.md is the index: the agent reads what exists and when to trigger it here, and loads the skill detail only when needed.

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
| Dashboard | `.agents/skills/dashboard/` | `dashboard` | Opens a local web dashboard visualizing the pipeline kanban, funnel, stats, messages, and target companies. Auto-refreshes every 30s | At the end of any round (apply, news, daily, targets). User says `dashboard` or "show pipeline" |
| Polish | `.agents/skills/polish/` | `polish` | Optimizes LinkedIn profile (headline, about, experience, skills, open-to-work) and redacts an improved CV aligned to user's goals. Exports CV to PDF via headless browser. Per-section approval | After profile exists. User says `polish`, "mejorar mi linkedin", "pulir perfil", "alinear cv" |

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
                          ↑
                        polish (depends on profile + onboarding)
```

- `onboarding` must run before anything else. Without `.env` and DB nothing works. Also sets `browser_mode`, `strategy_level`, and `availability` (interview time preferences).
- `profile` depends on `onboarding`. Without a profile there's no quality matching.
- `strategy` depends on `onboarding` (DB). Sets the aggressiveness level that all flows respect.
- `radar` depends on `profile`. Alerts use profile keywords.
- `targets` depends on `profile` (Must-haves to filter, profile data to fill forms) and `onboarding` (browser profile with Gmail + LinkedIn sessions for login). Consumes `users.data.target_companies` for the company list.
- `news` consumes what `radar` produces (alerts in `Job Alerts` folder) + direct messages.
- `apply` depends on `profile` (to filter by Must-haves) and `onboarding` (DB to register).
- `daily` composes `news` + `apply`/`targets` with decision logic based on `SELECT max(applied_at) FROM applications`. Which pillars it activates depends on `strategy.sources_active`.
- `polish` depends on `profile` (needs `users.data.profile` and `job_preferences`) and `onboarding` (DB, browser, LinkedIn session). Optimizes LinkedIn profile and CV. `apply`/`targets` can consume `cv_markdown` and `cv_path` from `polish` for future tailoring.
- `memory` is cross-cutting: runs during every flow (detection) and at every pre-flight (injection). Depends on `onboarding` (DB). Implements Gold Rule 3. Can detect strategy-level changes ("me despidieron" → propose `active`).

### Tools

| Tool | Location | Usage |
|---|---|---|
| `playwright-cli` | `.agents/skills/browser-ops/SKILL.md` | Browser automation. Open/close/goto/tabs/sessions via `scripts/browser.js` wrapper (guarantees profile + reads browser_mode from DB + lockfile + health check + tab management). Other commands (click, fill, snapshot) via `exec` or `playwright-cli` directly. See `.agents/skills/browser-ops/SKILL.md` for full wrapper reference, patterns, and script documentation. |
| `db` | `.agents/skills/db/SKILL.md` | Safe Postgres CLI (`scripts/db.js`). Reads `DATABASE_URL` from `.env`, JSON output, read-only by default (`--write` for writes). All DB access goes through this |
| `linkedin-search` | `scripts/linkedin-search.js` | Search LinkedIn posts for job openings. Extracts author, vanity, email, content. `--json` for piping, `--scroll <n>` for more results, `--session <name>` for parallel execution |
| `linkedin-invite` | `scripts/linkedin-invite.js` | Send LinkedIn connection requests without note. Accepts vanities or `--from-search "<keywords>"` to search + invite in one command. `--session <name>` for parallel execution |
| `linkedin-easy-apply` | `scripts/linkedin-easy-apply.js` | Search + apply to Easy Apply jobs automatically. Fills forms with standard answers, handles radios/comboboxes/checkboxes, registers in DB. `--dry-run` to preview, `--max <n>` to limit, `--session <name>` for parallel execution |
| `gmail-send` | `scripts/gmail-send.js` | Send emails via Gmail web UI with CV attached. `--to`, `--subject`, `--body`/`--body-file`, `--cv`, `--no-cv`, `--cc`, `--bcc`. Supports ES/EN UI. `--session <name>` for parallel execution |
| `pipeline` | `scripts/pipeline.js` | Kanban board CLI. Prints pipeline grouped by stage. `--move <id> <stage>`, `--funnel`, `--card <id>`, `--stage <stage>`, `--company <name>`, `--closed`. No dependencies beyond `pg` |

### Documentation reference matrix

| To understand | Consult |
|---|---|
| Architecture decisions | `ADR.md` |
| Purpose, stack, bootstrap | `README.md` |
| Operational rules and flow map | `AGENTS.md` (this file) |
| **What data lives where (tables, JSONB keys, ownership)** | **`DATA.md`** |
| Job platforms | `PLATFORMS.md` |
| **Job search & networking strategies (ordered by effectiveness)** | **`STRATEGIES.md`** |
| Browser automation | `.agents/skills/browser-ops/SKILL.md` |
| LinkedIn & Gmail patterns, scripts reference | `.agents/skills/browser-ops/SKILL.md` |
| Email delivery (SMTP + browser fallback) | `.agents/skills/browser-ops/SKILL.md` |
| DB access (CLI) | `.agents/skills/db/SKILL.md` |
| Preference memory | `.agents/skills/memory/SKILL.md` |
| Each flow's detail | `.agents/skills/<flow>/SKILL.md` |

## Operational constraints

- Always `npx`, never global install. **Exception:** `playwright-cli` is installed as a devDependency via `npm install`, but **always use `node scripts/browser.js`** for open/close/goto/tabs/sessions (see `.agents/skills/browser-ops/SKILL.md`). Never call `playwright-cli open` directly
- Browser visibility controlled by `preferences.tooling.browser_mode` (`headless`, `headed`, `headed_logins_only`, `ask_each_time`). Default: `headed_logins_only`. Set during onboarding, loaded at every pre-flight. Manual login/2FA is always headed (Gold Rule 5)
- Custom DB schema: create tables as needed
- JSONB for semi-structured data in `users.data`
- Single user (repo owner)
- `.env`, `.browser-profile/`, `.playwright-cli/` not tracked
- Job platforms = output of analysis, never user input
- **Consult `DATA.md` before assuming where data lives.** Never guess or discover by querying blindly. The data map is the source of truth for tables, JSONB keys, and flow ownership

### Parallel execution

Multiple flows can run in parallel by using **attached sessions**. Each parallel agent gets its own session name and tab, so they don't interfere with each other. The browser wrapper (`scripts/browser.js`) handles auto-attach, ref-counting, and safe-close (see `.agents/skills/browser-ops/SKILL.md`).

**How to run flows in parallel:**

1. The first agent opens the browser normally (creates the primary session):
   ```bash
   node scripts/browser.js open "https://www.linkedin.com" --headed
   ```

2. Each additional agent attaches a session with a unique name:
   ```bash
   node scripts/browser.js attach --session apply-1
   node scripts/browser.js attach --session news-1
   ```

3. Each agent passes `--session <name>` to every script it runs:
   ```bash
   node scripts/linkedin-easy-apply.js --max 10 --session apply-1
   node scripts/linkedin-search.js '"<Role>" "hiring"' --json --session news-1
   node scripts/gmail-send.js --to <email> --subject "..." --body "..." --session news-1
   ```

4. All browser wrapper commands accept `--session`:
   ```bash
   node scripts/browser.js goto <url> --session apply-1
   node scripts/browser.js exec snapshot --session apply-1
   node scripts/browser.js exec eval '<code>' --session news-1
   ```

5. When done, detach (not close — close is ref-counted and refuses if other agents are active):
   ```bash
   node scripts/browser.js detach --session apply-1
   ```

**Which flows can run in parallel:**

| Combination | Compatible? | Notes |
|---|---|---|
| `apply` + `news` | Yes | Different sites (LinkedIn Jobs vs Gmail/LinkedIn Messaging). Use `--session apply-1` and `--session news-1` |
| `apply` + `targets` | Yes | Both use LinkedIn/career sites but different pages. Use separate sessions and tabs |
| `news` + `polish` | Yes | Gmail/LinkedIn Messaging vs LinkedIn profile editing. No overlap |
| `daily` + anything | No | `daily` composes `news` + `apply`/`targets` internally. Don't run it alongside its sub-flows |
| `polish` + `apply` | Yes | Profile editing vs job search. Different LinkedIn pages |
| `onboarding` + anything | No | Onboarding sets up the browser profile. Must complete first |

**Rules for parallel execution:**

- Every script that touches the browser MUST accept and pass `--session`. All scripts in `scripts/` now do (linkedin-easy-apply, linkedin-search, linkedin-invite, gmail-send, generate-cv)
- Never call `close` or `close-all` from a parallel agent — use `detach`. Close is ref-counted and will refuse unless you use `--force` (which kills the browser for all agents)
- Use `node scripts/browser.js who` to check which agents are active before closing
- Each session should use its own tab (`--tab <name>`) to avoid navigation conflicts within the same session
- DB access is safe in parallel (Postgres handles concurrent connections)

### User job input mechanisms

The user can flag a job they're interested in via these channels. The agent detects and processes them during `news`:

| Mechanism | How it works | When it's detected |
|---|---|---|
| **Self-email** | User sends an email to themselves with the LinkedIn job URL in the body (no subject needed) | `news` Gmail inbox scan. Agent opens the URL, evaluates fit, checks if already applied, presents in summary |
| **LinkedIn Saved Jobs** | User clicks "Save" on a LinkedIn job posting | `news` navigates to `https://www.linkedin.com/my-items/saved-jobs/`. For each saved job: checks if open, evaluates fit, checks DB for existing application, presents Must/Strong matches |
| **Direct chat** | User pastes a job URL in the chat | Immediate. Agent opens, evaluates, and proposes action without waiting for `news` |
