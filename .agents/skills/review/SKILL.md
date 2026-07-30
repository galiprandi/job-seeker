---
name: review
description: Revisa novedades de postulaciones en Gmail, LinkedIn y plataformas. Prepara borradores, presenta resumen ejecutivo por prioridad, valida con el usuario y envía respuestas.
trigger: news
---
# Review

## Trigger

**Palabra clave: `news`**

El usuario dice `news` (o variantes: "novedades", "revisá", "hay novedades") y se dispara automáticamente la rutina completa de revisión. No requiere más instrucciones — el agente ejecuta todo el flujo de principio a fin.

También se ejecuta en paralelo cuando el usuario lanza una postulación.

## Flujo

### 0. Pre-flight

- [ ] Verificar sesión activa en LinkedIn y Gmail. Si sesión cerrada → abrir browser headed (Gold Rule 5) → avisar al usuario → esperar confirmación
- [ ] Usar perfil de Chrome `.browser-profile` siempre

### 1. Recolectar novedades (en paralelo)

Ejecutar todas las fuentes en paralelo:

- [ ] **Gmail inbox:** buscar emails no leídos desde la última revisión. Filtro: todo lo relacionado a búsqueda laboral y sitios laborales (recruiters, HR, plataformas, newsletters con jobs, respuestas a postulaciones). Ignorar spam obvio. Guardar `last_review_at` en DB para saber desde cuándo buscar
- [ ] **Gmail carpeta `Job Alerts`:** revisar label `Job Alerts` (alertas de plataformas configuradas via skill `sourcing`). Clasificar cada alerta por fit: Must/Strong/Nice según PROFILE.md. Solo presentar Must y Strong en el resumen. Ignorar Nice a menos que el usuario pida ver todo
- [ ] **LinkedIn mensajes:** mensajes no leídos en inbox. Filtrar recruiters, HR, respuestas a postulaciones
- [ ] **LinkedIn notificaciones:** notificaciones de postulaciones (status changes, mensajes de reclutadores)
- [ ] **Plataformas:** solo si hay postulaciones pendientes en DB. Navegar a cada plataforma, revisar status de postulaciones existentes
- [ ] **Follow-ups pendientes:** consultar DB por applications sin respuesta después de X días (contextual: 3 días para urgentes, 5 para normales, 7 para cold)

### 2. Clasificar y priorizar

Cada item se clasifica en una categoría y se le asigna prioridad contextual:

| Categoría | Descripción | Default prioridad |
|---|---|---|
| `interview` | Invitación a entrevista, scheduling | Alta |
| `offer` | Oferta de trabajo, propuesta salarial | Alta |
| `recruiter_new` | Outreach de recruiter nuevo (sin postulación previa) | Media |
| `recruiter_reply` | Respuesta de recruiter a postulación | Media |
| `follow_up` | Postulación sin respuesta, hay que seguir | Media-Baja |
| `rejected` | Rechazo de postulación | Baja |
| `new_job_must` | Nuevo job que matchea Must-have | Media-Alta |
| `new_job_strong` | Nuevo job que matchea Strong | Media |
| `new_job_nice` | Nuevo job que matchea Nice | Baja |
| `newsletter` | Newsletter con jobs relevantes | Baja |

Prioridad contextual ajusta según:
- Salario vs expectativa (más alto que esperado → sube prioridad)
- Fit con perfil (AI Strategy + Manager + remoto → sube)
- Urgencia temporal (entrevista en 24h → alta)
- Stage de proceso (más avanzado → más prioridad)

### 3. Preparar borradores

**Gold Rule 6: SIEMPRE mostrar borrador al usuario antes de enviar. Nunca enviar sin aprobación.**

Por cada item que requiera respuesta:

