# ADR — Job Seeker

## Decisión

Repo de skills + guías + scripts para automatizar búsqueda laboral. No es un agente; es consumido por cualquier agente coding (Devin, Claude, opencode). MIT.

### Arquitectura

- **Skills en `.agents/skills/`** — una por tarea (navegar, redactar, DB, gestionar, perfilar). Formato universal, no atado a un agente. Razón: portabilidad.
- **Referencia V0** — skill `job-search` en `/me` es referencia histórica. Las skills se construyen de a una por instrucción del usuario.
- **Multi-usuario** — onboarding genérico desde cero. Cualquiera clona, corre onboarding, funciona.

### Browser

- **playwright-cli** con `--profile=<path>` para sesión persistente. Razón: CLI nativo, sin MCP ni JSON config, token-efficient.
- **Headless por defecto.** Headed solo cuando requiere intervención del usuario (login manual, 2FA). Config en `.playwright/cli.config.json` con `headless: true`. Sobreescribir con `--headed` cuando haga falta. Razón: velocidad y menos recursos cuando no hay intervención humana.
- **Login inicial headed**, resto headless. Si detecta bloqueo/captcha → switch a headed y lo recuerda. Razón: velocidad cuando es seguro, safety cuando banean.
- **Reglas anti-ban** no viven acá. Van en la skill de navegación cuando se construya.

### Persistencia

- **Postgres** via cloud (Neon recomendado). Razón: el usuario clona en otra máquina, apunta al mismo `DATABASE_URL`, no pierde perfil ni histórico.
- **Postgres sobre Mongo** — 70% de los datos son relacionales (aplicaciones↔empresas↔mensajes↔entrevistas). Joins nativos. JSONB para CV/style profile semi-estructurado. Mongo obliga a denormalizar o pelear con `$lookup` (joins peores). Atlas free tier existe pero no compensa.
- **`.env` con `DATABASE_URL`**, no trackeado. Sin docker-compose.

### Perfilado

- Skill que pide CV (URL/PDF/lo que sea), perfil LinkedIn, preguntas. Construye perfil en DB.
- Research inicial de mensajes LinkedIn/Gmail → style profile en DB → validación humana (3 muestras corregidas).

### Convenciones

- **`npx` sobre installs globales** — mitigar fricción. Sin `npm install -g`. Razón: cualquier usuario clona y corre sin tocar su entorno global.

### Operación

- **On-demand.** Usuario dice "aplica a X" + opcional revisar novedades.
- **Idioma:** el del usuario, siempre.
- **2FA:** pausa + notificación macOS si disponible.
- **Notificaciones:** solo en sesión.
- **Cover letters:** LLM del agente del usuario + style profile desde DB.
- **Rechazos/follow-ups:** usuario decide, se recuerda en DB.
