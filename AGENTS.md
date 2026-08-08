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
| `playwright-cli` | `.agents/skills/playwright-cli/SKILL.md` | Browser automation. Open/close/goto/tabs/sessions via `scripts/browser.js` wrapper (guarantees profile + reads browser_mode from DB + lockfile + health check + tab management). Other commands (click, fill, snapshot) via `exec` or `playwright-cli` directly |
| `db` | `.agents/skills/db/SKILL.md` | Safe Postgres CLI (`scripts/db.js`). Reads `DATABASE_URL` from `.env`, JSON output, read-only by default (`--write` for writes). All DB access goes through this |
| `linkedin-search` | `scripts/linkedin-search.js` | Search LinkedIn posts for job openings. Extracts author, vanity, email, content. `--json` for piping, `--scroll <n>` for more results |
| `linkedin-invite` | `scripts/linkedin-invite.js` | Send LinkedIn connection requests without note. Accepts vanities or `--from-search "<keywords>"` to search + invite in one command |
| `linkedin-easy-apply` | `scripts/linkedin-easy-apply.js` | Search + apply to Easy Apply jobs automatically. Fills forms with standard answers, handles radios/comboboxes/checkboxes, registers in DB. `--dry-run` to preview, `--max <n>` to limit |
| `gmail-send` | `scripts/gmail-send.js` | Send emails via Gmail web UI with CV attached. `--to`, `--subject`, `--body`/`--body-file`, `--cv`, `--no-cv`, `--cc`, `--bcc`. Supports ES/EN UI |
| `pipeline` | `scripts/pipeline.js` | Kanban board CLI. Prints pipeline grouped by stage. `--move <id> <stage>`, `--funnel`, `--card <id>`, `--stage <stage>`, `--company <name>`, `--closed`. No dependencies beyond `pg` |

### Browser session — wrapper script

**Always use `node scripts/browser.js` for opening, navigating, and closing the browser.** Never call `playwright-cli open` directly, never `npx @playwright/cli`, never `npx playwright cli`, never open Chrome directly. The wrapper guarantees the profile is always used and reads `browser_mode` from the DB automatically.

```bash
# Core
node scripts/browser.js open <url> [--headed|--headless] [--session <name>]  # Open browser
node scripts/browser.js goto <url> [--tab <name>] [--session <name>]         # Navigate
node scripts/browser.js close [--session <name>]                             # Close session
node scripts/browser.js close-all                                            # Close all sessions
node scripts/browser.js ensure [--session <name>]                            # Idempotent check (no-op if healthy)
node scripts/browser.js exec <cmd> [args...] [--tab <name>] [--session <name>]  # Passthrough to playwright-cli

# Sessions for parallel subagents
node scripts/browser.js attach --session <name>     # Attach to running browser (independent tab context)
node scripts/browser.js detach --session <name>     # Detach session

# Tab management
node scripts/browser.js tab-new <url> --name <name> [--session <name>]   # Create named tab
node scripts/browser.js tab-select <name> [--session <name>]             # Select tab by name
node scripts/browser.js tab-close <name> [--session <name>]              # Close tab by name
node scripts/browser.js tab-close-all [--session <name>]                 # Close all extra tabs
node scripts/browser.js tab-list [--session <name>] [--json]             # List tabs

# Auth state persistence (avoid re-login)
node scripts/browser.js save-state [--filename <path>] [--session <name>]  # Save cookies + localStorage
node scripts/browser.js load-state [--filename <path>] [--session <name>]  # Restore cookies + localStorage

# Debugging
node scripts/browser.js dashboard                          # Visual dashboard (monitor all sessions)
node scripts/browser.js trace-start [--session <name>]     # Start trace recording
node scripts/browser.js trace-stop [--session <name>]      # Stop trace recording
node scripts/browser.js video-start [--filename <path>] [--session <name>]  # Start video recording
node scripts/browser.js video-stop [--session <name>]      # Stop video recording
node scripts/browser.js console [level] [--session <name>] # Console messages (error/warning/info/debug)
node scripts/browser.js requests [--session <name>]        # List network requests
node scripts/browser.js request <index> [--session <name>] # Show request details

# Info
node scripts/browser.js list                               # List active sessions
node scripts/browser.js status                             # Full status (mode, sessions, tabs)
```

