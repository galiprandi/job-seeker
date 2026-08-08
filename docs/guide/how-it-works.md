# How It Works

## The cycle

```
You: "apply to 5 jobs"
  -> Agent loads your profile from DB
  -> Searches LinkedIn with your Must-have filters
  -> Applies via Easy Apply (form data from DB)
  -> Registers every application
  -> Shows you a summary
```

## Architecture

```
onboarding -> profile -> strategy
                |          |
            radar, apply, targets -> news <- (consumes radar alerts)
                |                       ^
                +------- daily ---------+
```

- **onboarding** must run before anything else. Without `.env` and DB nothing works.
- **profile** depends on onboarding. Without a profile there's no quality matching.
- **strategy** depends on onboarding (DB). Sets the aggressiveness level that all flows respect.
- **radar** depends on profile. Alerts use profile keywords.
- **targets** depends on profile and onboarding (browser sessions for login).
- **news** consumes what radar produces (alerts in Gmail) plus direct messages.
- **apply** depends on profile (to filter by Must-haves) and onboarding (DB to register).
- **daily** composes news + apply/targets with decision logic.
- **memory** is cross-cutting: runs during every flow.

## Data flow

All candidate-specific data lives in Postgres (JSONB for semi-structured data). The repo contains zero personal data. When a script needs your name, email, CV path, or form answers, it reads from the DB at runtime. If a key is missing, the agent stops and asks you.

## Browser automation

The browser wrapper (`scripts/browser.js`) guarantees:
1. The `.browser-profile` directory is always used (isolated work sessions)
2. Browser mode preference is respected automatically (headless by default, headed for logins)
3. Session management prevents multiple instances
4. Cookie/state isolation between work and personal browsing

## Agent-agnostic

Skills are plain markdown files in `.agents/skills/`. Any coding agent that can read files and execute shell commands can use them. The skills don't depend on any agent-specific API.
