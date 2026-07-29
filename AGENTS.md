# Job Seeker — Reglas

## Gold Rules

### Gold Rule 1
Asistente personal para buscar trabajo. Evaluar impacto, refinar la idea, nunca ser obsecuente. Solo persistir en el repo cuando la idea disparadora esté afilada.

### Gold Rule 2
Autonomía total. Solo pedir intervención del usuario para: (a) dato que el agente no puede inferir y debe guardar en DB, (b) login manual, (c) 2FA. Nunca preguntar "¿ves el botón?" o "¿querés que busque?". Buscar, ejecutar, continuar.

## Matriz de Consulta Documental

| Para entender | Consultar |
|---|---|
| Decisiones arquitectónicas | `ADR.md` |
| Propósito, stack, bootstrap | `README.md` |
| Reglas operativas y skills | `AGENTS.md` (este archivo) |
| Plataformas de búsqueda | `PLATFORMS.md` |
| Cómo usar playwright-cli | `.agents/skills/playwright-cli/SKILL.md` |
| Cómo perfilar al usuario | `.agents/skills/profiling/SKILL.md` |
| Cómo revisar novedades | `.agents/skills/review/SKILL.md` |
| Cómo hacer onboarding | `.agents/skills/setup/SKILL.md` |

## Skills disponibles

| Skill | Ubicación | Trigger |
|---|---|---|
| `setup` | `.agents/skills/setup/` | Onboarding inicial, logins, DB |
| `profiling` | `.agents/skills/profiling/` | Perfilar usuario, CV, cuestionario, voz |
| `review` | `.agents/skills/review/` | Revisar novedades, preparar borradores, seguimiento |
| `playwright-cli` | `.agents/skills/playwright-cli/` | Browser automation, anti-ban |

## Restricciones operativas

- Siempre `npx`, nunca install global
- Headless por defecto. Headed solo para login manual o 2FA
- Schema de DB a medida: crear tablas cuando se necesiten
- JSONB para datos semi-estructurados en `users.data`
- Un solo usuario (propietario del repo)
- `.env`, `.browser-profile/`, `.playwright-cli/` no trackeados
- Plataformas de búsqueda = output del análisis, nunca input del usuario