**Key behaviors:**
- `--profile=.browser-profile` is hardcoded in the wrapper. It cannot be omitted
- If no `--headed`/`--headless` flag is passed to `open`, the wrapper reads `preferences.tooling.browser_mode` from the DB. `headed` → visible, everything else → headless. The caller passes `--headed` explicitly for manual logins (Gold Rule 5)
- If a session is already running, `open` automatically does `goto` instead of failing
- **Lockfile**: the wrapper uses `.browser-profile/.lock` to prevent race conditions when multiple processes try to open the browser simultaneously. Stale locks (dead PID) are detected and cleaned automatically
- **Health check**: before reusing a session, the wrapper runs a quick `eval 1+1` to detect zombie sessions. If unresponsive, it cleans up and fails fast
- **Config file**: `.playwright/cli.config.json` sets default timeouts (action: 10s, navigation: 30s), blocks tracking/analytics domains, and captures console warnings. These apply to all sessions automatically
- For all other playwright-cli commands (click, fill, snapshot, eval, etc.) use `exec` or call `playwright-cli` directly

### Parallel subagent browser pattern

When dispatching multiple subagents that need browser access (e.g: `news` flow checking Gmail + LinkedIn + DB simultaneously):

```bash
# 1. Coordinator opens browser and creates named tabs
node scripts/browser.js open "https://gmail.com" --headless
node scripts/browser.js tab-new "https://linkedin.com" --name linkedin
node scripts/browser.js tab-new "https://example.com" --name db

# 2. Attach a session per subagent (each gets independent active tab)
node scripts/browser.js attach --session gmail-worker
node scripts/browser.js attach --session linkedin-worker

# 3. Subagents work in parallel without locks
# Subagent A: node scripts/browser.js exec snapshot --tab linkedin --session linkedin-worker
# Subagent B: node scripts/browser.js exec snapshot --tab gmail --session gmail-worker

# 4. Cleanup
node scripts/browser.js detach --session gmail-worker
node scripts/browser.js detach --session linkedin-worker
node scripts/browser.js close-all
```

**Why attached sessions work:** `playwright-cli attach` creates a new session connected to the same browser, but with its own active tab context. Two sessions can have different active tabs simultaneously without interference. No locks needed.

**Alternative: `PLAYWRIGHT_CLI_SESSION` env var.** Subagents can set `PLAYWRIGHT_CLI_SESSION=gmail-worker` once and then call `playwright-cli` directly without `-s=` on every command:

```bash
PLAYWRIGHT_CLI_SESSION=gmail-worker playwright-cli snapshot
PLAYWRIGHT_CLI_SESSION=gmail-worker playwright-cli eval "document.title"
```

### Browser efficiency patterns

**Token-efficient snapshots:** LinkedIn and Gmail pages have thousands of DOM nodes. Full snapshots consume excessive tokens. Use these patterns:

```bash
# Shallow snapshot first (depth-limited)
playwright-cli snapshot --depth=4

# Search for specific text instead of full snapshot
playwright-cli find "Apply"
playwright-cli find --regex "/sign (in|up)/i"
playwright-cli find "Easy Apply"

# Snapshot a specific element only
playwright-cli snapshot "#main"
playwright-cli snapshot e34   # ref from a previous shallow snapshot
```

**Fill + submit in one command:**
```bash
playwright-cli fill e15 "search term" --submit   # fill + press Enter atomically
```

**Detect errors without snapshots:**
```bash
node scripts/browser.js console error    # check for JS errors
node scripts/browser.js requests        # check for failed network requests
```

**Persist auth between browser restarts:**
```bash
# After manual login (onboarding or re-login)
node scripts/browser.js save-state

# After opening browser in a new session (daily flow)
node scripts/browser.js load-state
# If load-state fails (no file), proceed to headed login (Gold Rule 5)
```

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

- Always `npx`, never global install. **Exception:** `playwright-cli` is installed as a devDependency via `npm install`, but **always use `node scripts/browser.js`** for open/close/goto/tabs/sessions (see "Browser session" section above). Never call `playwright-cli open` directly
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

## LinkedIn Playbook (validated in real sessions)

### Post search for job openings (content search)

**Queries that work (ordered by effectiveness):**

Replace `<Role>` with the user's profile title (e.g: "AI Engineer", "Engineering Manager", "Full Stack Developer") and `<City>` with their city or country.

