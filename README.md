# Job Seeker

> Automatizá tu búsqueda laboral con tu agente coding favorito.

Job Seeker es un conjunto de **skills, guías y scripts** que cualquier agente coding (Devin, Claude, opencode, Cursor) consume para buscar, aplicar y hacer seguimiento de trabajos en tu nombre. No es un agente — es el conocimiento que le das a tu agente para que trabaje como vos lo harías.

## Cómo funciona

1. Clonás el repo
2. Le decís a tu agente: *"ejecutá la skill setup"*
3. El agente abre un browser, te pide que loguees en Gmail y LinkedIn, crea tu DB, y perfila tu CV
4. Le decís: *"aplica a 5 puestos"* y el agente busca, filtra, aplica y registra todo

Tu perfil, preferencias, estilo de redacción e historial viven en Postgres (Neon). Tu sesión de browser persiste en un perfil dedicado. Nada sensible se commitea al repo.

## Skills

| Skill | Qué hace |
|---|---|
| `setup` | Onboarding: browser con perfil dedicado, login Gmail + LinkedIn, DB en Neon, datos del usuario |
| `profiling` | Perfilado: CV + cuestionario (30 preferencias con pesos) + voz/estilo + selección de plataformas |
| `review` | Revisa novedades en Gmail, LinkedIn y plataformas. Prepara borradores, resumen ejecutivo por prioridad, validación híbrida y auto-envío |
| `playwright-cli` | Browser automation: comandos, headless por defecto, anti-ban, detección de automation |

## Plataformas

`PLATFORMS.md` es un catálogo de 35 plataformas en 5 categorías (generales, tech, AI, executive, latam), mantenido por la comunidad. El agente lo consulta para decidir dónde buscar según tu perfil — vos no elegís las plataformas, el agente las deduce.

## Stack

- **Browser:** `@playwright/cli` via npx. Perfil persistente, headless por defecto
- **DB:** PostgreSQL via Neon (cloud). Portátil entre máquinas
- **Node:** `pg` para acceso a DB
- **Skills:** Markdown en `.agents/skills/`. Universales, no atadas a un agente

## Prerrequisitos

- Node.js 18+
- npx
- Cuenta en Neon (gratis) o cualquier Postgres cloud

## Bootstrap

```bash
git clone https://github.com/galiprandi/job-seeker.git
cd job-seeker
npm install
```

Creá `.env` con tu connection string:

```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
```

Abrí tu agente coding en el repo y decile: *"ejecutá la skill setup"*

## Estructura

```
.agents/skills/          # Skills consumidas por cualquier agente
  setup/SKILL.md         # Onboarding
  profiling/SKILL.md     # Perfilado
  review/SKILL.md        # Revisión de novedades y seguimiento
  playwright-cli/SKILL.md # Browser automation
.playwright/
  cli.config.json        # Config de playwright-cli (headless: true)
.env                     # DATABASE_URL (no trackeado)
.browser-profile/        # Perfil de Chrome con sesiones (no trackeado)
.playwright-cli/         # Snapshots y logs (no trackeado)
PLATFORMS.md             # Catálogo de plataformas (comunidad)
ADR.md                   # Decisiones arquitectónicas
AGENTS.md                # Reglas de operación + Gold Rules
DESIGN.md                # Design tokens (placeholder, sin UI aún)
LICENSE                  # MIT
```

## Decisiones clave

Ver `ADR.md` para el detalle. Resumen:

- **playwright-cli** sobre MCP: CLI nativo, sin JSON config, token-efficient
- **Postgres** sobre Mongo: 70% de los datos son relacionales. JSONB para lo semi-estructurado
- **Neon** para portabilidad: clonás en otra máquina, mismo `DATABASE_URL`, mismo perfil
- **npx** sobre installs globales: cero fricción al clonar
- **Headless** por defecto: headed solo para login manual y 2FA
- **Skills en `.agents/skills/`**: formato universal, funciona con cualquier agente

## Licencia

MIT — usalo, forkealo, contribuí.

## Contribuir

- `PLATFORMS.md`: agregá plataformas con los campos de la tabla existente
- Skills: mejorá los checklists y reglas existentes
- ADR: append-only. Para revertir una decisión, agregá un nuevo ADR que la superseda
