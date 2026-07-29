---
name: setup
description: Configuración inicial del entorno. Browser, logins, DB, datos del usuario.
---
# Setup

## Pasos

1. Verificar `node` y `npx`
2. `.gitignore`: `.browser-profile/`, `.playwright-cli/`, `.env`, `node_modules/`
3. `npm init -y && npm install pg && npm install --save-dev @types/pg`
4. Abrir browser headed (requiere login manual): `npx @playwright/cli open --profile=.browser-profile --headed --browser=chrome <url>`
5. Preguntar email. Navegar al login del proveedor (Gmail → accounts.google.com, Outlook → outlook.live.com). Completar email con `fill`, clickear Next, esperar auth manual + 2FA
6. Validar sesión: navegar al inbox, confirmar URL no redirige a login
7. Preguntar si tiene connection string o quiere crear DB en Neon
8. Si crear: navegar a console.neon.tech, login con Google (reusa sesión), "New project", nombre `job-seeker`, región cercana, Create. Leer connection string (Show password + eval para extraer)
9. Guardar connection string en `.env` como `DATABASE_URL`
10. Preguntar nombre del usuario
11. Crear tabla `users` e insertar registro:
    ```sql
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      data JSONB DEFAULT '{}'
    );
    INSERT INTO users (name, email, data) VALUES (..., ..., '{}')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;
    ```
12. Navegar a linkedin.com/login. Esperar auth manual + 2FA
13. Validar sesión: navegar a linkedin.com/feed/
14. Guardar LinkedIn profile URL en `users.data.linkedin_profile` (jsonb_set)
15. Recolectar info del usuario de todos los sitios logueados (LinkedIn, Gmail/Google): nombre, foto, teléfono, email. Guardar en `users.data` como JSONB. Útil para alinear perfiles en otras plataformas de búsqueda
16. Validar si los perfiles requieren update (datos inconsistentes entre sitios). Reportar al usuario
17. Cerrar browser

## Reglas

- Autonomía total. Solo pedir intervención para: dato que no se puede inferir, login manual, 2FA
- Login email primero, LinkedIn después
- Validar sesión después de cada login
- `.env` no trackeado
- Schema a medida: solo crear tablas cuando se necesiten
- JSONB para datos semi-estructurados en `users.data`
- Un solo usuario (propietario del repo)