1. `"<Role>" "hiring" LATAM` in `search/results/content/` with `sortBy="date_posted"` and Posts filter. Most productive query. Returns posts from recruiters and hiring managers with visible contact emails.
2. `"<Role>" "<City>" "hiring"` for geo-specific searches. Returns local posts with direct emails.
3. `"<Role in user's language>" "buscamos"` (or equivalent in the user's language) for searches in the local language. Less volume but finds posts that don't appear in English.
4. `#hiring + <Role> keywords` (hashtags). LinkedIn doesn't support OR between hashtags or complex combinations. Simplify to one hashtag + keywords. Most productive: `#hiring` + `"<Role>"`.

**Queries that don't work:**
- Multiple hashtags with OR (`#hiring OR #<Role>Jobs`): LinkedIn treats them as literal text
- Very long combinations with many ANDs: returns 0 results or irrelevant results
- Niche hashtags (`#latamjobs`, `#busquedasIT`, `#ofertasIT`): low volume, almost no results

**Post extraction pattern:**
1. Go to `search/results/content/?keywords=...&sortBy="date_posted"`
2. Snapshot → grep `button.*post by` for authors
3. grep `url.*in/` for profile URLs (3 repeated URLs per author)
4. grep `text:.*<Role keywords>|text:.*hiring` for post content
5. grep `mailto:` to extract direct contact emails
6. Scroll with `window.scrollBy(0, 5000)` + snapshot for more results
7. For each relevant post: send connection request + email if email is visible

### Connection requests (invites)

**URL pattern for invites without note:**
```
https://www.linkedin.com/preload/custom-invite/?vanityName=<vanity>
```
- The vanity is the slug from the profile URL (`/in/<vanity>/`)
- For special characters (á, é, ç, ñ) use URL encoding (`%C3%A1`, `%C3%A9`, `%C3%A7`, `%C3%B1`)
- The "Add a note to your invitation" dialog appears automatically
- Search for the "Send without a note" button with grep and click
- If the dialog doesn't appear, the user is already a connection or the profile is 3rd+ (can't invite)

**Custom note limit:** LinkedIn has a weekly limit for custom notes. When exhausted, send invites without a note. Don't retry with a note.

**3rd+ connections:** Can't send invite. Mark as "no invite possible" and move to the next. Don't waste time trying workarounds.

### Easy Apply (LinkedIn Jobs)

**URL pattern for Easy Apply search:**
```
https://www.linkedin.com/jobs/search/?keywords=<keywords>&location=Latin%20America&f_AL=true&f_WT=2&sortBy=DD
```
- `f_AL=true` = Easy Apply only
- `f_WT=2` = Remote only
- `sortBy=DD` = sorted by date (most recent first)
- Keywords with OR (URL encoded): `%22<Role1>%22%20OR%20%22<Role2>%22%20OR%20%22<Skill1>%22`

**Easy Apply flow (repeatable pattern):**
1. Snapshot of the job list → grep `strong.*:` for titles
2. Click the job title (ref from the `strong`)
3. Snapshot → grep `Easy Apply to` for the button
4. Click Easy Apply → dialog opens
5. Loop: search for `Continue to next step` | `Review your application` | `Submit application` with grep, click, sleep 3
6. If there's a `textbox` with `*` (required), fill and continue
7. If there's a `combobox` with `Select an option`, select the appropriate option
8. If there are `radio` groups with `Required`, click the generic label (not the radio input)
9. If there's `Please make a selection` (alert), a radio is missing selection
10. Progress bar: 0% → 25% → 33% → 50% → 67% → 75% → 100% (varies per form)
11. At 100%: `Submit application` → click → `Your application was sent to <company>!`

**Common question types and where to get the answers:**
- Years of experience with [tech]: `users.data.form_answers.<tech>_experience`
- Language level: `users.data.form_answers.english_level` / `spanish_level`
- Current location: `users.data.form_answers.location`
- Current company: `users.data.form_answers.current_company`
- LinkedIn URL: `users.data.form_answers.linkedin_url`
- Salary expectation: `users.data.form_answers.salary_usd` / `salary_cop` / `salary_usd_max`
- Availability: `users.data.form_answers.notice_period` / `availability_date`
- Consent/privacy: always accept
- Diversity/accessibility: `users.data.form_answers.diversity_*` (accessibility, gender, ethnicity)
- Disability: `users.data.form_answers.disability`
- GenAI tools experience: `users.data.form_answers.genai_tools`
- AWS experience: `users.data.form_answers.aws_experience`
- English comfort (open text): `users.data.form_answers.english_comfort`

