---
name: radar
description: Registers the user on job platforms, configures alerts with profile keywords, sets up career site alerts (big tech + target companies), creates a Gmail filter to route alerts to a Job Alerts folder.
trigger: radar
---
# Radar

## Trigger

**Keyword: `radar`**

The user says `radar` (or variants: "set up alerts", "register on platforms", "new platforms") and the registration + alert configuration + career site alerts + Gmail filter flow is triggered.

## Purpose

Passive sourcing: platforms and career sites bring opportunities to the user without having to search manually. Alerts arrive in a `Job Alerts` folder in Gmail, and the `news` skill consumes them when the user says `news`.

Three alert sources:
1. **Job boards** (Otta, Torre, Built In, etc.) — broad reach
2. **Big tech career sites** (Google, Meta, Amazon, etc.) — high-value companies not in the 40 targets
3. **Target company ATS alerts** (configured during `targets` flow registration) — deep monitoring of the 40 target companies

## Flow

### 0. Pre-flight

- [ ] Verify active Gmail session. If session closed → open browser with wrapper (see AGENTS.md "Browser session"): `node scripts/browser.js open <url> --headed` (Gold Rule 5)
- [ ] **Browser:** always use `node scripts/browser.js` for open/close/goto. See AGENTS.md "Browser session" for details. Never call `playwright-cli open` directly, never open Chrome directly
- [ ] Read `PLATFORMS.md` "Alert Tracking" section to see which platforms need configuration
- [ ] Read `PROFILE.md` to get keywords, seniority, location, preferences
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```
- [ ] Load target companies (40 companies: 19 LATAM + 21 Argentina, each `{name, url, sector}`). These are priority targets for alert configuration and platform prioritization:
  ```bash
  node scripts/db.js "SELECT data->'target_companies' AS target_companies FROM users WHERE id = 1"
  ```

### 1. Register on platforms

For each unconfigured platform (column "Profile" = "—"):

- [ ] Navigate to the platform
- [ ] **Login with Google** when possible (preferred). If no Google login → open browser with wrapper (`node scripts/browser.js open <url> --headed`) and ask user to login manually (Gold Rule 5)
- [ ] Complete minimum profile:
  - First name, last name
  - Title / headline (from PROFILE.md)
  - Location (from PROFILE.md)
  - Seniority (from PROFILE.md)
  - Upload CV (CV path in DB or `.env`)
  - Preferences: remote, full-time, USD salary range
- [ ] Mark "Profile" = "✅" in PLATFORMS.md

### 2. Configure alerts

For each platform with complete profile but no alerts:

- [ ] Create alert with profile keywords:
  - `AI Architect`, `Engineering Manager`, `AI Strategy`, `AI Implementation`
  - `LLM`, `Agent-First`, `AI Workflow`, `SDLC AI`
  - `Technical Lead`, `Staff Engineer`, `Platform Engineer`
- [ ] If the platform supports company-specific alerts or saved searches, configure alerts for target companies from the DB (40 companies: Nubank, dLocal, Mercado Libre, Globant, Ualá, BBVA, Santander Tecnología, Auth0, etc.). Group by sector if the platform allows it (Fintech, Banking, SaaS, IT Services)
- [ ] Filters: remote only, full-time, senior/lead
- [ ] Frequency: daily or weekly (depending on platform option)
- [ ] Mark "Alerts" = "✅" in PLATFORMS.md with keywords used

### 3. Configure career site alerts (big tech + target companies)

Beyond job board alerts, configure alerts directly on career sites of high-value companies. These are companies not in the 40 target companies (those are handled by `targets` flow) but worth monitoring for AI/Engineering Manager roles.

**Big tech career sites with native alert features:**

| Company | URL | Alert feature | Notes |
|---|---|---|---|
| Google | careers.google.com | "Save search" + email alerts | Search "AI" + "Engineering Manager" + location "Remote" or "Argentina" |
| Meta | metacareers.com | "Job alerts" signup | Search "AI" + "Engineering Manager" |
| Amazon | amazon.jobs | "Save search" + email alerts | Search "AI" + "SDM" (Software Development Manager) |
| Microsoft | careers.microsoft.com | "Job alerts" signup | Search "AI" + "Engineering Manager" |
| Apple | jobs.apple.com | "Save search" + alerts | Search "AI" + "Engineering Manager" |
| Netflix | jobs.netflix.com | No native alerts. Monitor via Google Alerts | Search "AI" + "Engineering Manager" |
| Stripe | stripe.com/jobs | "Job alerts" signup | Search "AI" + "Engineering Manager" |
| OpenAI | openai.com/careers | No native alerts. Monitor via Google Alerts | Search all roles |
| Anthropic | anthropic.com/careers | No native alerts. Monitor via Google Alerts | Search all roles |
| Vercel | vercel.com/careers | "Job alerts" via Ashby | Search "AI" + "Engineering" |
| Cloudflare | cloudflare.com/careers | "Job alerts" signup | Search "AI" + "Engineering Manager" |
| Datadog | careers.datadog.com | "Job alerts" via Greenhouse | Search "AI" + "Engineering Manager" |
| Snowflake | careers.snowflake.com | "Job alerts" via Workday | Search "AI" + "Engineering Manager" |

For each company with native alerts:
- [ ] Navigate to the career site using `node scripts/browser.js goto <url>`
- [ ] Search with keywords: `AI`, `AI Strategy`, `Engineering Manager`, `AI Architect`, `LLM`, `Agent`, `Platform Engineer`, `Staff Engineer`
- [ ] Filter: Remote, Argentina, Global, LATAM
- [ ] Look for "Save search", "Create alert", "Job alerts", "Notify me" button
- [ ] Subscribe with user's Gmail (so alerts route through the Gmail filter)
- [ ] Set frequency: daily if available, weekly otherwise
- [ ] Record in DB:
  ```bash
  node scripts/db.js "INSERT INTO company_registrations (user_id, company, region, sector, careers_url, ats_platform, registration_status, notes) VALUES (1, '<company>', 'big_tech', '<sector>', '<url>', '<ats>', 'alert_only', 'Alerts configured via radar') ON CONFLICT (user_id, company) DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()" --write
  ```

For companies without native alerts (Netflix, OpenAI, Anthropic):
- [ ] Create Google Alerts as backup:
  - Navigate to google.com/alerts
  - Create alert: `site:<company-domain>/careers (AI OR "Engineering Manager" OR "AI Architect" OR LLM OR Agent)`
  - Set frequency: daily
  - Set delivery: email to user's Gmail

### 4. Create Gmail filter

Once, when configuring the first platform:

- [ ] Create label `Job Alerts` in Gmail
- [ ] Create filter with domains of all configured platforms AND ATS alert senders:
  ```
  from:(otta.com OR torre.co OR weworkremotely.com OR builtin.com OR workatastartup.com
    OR greenhouse.io OR lever.co OR ashbyhq.com OR workable.com OR smartrecruiters.com
    OR teamtailor.com OR successfactors.com OR notifications@ashbyhq.com
    OR google.com OR amazon.jobs OR metacareers.com OR careers.microsoft.com
    OR jobs.apple.com OR stripe.com)
  → skip inbox → apply label: Job Alerts
  ```
- [ ] If new platforms or career sites are added later, update the filter by adding the new domain
- [ ] Mark "Gmail Filter" = "✅" in PLATFORMS.md

### 5. Persist

- [ ] Update `PLATFORMS.md` "Alert Tracking" section with each platform's status
- [ ] Update `PROFILE.md` "Configured alerts" section with keywords and platforms
- [ ] Register in DB via db CLI (if exists): save alert status to `users.data.platforms` JSONB:
  ```bash
  node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{platforms}', '<json>'::jsonb) WHERE id = 1" --write
  ```

### 6. Report

- [ ] Summary to user: "Registered on X platforms, Y alerts configured, Z career site alerts, Gmail filter created"
- [ ] List next actions: "Run `news` to check alerts when they arrive"

## Initial platforms (ADR-003)

| Platform | URL | Google login | Notes |
|---|---|---|---|
| Otta | otta.com | Yes | Curated tech startups. Excellent remote + AI filtering |
| Torre | torre.co | Yes | LATAM-focused with AI matching. Remote-first |
| We Work Remotely | weworkremotely.com | No | Largest remote job board. Email + password |
| Built In | builtin.com | Yes | Tech-focused with cities + remote. Serious companies |
| Y Combinator | workatastartup.com | Yes | YC startups exclusively. Many AI startups |

## Rules

- **Google login first**. If not available → wrapper with `--headed` + manual login (Gold Rule 5)
- **Minimum profile**: name, title, location, seniority, CV, remote/full-time preferences
- **Alert keywords** come from PROFILE.md `Search keywords`
- **Gmail filter** is created once and updated when adding platforms OR career site alert sources
- **Career site alerts** are for big tech companies NOT in the 40 target companies. The 40 targets get their alerts configured during the `targets` flow registration
- **Google Alerts** as backup for companies without native alert features (Netflix, OpenAI, Anthropic)
- **Persist status** in PLATFORMS.md after each action
- **Don't apply** — this skill is registration + alerts only. Applications go through `apply` or `targets`
- **Don't reply to messages** — that goes through `news`
- Single user (repo owner)

## Learnings

- **2026-07-31**: An agent running radar couldn't identify target companies because the pre-flight didn't load `users.data.target_companies`. Fixed: added target_companies loading to pre-flight and company-specific alert configuration to step 2. The DB has 40 target companies (19 LATAM + 21 Argentina) with `{name, url, sector}` structure. See DATA.md for the canonical schema.
