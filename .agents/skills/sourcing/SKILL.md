---
name: sourcing
description: Registra al usuario en plataformas de jobs, configura alertas con keywords del perfil, crea filtro de Gmail para rutear alertas a carpeta Job Alerts. Trigger: alerts.
trigger: alerts
---
# Sourcing

## Trigger

**Palabra clave: `alerts`**

El usuario dice `alerts` (o variantes: "configurar alertas", "registrar en plataformas", "nuevas plataformas") y se dispara el flujo de registro + configuración de alertas + filtro de Gmail.

## Propósito

Passive sourcing: las plataformas traen oportunidades al usuario sin que tenga que buscar manualmente. Las alertas llegan a una carpeta `Job Alerts` en Gmail, y la skill `review` las consume cuando el usuario dice `news`.

## Flujo

### 0. Pre-flight

- [ ] Verificar sesión activa en Gmail. Si sesión cerrada → abrir browser headed (Gold Rule 5)
- [ ] Usar perfil de Chrome `.browser-profile` siempre
- [ ] Leer `PLATFORMS.md` sección "Tracking de Alertas" para ver qué plataformas faltan configurar
- [ ] Leer `PROFILE.md` para obtener keywords, seniority, ubicación, preferencias

### 1. Registrar en plataformas

Por cada plataforma sin configurar (columna "Perfil" = "—"):

- [ ] Navegar a la plataforma
- [ ] **Login con Google** cuando sea posible (preferido). Si no tiene Google login → abrir browser headed y pedir al usuario que haga login manual (Gold Rule 5)
- [ ] Completar perfil mínimo:
  - Nombre, apellido
  - Título / headline (usar de PROFILE.md)
  - Ubicación (de PROFILE.md)
  - Seniority (de PROFILE.md)
  - Subir CV (ruta del CV en DB o `.env`)
  - Preferencias: remote, full-time, USD salary range
- [ ] Marcar "Perfil" = "✅" en PLATFORMS.md

### 2. Configurar alertas

Por cada plataforma con perfil completo pero sin alertas:

- [ ] Crear alerta con keywords del perfil:
  - `AI Architect`, `Engineering Manager`, `AI Strategy`, `AI Implementation`
  - `LLM`, `Agent-First`, `AI Workflow`, `SDLC AI`
  - `Technical Lead`, `Staff Engineer`, `Platform Engineer`
- [ ] Filtros: remote only, full-time, senior/lead
- [ ] Frecuencia: daily o weekly (según opción de la plataforma)
- [ ] Marcar "Alertas" = "✅" en PLATFORMS.md con keywords usadas

### 3. Crear filtro de Gmail

Una sola vez, al configurar la primera plataforma:

- [ ] Crear label `Job Alerts` en Gmail
- [ ] Crear filtro con los dominios de todas las plataformas configuradas:
  ```
  from:(otta.com OR torre.co OR weworkremotely.com OR builtin.com OR workatastartup.com)
  → skip inbox → apply label: Job Alerts
  ```
- [ ] Si se agregan plataformas nuevas después, actualizar el filtro agregando el nuevo dominio
- [ ] Marcar "Filtro Gmail" = "✅" en PLATFORMS.md

### 4. Persistir

- [ ] Actualizar `PLATFORMS.md` sección "Tracking de Alertas" con estado de cada plataforma
- [ ] Actualizar `PROFILE.md` sección "Alertas configuradas" con keywords y plataformas
- [ ] Registrar en DB (si existe): tabla `platforms` con estado de alertas

### 5. Reportar

- [ ] Resumen al usuario: "Registrado en X plataformas, Y alertas configuradas, filtro Gmail creado"
- [ ] Listar próximas acciones: "Ejecutar `news` para revisar alertas cuando lleguen"

## Plataformas iniciales (ADR-003)

| Plataforma | URL | Google login | Notas |
|---|---|---|---|
| Otta | otta.com | Sí | Tech startups curadas. Excelente filtrado remote + AI |
| Torre | torre.co | Sí | LATAM-focused con AI matching. Remote-first |
| We Work Remotely | weworkremotely.com | No | Job board remote más grande. Email + password |
| Built In | builtin.com | Sí | Tech-focused con ciudades + remote. Empresas serias |
| Y Combinator | workatastartup.com | Sí | Startups YC exclusivamente. Muchas AI startups |

## Reglas

- **Google login primero**. Si no disponible → headed browser + login manual (Gold Rule 5)
- **Perfil mínimo**: nombre, título, ubicación, seniority, CV, preferencias remote/full-time
- **Keywords de alertas** se sacan de PROFILE.md `Keywords de búsqueda`
- **Filtro Gmail** se crea una sola vez y se actualiza al agregar plataformas
- **Persistir estado** en PLATFORMS.md después de cada acción
- **No postular** — esta skill es solo registro + alertas. Postulaciones van por `job-search`
- **No responder mensajes** — eso va por `review`
- Un solo usuario (propietario del repo)

## Aprendizajes

- (Se actualiza después de la primera ejecución)