**If a key doesn't exist in `form_answers`:** the script skips the field (doesn't invent it). The agent must stop, ask the user, save the answer to DB (`jsonb_set` on `users.data.form_answers`), then continue. Gold Rule 5c.

**Common Easy Apply pitfalls:**
- Some companies have extremely long forms (8+ steps, country-specific diversity questions). Patience, fill everything.
- Some forms have radios without a direct ref. Click the `generic` label that wraps the text ("Yes", "No").
- Some forms have `combobox` that appear selected but aren't. Verify with `option.*selected`.
- The "Continue" button may not advance if there are errors. Always grep `Please make a selection` | `Please enter a valid answer` | `Required` after each click.
- Some forms open a file chooser when clicking "Attach". Use `playwright-cli upload <path>` immediately.

### Direct emails to recruiters

**When to send email vs invite only:**
- If the post has a visible `mailto:` link → send email with CV attached ALWAYS
- If no email → connection request only
- Email + invite is the most effective combination

**Gmail compose via browser:**
1. `goto "https://mail.google.com/mail/u/0/#inbox"`
2. Click "Compose" button
3. Dialog appears with: combobox "Recipients" (To), textbox "Subject", textbox "Message body"
4. Fill To → Fill Subject → Fill Body
5. Click "Attach files" → `playwright-cli upload <cv_path>` (file chooser modal)
6. Click "Send" → verify "Message sent"

**CV path:** obtained from `users.data.profile.cv_path` or `users.data.personal_info.cv_pdf_path`. The `gmail-send.js` script reads it automatically from DB.

### External ATS playbooks (discovered)

**Teamtailor (<company>, etc.):**
- Flow: GET job → `Apply with LinkedIn` auto-fills name/email/photo/CV → fill custom questions → submit → email verification → click verification link → done
- `scripts/templates/teamtailor-apply.md` has the POST `/applications` structure for replay if needed
- After first successful application, create a Connect profile. Future applications at the same company auto-fill.

**Humand.co (<company>, etc.):**
- Flow: GET `/jobs/<id>/apply` → guest session → upload CV to S3 → POST `/api/jobs/apply` → thank you page
- `scripts/templates/humand-apply.md` has the JSON API structure
- Fields: first_name, last_name, phone, email, birth_date, resume, LinkedIn URL, consent

**CV upload via browser wrapper:**
- Some ATS file inputs are not visible; `exec upload` only works when a file chooser modal is open
- If direct upload fails, click the file chooser button first, then `exec upload <cv_path>`
- If that still fails, the input may be generated by JS; take a snapshot and look for `input[type=file]` or drag-and-drop areas

