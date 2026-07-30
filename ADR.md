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

## ADR-003: Passive Sourcing via Job Alerts

**Fecha:** 2026-07-30
**Estado:** Aceptado

### Contexto

La búsqueda laboral activa (aplicar a jobs) es el flujo principal, pero depende de que el usuario invoque `job-search` o `news` manualmente. Las plataformas de jobs tienen alertas que pueden traer oportunidades pasivamente, pero sin filtrado generan ruido en el inbox.

### Decisión

Implementar **passive sourcing** en 3 capas:

1. **Registro + alertas** (skill `sourcing`, trigger `alerts`): registrar al usuario en plataformas seleccionadas, configurar alertas con keywords del perfil, crear filtro de Gmail que rutee las alertas a una carpeta `Job Alerts` (skip inbox).
2. **Consumo** (skill `review`, trigger `news`): al ejecutar `news`, revisar la carpeta `Job Alerts` además del inbox, clasificar las alertas por fit (Must/Strong/Nice), y presentar solo las relevantes en el resumen ejecutivo.
3. **Tracking** (`PLATFORMS.md` + `PROFILE.md`): registrar qué plataformas tienen alertas configuradas, qué keywords se usan, y cuándo se revisaron por última vez.

### Plataformas seleccionadas (5 iniciales)

| Plataforma | Por qué | Google login |
|---|---|---|
| Otta | Tech startups curadas, excelente filtrado remote + AI | Sí |
| Torre | LATAM-focused con AI matching, remote-first | Sí |
| We Work Remotely | Job board remote más grande, mucha variedad AI/EM | No |
| Built In | Tech-focused con ciudades + remote, empresas serias | Sí |
| Y Combinator (workatastartup.com) | Startups YC exclusivamente, muchas AI startups | Sí |

### Tradeoffs

- **Pros:** pasivo, diversificación de fuentes, filtrado automático por el agente
- **Cons:** ruido potencial (mitigado con filtro Gmail + clasificación del agente), algunas plataformas sin Google login (login manual), mantenimiento de perles en múltiples plataformas

### Filtro de Gmail

```
from:(otta.com OR torre.co OR weworkremotely.com OR builtin.com OR workatastartup.com)
→ skip inbox → label:Job Alerts
```

### Relación con skills existentes

- `setup` no se modifica — sigue siendo onboarding inicial
- `sourcing` es nueva — maneja registro + alertas + filtro
- `review` se actualiza mínimamente — agrega carpeta `Job Alerts` al step 1
- `job-search` no se modifica — sigue siendo búsqueda + aplicación activa
