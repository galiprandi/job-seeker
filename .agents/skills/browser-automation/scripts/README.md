# Scripts de browser-automation

## `browser.js`

Wrapper seguro de Playwright. Garantiza que el perfil (`.browser-profile`) siempre se use, previene instancias duplicadas, maneja tabs nombradas, e inyecta guías de sitio automáticamente.

Ver `SKILL.md` para el reference completo de comandos.

## `teams.js`

Helper para enviar mensajes a Microsoft Teams web via keyboard automation. Útil para mensajes largos o multilinea donde tipear línea por línea manualmente es impráctico.

### Uso

```bash
# Mensaje corto (inline)
node scripts/teams.js send <chatId> "mensaje corto"

# Mensaje largo via stdin (heredoc)
node scripts/teams.js send <chatId> << 'EOF'
📊 Triage report

46 tickets · 27 overdue

[#1234](https://example.com/tickets/1234)
EOF

# Mensaje largo desde un archivo
cat /tmp/report.md | node scripts/teams.js send <chatId>
```

### chatId formats

| Tipo | Formato | Ejemplo |
|---|---|---|
| Personal notes | `48:notes` | `48:notes` |
| Meeting chat | `19:meeting_xxx@thread.v2` | `19:meeting_NDQ2Nz...@thread.v2` |
| 1:1 chat | `19:*@unq.gbl.spaces` | `19:8:orgid:xxx@unq.gbl.spaces` |
| Group chat | `19:*@thread.v2` | `19:xxx_yyy@thread.v2` |

### Markdown soportado

Teams web parsea Markdown en el compose box:

- `[#text](url)` → link clickeable con display text
- `**bold**`, `*italic*`, `~~strike~~`
- `- bullet`, `1. numbered`, `> quote`

Los tags HTML (`<a href>`) se tipean como texto literal. Usar Markdown.

### Requisitos

- `browser.js` en el mismo directorio (`scripts/browser.js`)
- Browser logueado en Teams (sesión persistente en `.browser-profile`)
- `playwright-cli` instalado (`npm install -g @playwright/cli@latest`)

### Cuándo usarlo

- Mensajes largos o multilinea (reportes, triage, resúmenes)
- Cuando se necesita enviar desde un archivo o heredoc

Para mensajes cortos de una línea, usar los comandos manuales de la guía (`sites/teams_com/guide.md`).
