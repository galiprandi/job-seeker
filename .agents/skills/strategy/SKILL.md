---
name: strategy
description: Configure and adjust the job search strategy level. The agent interrogates the user, proposes a level, and saves it to DB. All flows respect it.
trigger: strategy
---
# Strategy — Job search aggressiveness configuration

## Trigger

**Keyword: `strategy`**

The user says `strategy` (or variants: "cambiar estrategia", "change strategy", "more aggressive", "less aggressive", "urgency", "how active") and the strategy configuration flow is triggered.

## Purpose

The job search has configurable aggressiveness. Different situations (employed vs unemployed, urgent vs relaxed) require different levels of effort. This flow lets the user define and adjust their strategy, which all other flows respect.

## Pre-flight

- [ ] Load current strategy:
  ```bash
  node scripts/db.js "SELECT value FROM preferences WHERE user_id = 1 AND category = 'workflow' AND key = 'strategy_level' AND status = 'active'"
  node scripts/db.js "SELECT data->'strategy' AS strategy FROM users WHERE id = 1"
  ```
- [ ] If no strategy exists, note that onboarding step 4b was skipped. Default to `selective`.

## Flow

### 1. Show current strategy

If a strategy exists, show the user:
```
Current strategy: selective
- Apply batch: 5 jobs per session
- Targets batch: 5 companies per session
- Daily frequency: 1x/day
- Match threshold: Must only
- Follow-up: 5 days
- Relax Must-haves: none
- Cold outreach: no
- Active sources: radar, apply, targets, referrals, news
```

### 2. Ask about current situation

Present the 4 levels (see AGENTS.md "Strategy levels") and ask:

1. ¿Estás empleado actualmente?
2. ¿Qué tan urgente es tu búsqueda?
   - Sin urgencia, solo mirando → `passive`
   - En los próximos meses, buscando algo mejor → `selective`
   - Necesito algo pronto → `active`
   - Necesito algo ya, desesperado → `aggressive`
3. ¿Aceptarías roles IC o solo Manager?
4. ¿Aceptarías hybrid si el proyecto es muy bueno?
5. ¿Quieres que aplique automáticamente o solo te muestre opciones?

Based on answers, propose a level. Explain what changes:
```
Based on your answers, I propose: active

This means:
- I'll apply to 10 jobs per session (Must + Strong matches)
- Register on 10 target companies per session
- Run daily 2x/day
- Follow up after 3 days instead of 5
- Accept IC roles if AI focus is strong (Manager relaxed)
- Send cold outreach to recruiters at target companies

Does this work? You can adjust any parameter individually.
```

### 3. Allow customization

After proposing a level, let the user customize individual parameters:
- "Quiero que apliques a 15 pero solo Must-matches" → override `apply_batch_size = 15`, keep `match_threshold = must_only`
- "No quiero cold outreach" → override `cold_outreach = false`
- "Aceptar hybrid pero no IC" → override `relax_must_haves = ["remote"]` (not "manager")

### 4. Save to DB

```bash
# Save level
node scripts/db.js "INSERT INTO preferences (user_id, category, key, value, confidence, source) VALUES (1, 'workflow', 'strategy_level', '<level>', 1.0, 'explicit_statement') ON CONFLICT (user_id, category, key) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = NOW()" --write

# Save detailed parameters
node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{strategy}', '<json>'::jsonb) WHERE id = 1" --write
```

The strategy JSON contains all parameters (see AGENTS.md "Strategy levels"). Example for `active` with customizations:
```json
{
  "level": "active",
  "apply_batch_size": 15,
  "targets_batch_size": 10,
  "daily_frequency": "2x/day",
  "match_threshold": "must_strong",
  "follow_up_days": 3,
  "relax_must_haves": ["manager"],
  "cold_outreach": false,
  "sources_active": ["radar", "apply", "targets", "referrals", "news"]
}
```

### 5. Confirm

Show the final strategy and confirm:
```
Strategy saved: active (customized)

- Apply: 15 jobs/session, Must+Strong matches
- Targets: 10 companies/session
- Daily: 2x/day
- Follow-up: 3 days
- Relaxed: Manager (IC roles accepted if AI focus strong)
- Cold outreach: disabled
- Sources: radar, apply, targets, referrals, news

All flows will respect this. Say "strategy" again to change it.
```

## Level defaults

See AGENTS.md "Strategy levels" for the full table. Summary:

| Level | apply_batch | targets_batch | daily | match | follow_up | relax | cold |
|---|---|---|---|---|---|---|---|
| passive | 0 | 0 | on-demand | must_only | 7 | [] | false |
| selective | 5 | 5 | 1x/day | must_only | 5 | [] | false |
| active | 10 | 10 | 2x/day | must_strong | 3 | ["manager"] | true |
| aggressive | 15 | all | 2x/day | must_strong_nice | 2 | ["manager", "remote"] | true |

## Rules

- **Always show current strategy first** before proposing changes
- **Explain what changes** when proposing a new level. The user needs to understand the impact
- **Allow customization** of any parameter after choosing a level. Don't force all defaults
- **Save both** the level name (preferences) and detailed params (users.data.strategy). The level is the quick reference, the params are what flows actually read
- **Report what was saved** (Gold Rule 3). One line: "Estrategia actualizada: active"
- **Never change strategy without asking.** Even if memory detects a situation change, propose the change and wait for confirmation
- Single user (repo owner)

## Dependencies

- Depends on `onboarding` (DB must exist)
- Read by all flows at pre-flight
- Memory skill can trigger this flow when situation changes are detected

## Timing and batch sizes

Practical limits per session (validated empirically):

- An apply session can process 7-10 Easy Apply jobs in ~30 min
- Connection requests: 8-10 per session (avoid LinkedIn limits)
- Direct emails: 4-5 per session (each takes ~2 min with attachment)
- Effective total per session: 15-20 application/contact actions
- Some companies have very long forms that take ~10 min each. The rest take 2-5 min each

These limits interact with strategy levels:
- `passive`: 0 applications, 0 targets (on-demand only)
- `selective`: 5 applications, 5 targets per session
- `active`: 10 applications, 10 targets per session
- `aggressive`: 15 applications, all targets per session

**LinkedIn limits:** custom notes on connection requests have a weekly cap. When exhausted, send invites without a note. Don't retry with a note.
