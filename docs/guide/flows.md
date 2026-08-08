# Flows

The system has 9 flows plus 1 cross-cutting behavior. Each flow has a trigger keyword and a skill file with step-by-step detail.

## Flow map

| Flow | Trigger | What it does |
|---|---|---|
| Onboarding | `onboarding` | Bootstrap: browser with dedicated profile, Gmail + LinkedIn login, Neon DB, user data |
| Profile | `profile` | Profiling: CV + questionnaire (30 preferences with weights) + voice/style + platform selection |
| Strategy | `strategy` | Configure job search aggressiveness level. All flows respect it |
| Radar | `radar` | Passive sourcing: register on job boards, configure alerts, Gmail filter to Job Alerts folder |
| Targets | `targets` | Active direct sourcing: register and create standout profiles on target companies' career sites, then apply to matching positions |
| News | `news` | Review updates in Gmail, LinkedIn and platforms. Prepare drafts, executive summary by priority, hybrid validation and auto-send |
| Apply | `apply` | Search jobs on LinkedIn, filter by Must-haves, apply via Easy Apply, register in DB |
| Daily | `daily` | Periodic routine: runs news, inbox cleanup, applies if no recent activity |
| Memory | (always on) | Autonomous preference detection, storage and injection. Detects preferences from conversation, saves to DB, loads active ones at the start of every flow |

## Sourcing pillars

Three complementary sourcing strategies:

| Pillar | Flow | Strategy | Reach |
|---|---|---|---|
| Passive | `radar` | Platforms send alerts to Gmail Job Alerts folder | Broad (Otta, Torre, Built In, etc.) |
| Active (LinkedIn) | `apply` | Search and Easy Apply on LinkedIn | Broad (LinkedIn's entire job board) |
| Active (direct) | `targets` | Go directly to 40 target companies' career sites | Deep (specific companies, tailored profiles) |

## Flow dependencies

```
onboarding -> profile -> strategy
                |          |
            radar, apply, targets -> news <- (consumes radar alerts)
                |                       ^
                +------- daily ---------+
```

- **onboarding** must run before anything else
- **profile** depends on onboarding. Without a profile there's no quality matching
- **strategy** depends on onboarding (DB). Sets the aggressiveness level
- **radar** depends on profile. Alerts use profile keywords
- **targets** depends on profile and onboarding (browser sessions for login)
- **news** consumes what radar produces (alerts in Gmail) plus direct messages
- **apply** depends on profile (to filter by Must-haves) and onboarding (DB to register)
- **daily** composes news + apply/targets with decision logic
- **memory** is cross-cutting: runs during every flow
