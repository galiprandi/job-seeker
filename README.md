# Job Seeker

Repo de skills + guías + scripts para automatizar búsqueda laboral. No es un agente; es consumido por cualquier agente coding (Devin, Claude, opencode). MIT.

## Stack

- **Browser:** `@playwright/cli` via npx. Perfil persistente en `.browser-profile/`
- **DB:** PostgreSQL via Neon (cloud). Connection string en `.env`
- **Node:** `pg` para acceso a DB

## Prerrequisitos

- Node.js 18+
- npx
- Cuenta en Neon (o cualquier postgres cloud)

## Bootstrap

1. Clonar repo
2. `npm install`
3. Crear `.env` con `DATABASE_URL=postgresql://...`
4. Decirle a tu agente: "ejecutá la skill setup"

## Skills

| Skill | Descripción |
|---|---|
| `setup` | Onboarding: browser, logins, DB, datos básicos del usuario |
| `profiling` | Perfilado: CV + cuestionario + voz/estilo + plataformas |
| `playwright-cli` | Uso de playwright-cli: comandos, anti-ban, headless |

## Estructura

```
.agents/skills/     # Skills consumidas por cualquier agente
.env                # DATABASE_URL (no trackeado)
.browser-profile/   # Perfil de Chrome (no trackeado)
.playwright-cli/    # Snapshots y logs (no trackeado)
PLATFORMS.md        # Catálogo de plataformas (comunidad)
ADR.md              # Decisiones arquitectónicas
AGENTS.md           # Reglas de operación
```
