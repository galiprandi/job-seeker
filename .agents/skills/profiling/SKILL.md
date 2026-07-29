---
name: profiling
description: Captura y estructura el perfil del usuario desde CV + cuestionario para decidir en su nombre. Garantiza matching de calidad.
---
# Profiling

## Fase 1: CV (online o PDF)

Pedir CV al usuario (URL o PDF). Extraer:

- [ ] Nombre completo y título/profesión
- [ ] Resumen profesional (elevator pitch)
- [ ] Experiencia laboral (empresa, rol, período, logros, equipo a cargo, reporting line)
- [ ] Skills técnicas (tech stack, herramientas)
- [ ] Skills blandas (liderazgo, comunicación, etc.)
- [ ] Certificaciones y cursos
- [ ] Educación (títulos, instituciones)
- [ ] Idiomas y nivel
- [ ] Logros cuantificables (métricas, impacto)
- [ ] Proyectos destacados
- [ ] Open source contributions

Guardar en `users.data.profile` como JSONB.

## Fase 2: Cuestionario (gaps del CV)

Preguntas en bloques de 4, multi-select cuando aplique. Cada respuesta debe tener peso: **Must** (innegociable), **Strong** (preferencia fuerte), **Nice** (sumaría).

### Bloque 1: Rol y nivel
- [ ] Tipo de rol (IC, manager, mixto, arquitecto, director/CTO)
- [ ] Seniority target (senior, staff, principal, manager, director, VP, C-level)
- [ ] Reporting line esperada (CEO, CTO, VP Eng, otro director)
- [ ] Technical involvement (% de tiempo codeando vs management)

### Bloque 2: Modalidad y geografía
- [ ] Modalidad (remoto, híbrido, presencial)
- [ ] Ubicación actual y disposición a reubicarse
- [ ] Timezones aceptados (Americas, Europa, Asia, global)
- [ ] Tipo de contrato (empleado, contratista, B2B)

### Bloque 3: Compensación
- [ ] Rango salarial (min, esperado, moneda)
- [ ] Equity expectations (% , stage realista)
- [ ] Benefits importantes (health, education budget, equipment, etc.)
- [ ] Flexibilidad en must-haves (ej: remoto 100% absoluto o acepta 1 viaje trimestral)

### Bloque 4: Equipo y autonomía
- [ ] Tamaño de equipo actual vs deseado
- [ ] Hiring/firing authority esperada
- [ ] Budget authority (decisión de presupuesto propio)
- [ ] Múltiples squads / org scope

### Bloque 5: Tipo de empresa y stack
- [ ] Tamaño de empresa (startup, scale-up, corporate)
- [ ] Stage (pre-seed, seed, Series A-C, public)
- [ ] Stack técnico preferido o abierto a otros
- [ ] Tipo de producto (producto propio, plataforma interna, consultoría)

### Bloque 6: Industria y misión
- [ ] Industrias preferidas
- [ ] Industrias a evitar (con matiz: ¿absoluto o acepta exposure parcial?)
- [ ] Misión/valores que te interesen (educación, health, climate, fintech, dev tools, etc.)
- [ ] Deal-breakers graduados (cripto, gambling, research, freelance, junior)

### Bloque 7: AI y cultura
- [ ] AI focus (obligatorio, preferible, indiferente)
- [ ] Tipo de AI role (strategy, adoption, platform, agents, RAG, evals)
- [ ] Cultura de trabajo (async, sync, documentation-first, meetings)
- [ ] Impacto esperado en primeros 6 meses

### Bloque 8: Disponibilidad e idioma
- [ ] Disponibilidad (inmediata, 2 semanas, 1 mes)
- [ ] Situación actual (trabajando cambio activo, pasivo, desempleado)
- [ ] Idiomas de trabajo
- [ ] Travel (0%, eventual, hasta 25%, indiferente)

Guardar en `users.data.job_preferences` como JSONB con pesos.

## Fase 3: Voz y estilo

### 3a: Inferencia automática
- [ ] Abrir browser headless con perfil persistente
- [ ] Leer últimos 20-50 mensajes enviados en LinkedIn (filtrar "You:")
- [ ] Leer emails enviados relevantes en Gmail (a recruiters, HR, companies)
- [ ] Inferir: tono, idioma default, características de redacción, longitud promedio
- [ ] Extraer 3-5 samples representativos (1-2 recruiter, 2-3 personal)

### 3b: Confirmación con opciones
Preguntar al usuario:
- [ ] Tono (formal, casual-profesional, casual, directo/sin vueltas)
- [ ] Idioma default (español, inglés, depende del contexto)
- [ ] Longitud preferida (corto 1-3 líneas, medio 4-6, largo 7+)
- [ ] Saludo preferido (Hola [nombre], Estimado, sin saludo, otro)
- [ ] Cierre preferido (Saludos, Abrazo, sin cierre, otro)
- [ ] ¿Usar bullet lists en mensajes? (sí, no)
- [ ] ¿Emojis en mensajes profesionales? (sí, no, solo en personales)

### 3c: Validación
- [ ] Guardar inferencia + preferencias en `users.data.style_profile` como JSONB
- [ ] Mostrar 3 mensajes redactados con el style al usuario para validación
- [ ] Si usuario corrige → actualizar style_profile

## Fase 4: Plataformas (output, no input)

- [ ] Consultar `PLATFORMS.md`
- [ ] Cruzar perfil del usuario vs tipos de rol/industrias/seniority de cada plataforma
- [ ] Asignar Tier 1/2/3 a plataformas según fit
- [ ] Guardar en `users.data.platforms` como JSONB
- [ ] No preguntar al usuario. Es resultado del análisis

## Reglas

- CV es source of truth. Cuestionario cubre lo que el CV no dice
- Persistir todo en `users.data` como JSONB
- Si el usuario ya tiene perfil en DB, validar cambios antes de sobreescribir
- El perfil se actualiza cuando el usuario cambia su CV o responde nuevas preguntas
- Preguntas en bloques de 4, multi-select cuando aplique
- Cada preferencia con peso: Must / Strong / Nice
- Plataformas = output del análisis, nunca input del usuario
- Un solo usuario (propietario del repo)
