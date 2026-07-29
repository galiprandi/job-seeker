# DESIGN.md

## Principios

Este repo no tiene UI. Es consumido por agentes coding via skills (markdown) y scripts (Node.js). Los "usuarios" son agentes, no humanos.

## Formato de skills

- Frontmatter YAML: `name`, `description`
- Markdown plano, sin HTML
- Checklists con `- [ ]` para pasos accionables
- Tablas para datos estructurados
- Bloques de código para comandos y SQL
- Máxima densidad por token: breve, directo, sin prosa decorativa

## Convenciones de nombres

- Skills: kebab-case (`playwright-cli`, `job-search`)
- Tablas SQL: snake_case (`users`, `applications`)
- JSONB keys: snake_case (`job_preferences`, `style_profile`)
- Archivos de doc: UPPERCASE (`ADR.md`, `PLATFORMS.md`)

## Si se agrega UI en el futuro

Definir acá:
- Tokens (color, tipografía, espaciado)
- Catálogo de componentes
- Patrones de estados (loading, error, empty)
- Criterios de accesibilidad
