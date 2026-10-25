---
name: buk
description: Buk HR/recruiting ATS application forms (buk.co). Fill + submit candidate applications.
domains:
  - buk.co
  - app.buk.co
---

# Buk ATS — validated 2026-10-22 (unverified after agent-browser migration)

Prerequisite: read parent `SKILL.md` for golden rules and the browser wrapper.

**Interaction doctrine (semantic-first):** 1) `find` semantic locators 2) `snapshot -i` @eN refs 3) `eval` last resort. All commands via `node .agents/skills/browser-automation/scripts/browser.js exec <cmd>`.

## Flow

1. Job landing page: `exec find label "email" fill "<email>"` (or `snapshot -i` → `fill @eN`), check the privacy checkbox (`find role "checkbox" click` — verify the target first), then `exec find text "Postular" click`.
2. Survey form opens: textbox fields (Nombre, Apellido, ID document, Fecha de Nacimiento, Celular, Ciudad, LinkedIn) + file input for CV + consent checkboxes.
3. Fill each field via `exec find label "<field>" fill "<value>"` or `fill @eN` from a `snapshot -i`. Upload CV: locate `input[type=file]` in the snapshot, then `exec upload @eN "<cv-path>"`.
4. `exec find text "Enviar Respuesta" click`. Verify: `exec wait --text "gracias"` or read the page for submitted/thanks text.

## Gotchas

- Email+checkbox+Postular: button stays `disabled` until the checkbox registers — verify with `exec is enabled` before clicking.
- `Identification Number` = required national ID — never invent; pull from user data.
- Form survives session resets (fields persist by email) — safe to resume.
