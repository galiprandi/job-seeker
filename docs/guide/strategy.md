# Strategy Levels

The job search has configurable aggressiveness. The agent asks you about your situation, proposes a level, and saves it to the database. All flows read and respect it.

## Levels

| Level | Situation | apply_batch | targets_batch | daily_freq | match_threshold | follow_up_days | relax_must_haves | cold_outreach | sources |
|---|---|---|---|---|---|---|---|---|---|
| `passive` | Employed, open to opportunities | 0 | 0 | on-demand | Must only | 7 | none | false | radar, news |
| `selective` | Employed, looking for better | 5 | 5 | 1x/day | Must only | 5 | none | false | radar, apply, targets, news |
| `active` | Unemployed or about to be | 10 | 10 | 2x/day | Must+Strong | 3 | manager (accept IC if AI focus strong) | true | radar, apply, targets, news |
| `aggressive` | Needs a job now | 15 | all | 2x/day | Must+Strong+Nice | 2 | manager + remote (accept hybrid if project is great) | true | radar, apply, targets, news |

## Parameters

Each level sets these parameters. You can customize individual ones after choosing a level:

| Parameter | Type | What it controls |
|---|---|---|
| `apply_batch_size` | int | Max jobs per apply session (0 = no auto-apply) |
| `targets_batch_size` | int | Max companies per targets session (0 = don't run, "all" = no limit) |
| `daily_frequency` | string | How often to run daily: on-demand, 1x/day, 2x/day |
| `match_threshold` | string | Which matches to act on: must_only, must_strong, must_strong_nice |
| `follow_up_days` | int | Days before sending a follow-up on an application |
| `relax_must_haves` | array | Which Must-haves to relax: manager, remote, salary, ai_focus |
| `cold_outreach` | bool | Whether to send cold messages to recruiters at target companies |
| `sources_active` | array | Which sourcing pillars to use: radar, apply, targets, news |

## How to change

Say any of these to your agent:
- `strategy`
- "change strategy"
- "more aggressive"
- "I found a job" (memory skill detects this and proposes passive)
- "I was laid off" (memory skill detects this and proposes active)

The agent asks questions, proposes a level, allows customization, and saves to DB.