**Effective email structure (validated):**
- Subject: `Application - <Role> - <Name>` (use the language of the post)
- Body: 3-4 short paragraphs, conversational, not formal
- Mention: specific relevant experience from the JD, concrete achievements with numbers (e.g: impact metrics from the user's previous projects)
- Include: LinkedIn URL (`users.data.form_answers.linkedin_url`), blog URL (`users.data.form_answers.blog_url`) if relevant to the JD
- Always attach CV
- No bullet points, no em-dashes, don't repeat JD keywords obviously
- Pass through Gold Rule 7 (anti-LLM checklist) before sending

### Outreach strategy by effectiveness order

1. **Easy Apply + direct email** (most effective): Easy Apply on LinkedIn Jobs + email to recruiter if the post has contact
2. **Direct email with CV** (high): when there's a visible email in a LinkedIn post
3. **Connection request without note** (medium): when there's no email, but can connect
4. **Connection request with note** (high but limited): mentioning a relevant project or blog post from the user. LinkedIn limits custom notes per week
5. **Easy Apply only** (medium): fast but less personalized

### User data for forms

All personal data lives in the DB, not in this file. The agent and scripts read it from:

| Data | DB location |
|---|---|
| Name, email, phone, CV path | `users.data.profile` (full_name, email, phone, cv_path) |
| Address, city, country | `users.data.personal_info` (address, city, state, country, postal_code) |
| Salary, availability, preferences | `users.data.job_preferences` (salary, availability, modalities, etc.) |
| Easy Apply form answers | `users.data.form_answers` (see keys above) |
| LinkedIn URL, blog URL | `users.data.form_answers.linkedin_url`, `form_answers.blog_url` |

**Never hardcode personal data in scripts, AGENTS.md, or any repo file.** Everything goes to DB. Gold Rule 5c.

### DB registration

**`applications` table columns:** `id, user_id, platform, company, role, url, status, applied_at, data`

**Platforms used:**
- `linkedin` = Easy Apply jobs
- `linkedin_invite` = connection requests
- `email` = direct emails to recruiters
- `teamtailor` = applications via Teamtailor (with LinkedIn auth, email verification, Connect)
- `humand` = applications via Humand.co
- `<company>_career_site`, etc. = specific career sites

**Status values (pipeline stages, canonical):**

Active stages (left to right in the kanban):
- `discovered` = found but no action taken
- `contacted` = invite/email sent, no formal application
- `applied` = application submitted
- `in_review` = company reviewing, no response
- `screening` = screening call scheduled/done
- `interview` = technical interview in progress
- `offer` = offer received, negotiating
- `hired` = accepted, starting

Closed stages (shown with `--closed`):
- `rejected` = company rejected
- `withdrawn` = user withdrew
- `skipped` = decided not to apply / not a fit

**Pipeline kanban:** `node scripts/pipeline.js` prints the board. See "Pipeline kanban" section below.

**data JSONB:** include `source`, `match` (high/medium/low), `location`, `tech` array, and any relevant metadata

### Timing and batch size

- An apply session can process 7-10 Easy Apply jobs in ~30 min
- Connection requests: 8-10 per session (avoid LinkedIn limits)
- Direct emails: 4-5 per session (each takes ~2 min with attachment)
- Effective total per session: 15-20 application/contact actions
- Some companies have very long forms that take ~10 min each. The rest take 2-5 min each

## Automation scripts (validated in real sessions)

These scripts encapsulate the repetitive patterns from the playbook. All require the browser to be open via `node scripts/browser.js open` first. They use `playwright-cli` internally.

### `scripts/linkedin-search.js` — Search posts for job openings

Searches LinkedIn posts, extracts author + vanity + email + content preview. Filters by relevance (AI/ML keywords) and dedupes.

```bash
# Basic search (human-readable output)
node scripts/linkedin-search.js '"<Role>" "hiring" LATAM'

# Search with more scrolls and JSON output (to pipe to other scripts)
node scripts/linkedin-search.js '"<Role>" "<City>" "hiring"' --scroll 3 --json

# Validated queries:
#   '"<Role>" "hiring" LATAM'               (most productive)
#   '"<Role>" "<City>" "hiring"'      (geo-specific)
#   '"ingeniero IA" "buscamos"'                  (Spanish)
```

**Flags:** `--scroll <n>` (default 2), `--json` (raw JSON output)
**Output JSON:** `[{author, vanity, email, content}, ...]`

### `scripts/linkedin-invite.js` — Send connection requests

Navigates to `/preload/custom-invite/?vanityName=<vanity>`, clicks "Send without a note". Anti-ban delay of 3s between invites.

```bash
# Invite one or more vanities
node scripts/linkedin-invite.js <vanity-name>

# Invite multiple
node scripts/linkedin-invite.js vanity1 vanity2 vanity3

# Search + invite in one command (pipe search -> invite)
node scripts/linkedin-invite.js --from-search '"<Role>" "hiring" LATAM'
```

**Flags:** `--from-search "<keywords>"` (searches and invites all found)
**Exit codes:** 0 = at least one sent, 1 = all failed, 2 = error

### `scripts/linkedin-easy-apply.js` — Apply via Easy Apply

Searches jobs with Easy Apply filter, clicks, fills forms with standard answers, submits, registers in DB.

```bash
# Apply to the first 10 jobs (default)
node scripts/linkedin-easy-apply.js

# Keywords custom + limit
node scripts/linkedin-easy-apply.js --keywords '"<Role>" OR "<Skill>"' --max 5

# List only, don't apply
node scripts/linkedin-easy-apply.js --dry-run

# Output JSON
node scripts/linkedin-easy-apply.js --json
```

**Flags:** `--keywords <q>` (default: derived from DB profile.title + profile.skills), `--location <loc>` (default: from DB job_preferences.location), `--max <n>` (default 10), `--dry-run`, `--json`
**Auto-fill:** all values are read from `users.data.form_answers` (DB). The script fills: years of experience per tech, language level, location, current company, LinkedIn URL, salary, availability, GenAI tools, AWS, etc. Radios: Yes for skills, No for disability/sponsorship (configurable values in DB). Comboboxes: English/Spanish level, seniority (from DB).
**Captcha:** detects and stops with exit 1 + message. Never attempts to solve.
**DB:** registers each application with `platform='linkedin'`, `status='applied'`.

### `scripts/gmail-send.js` — Send emails with CV attached

Opens Gmail compose, fills To/Subject/Body, attaches CV, sends. Supports CC/BCC and body from file.

```bash
# Basic email with CV attached
node scripts/gmail-send.js \
  --to recruiter@company.com \
  --subject "Application - <Role> - <Your Name>" \
  --body "Hi, I saw your post on LinkedIn..."

# Email without CV
node scripts/gmail-send.js --to email@x.com --subject "..." --body "..." --no-cv

# Body from file
node scripts/gmail-send.js --to email@x.com --subject "..." --body-file templates/email-ai-engineer.txt

# Multiple recipients + CC
node scripts/gmail-send.js --to a@x.com,b@x.com --cc c@x.com --subject "..." --body "..."
```

**Flags:** `--to <emails>` (required, comma-separated), `--subject <text>` (required), `--body <text>`, `--body-file <path>`, `--cv <path>` (default: from DB profile.cv_path), `--no-cv`, `--cc <emails>`, `--bcc <emails>`
**UI:** supports Gmail in Spanish (Redactar/Asunto/Cuerpo/Enviar/Adjuntar) and English (Compose/Subject/Body/Send/Attach)
**CV path:** read from DB (users.data.profile.cv_path or personal_info.cv_pdf_path)

### Full pipeline in one command

```bash
# 1. Ensure browser is open with LinkedIn session
node scripts/browser.js open "https://www.linkedin.com"

# 2. Search posts, extract contacts, invite all
node scripts/linkedin-invite.js --from-search '"<Role>" "hiring" LATAM'

# 3. Apply via Easy Apply to 10 jobs
node scripts/linkedin-easy-apply.js --max 10

# 4. For posts with visible email, send email with CV
node scripts/linkedin-search.js '"<Role>" "hiring" LATAM' --json | \
  jq -r '.[] | select(.email) | "--to \(.email) --subject \"Application - <Role>\" --body \"Hi \(.author), I saw your post...\""' | \
  xargs -I {} node scripts/gmail-send.js {}
```

### When NOT to use scripts (manual mode)

- Easy Apply forms with complex open-ended questions (e.g: "Describe your experience with <tech> in 300 words") that require personalized answers
- LinkedIn posts that require analyzing the content to decide whether to apply (ambiguous match)
- Emails to recruiters who already replied (use Gold Rule 6: draft + approval)
- Custom career sites (Lever, Greenhouse, Workday) that aren't LinkedIn Easy Apply
- Situations that require captcha (Gold Rule 5b: stop and ask the user)

### Pipeline kanban

`scripts/pipeline.js` is the kanban board for tracking applications and contacts. Unifies LinkedIn invites, direct emails, and formal applications into a single pipeline with canonical stages.

```bash
# Full board (active cards)
node scripts/pipeline.js

# Include closed (rejected, withdrawn, skipped)
node scripts/pipeline.js --closed

# Funnel summary (counts per stage)
node scripts/pipeline.js --funnel

# Filter by stage
node scripts/pipeline.js --stage interview

# Filter by company
node scripts/pipeline.js --company <company>

# Move a card to another stage (updates status + adds to stage_history)
node scripts/pipeline.js --move 82 interview

# View card detail (with linked messages via application_id)
node scripts/pipeline.js --card 82
```

**Canonical stages (ordered):** `discovered` -> `contacted` -> `applied` -> `in_review` -> `screening` -> `interview` -> `offer` -> `hired`. Closed: `rejected`, `withdrawn`, `skipped`.

**When the agent moves cards:** when it detects a status change (recruiter replies, interview scheduled, rejection), it uses `pipeline.js --move <id> <stage>` instead of a direct UPDATE. This maintains the audit trail in `data.stage_history`.