1. **Extraer action items del mensaje original** — antes de investigar nada, parsear el mensaje y listar qué acciones concretas pide el remitente: ¿hay un calendar link? ¿pide CV? ¿pide responder un formulario? ¿pide agendar? Destacar **acciones inmediatas** (ej: "hay un link de Google Calendar, podés agendar ya") vs **acciones que requieren decisión** (ej: "pide confirmar interés")
2. **Investigar la empresa** (web search): qué hace, tamaño, funding, cultura, stack si está visible
3. **Analizar fit** con el perfil del usuario (objetivo #1: AI flujos, objetivo #2: Manager sacrificable)
4. **Preparar borrador** usando el estilo del usuario (cálido, directo, en español o inglés según contexto)

Tipos de borrador:

- [ ] **interview:** confirmar + proponer 2-3 horarios basados en disponibilidad del usuario
- [ ] **offer:** agradecer + pedir detalles (salario, benefits, equity, start date) antes de negociar
- [ ] **recruiter_new:** expresar interés o rechazar según fit con perfil. Si interés, compartir disponibilidad. Mencionar algo específico de la empresa investigada
- [ ] **recruiter_reply:** responder según contexto (agendar, enviar info adicional, negociar)
- [ ] **follow_up:** mensaje breve recordando la postulación y reiterando interés
- [ ] **rejected:** agradecer + dejar puerta abierta (opcional, solo si la empresa interesa)
- [ ] **new_job_must:** preparar postulación completa (cover letter + CV) para auto-aplicar
- [ ] **new_job_strong/nice:** solo listar en resumen, no preparar borrador

Borradores se guardan en `messages.draft` como JSONB.

### 4. Resumen ejecutivo

Presentar al usuario ordenado por prioridad (alta → baja). Formato:

```
## Resumen de novedades (12 items)

### Alta prioridad (3)
1. [interview] Google - Engineering Manager AI - Entrevista técnica martes 15:00
   → Borrador: confirmar + proponer horarios
   → [Aprobar] [Editar] [Rechazar]

2. [offer] Stripe - $7k/mes - Oferta con equity 0.1%
   → Borrador: agradecer + pedir detalles
   → [Aprobar] [Editar] [Rechazar]

3. [interview] Remote - AI Strategy Lead - Recruiter screening jueves
   → Borrador: confirmar + proponer horarios
   → [Aprobar] [Editar] [Rechazar]

### Media prioridad (5)
4. [recruiter_new] Meta - Recruiter outreach para Staff EM
   → Borrador: expresar interés
   → [Aprobar] [Editar] [Rechazar]
...

### Baja prioridad (4)
10-12. [rejected] 3 rechazos (Mercado Libre, Globant, Bumeran)
   → [Batch: agradecer todos] [Ignorar]

13. [newsletter] Get on Board - 15 jobs nuevos esta semana
   → [Ver jobs] [Ignorar]
```

### 5. Validación híbrida

- **Uno por uno** para alta prioridad (interview, offer): el usuario aprueba, edita o rechaza cada borrador individualmente
- **Batch** para media y baja prioridad: el usuario puede aprobar todos los de una categoría con una acción
- **Auto-postular** Must-match: el agente postula automáticamente y notifica en el resumen
- Si el usuario edita un borrador → actualizar antes de enviar
- Si el usuario rechaza → marcar como `ignored` en DB

### 6. Envío

- Después de aprobación (individual o batch), el agente envía automáticamente
- Gmail: responder email o enviar nuevo
- LinkedIn: responder mensaje o enviar DM
- Plataformas: completar formulario de postulación
- Registrar envío en DB (`messages.sent_at`, `messages.status = sent`)

### 7. Cleanup

- [ ] **Eliminar** emails irrelevantes (rechazos, job alerts no relevantes, marketing) — preguntar al usuario antes de eliminar en batch
- [ ] **Archivar** emails ya respondidos o procesados
- [ ] **Marcar como spam** job alerts recurrentes si el usuario lo pide

### 8. Cerrar

- [ ] Actualizar `last_review_at` en DB
- [ ] Actualizar status de applications según respuestas recibidas
- [ ] Reportar al usuario: "Enviadas 5 respuestas, 2 postulaciones automáticas, 3 items ignorados, 8 emails eliminados"

## Schema de DB

```sql
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  platform TEXT,
  company TEXT,
  role TEXT,
  url TEXT,
  status TEXT DEFAULT 'applied', -- applied, interviewing, offered, rejected, withdrawn, follow_up_sent
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) NULL,
  user_id INTEGER REFERENCES users(id),
  channel TEXT, -- gmail, linkedin, platform
  direction TEXT, -- inbound, outbound
  sender TEXT,
  subject TEXT,
  body TEXT,
  draft TEXT, -- borrador preparado por el agente
  status TEXT DEFAULT 'pending', -- pending, approved, sent, ignored, draft
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}'
);

-- Control de última revisión
-- users.data.last_review_at (JSONB)
```

## Reglas

- Ejecutar fuentes en paralelo para minimizar tiempo
- Borradores siempre usan `style_profile` de DB
- Follow-up timing es contextual: 3 días urgentes, 5 normales, 7 cold
- Auto-postular solo Must-match. Strong y Nice se listan, no se postulan
- Filtro Gmail: todo lo relacionado a búsqueda laboral y sitios laborales
- Plataformas: solo revisar si hay applications pendientes en DB
- Persistir todo: applications, messages, borradores, envíos
- `last_review_at` en `users.data` para saber desde cuándo buscar
- Si no hay novedades: responder "Sin novedades. Última revisión: [fecha]"
- Un solo usuario (propietario del repo)

## Aprendizajes de LinkedIn

- LinkedIn usa editor tiptap — los `ref` cambian tras cada acción. SIEMPRE tomar snapshot nuevo antes de interactuar
- Mensajes: navegar a `linkedin.com/messaging/` → snapshot → buscar conversaciones no leídas
- Notificaciones: navegar a `linkedin.com/notifications/` → snapshot
- `mcp6_send_message` y `mcp6_connect_with_person` requieren `confirm_send: true` (si se usa MCP de LinkedIn)
