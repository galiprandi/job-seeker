---
name: radar
description: Registers the user on job platforms, configures alerts with profile keywords, creates a Gmail filter to route alerts to a Job Alerts folder.
trigger: radar
---
# Radar

## Trigger

**Keyword: `radar`**

The user says `radar` (or variants: "set up alerts", "register on platforms", "new platforms") and the registration + alert configuration + Gmail filter flow is triggered.

## Purpose

Passive sourcing: platforms bring opportunities to the user without having to search manually. Alerts arrive in a `Job Alerts` folder in Gmail, and the `news` skill consumes them when the user says `news`.

## Flow

### 0. Pre-flight

- [ ] Verify active Gmail session. If session closed → open headed browser (Gold Rule 5)
- [ ] Always use Chrome profile `.browser-profile`
- [ ] Read `PLATFORMS.md` "Alert Tracking" section to see which platforms need configuration
- [ ] Read `PROFILE.md` to get keywords, seniority, location, preferences
- [ ] Load active preferences (see `memory` skill):
  ```bash
  node scripts/db.js "SELECT category, key, value, confidence, source FROM preferences WHERE user_id = 1 AND status = 'active' ORDER BY category, key"
  ```

### 1. Register on platforms

For each unconfigured platform (column "Profile" = "—"):

- [ ] Navigate to the platform
- [ ] **Login with Google** when possible (preferred). If no Google login → open headed browser and ask user to login manually (Gold Rule 5)
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
- [ ] Filters: remote only, full-time, senior/lead
- [ ] Frequency: daily or weekly (depending on platform option)
- [ ] Mark "Alerts" = "✅" in PLATFORMS.md with keywords used

### 3. Create Gmail filter

Once, when configuring the first platform:

- [ ] Create label `Job Alerts` in Gmail
- [ ] Create filter with domains of all configured platforms:
  ```
  from:(otta.com OR torre.co OR weworkremotely.com OR builtin.com OR workatastartup.com)
  → skip inbox → apply label: Job Alerts
  ```
- [ ] If new platforms are added later, update the filter by adding the new domain
- [ ] Mark "Gmail Filter" = "✅" in PLATFORMS.md

### 4. Persist

- [ ] Update `PLATFORMS.md` "Alert Tracking" section with each platform's status
- [ ] Update `PROFILE.md` "Configured alerts" section with keywords and platforms
- [ ] Register in DB via db CLI (if exists): save alert status to `users.data.platforms` JSONB:
  ```bash
  node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{platforms}', '<json>'::jsonb) WHERE id = 1" --write
  ```

### 5. Report

- [ ] Summary to user: "Registered on X platforms, Y alerts configured, Gmail filter created"
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

- **Google login first**. If not available → headed browser + manual login (Gold Rule 5)
- **Minimum profile**: name, title, location, seniority, CV, remote/full-time preferences
- **Alert keywords** come from PROFILE.md `Search keywords`
- **Gmail filter** is created once and updated when adding platforms
- **Persist status** in PLATFORMS.md after each action
- **Don't apply** — this skill is registration + alerts only. Applications go through `apply`
- **Don't reply to messages** — that goes through `news`
- Single user (repo owner)

## Learnings

- (Updated after first execution)
