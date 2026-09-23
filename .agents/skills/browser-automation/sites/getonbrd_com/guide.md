---
name: getonbrd
description: Automate Get on Board (getonbrd.com) — LATAM tech job board. Covers magic-link email login, the multi-step application wizard, and the critical "POR ENVIAR" draft-state gotcha.
verified: 2026-09-23
---

# Get on Board Automation

LATAM tech job board. Job listings, applications, and profile management. Prerequisite: read the parent `SKILL.md` for golden rules and the browser wrapper.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://www.getonbrd.com" --headed
```

## Keyboard shortcuts

None observed. Get on Board has no documented app-level keyboard shortcuts (validated 2026-09-23).

## Login — magic link via email (validated 2026-09-23)

LinkedIn/Google OAuth buttons may redirect to the provider's own login page even when the provider session is active in the same browser profile. The reliable path is the email magic link:

1. Click "Ingresa" → "Ingresa con tu email"
2. Type the account email into the modal's `input[type=email]`, click "Continuar"
3. Fetch the "Sign in to Get on Board" email in Gmail (search `from:getonbrd`)
4. The message body contains the real URL in plain text: `https://www.getonbrd.com/auth/callback?operation=login&token=<token>` — the button hrefs are wrapped in an awstrack.me redirect; extract the **callback link containing `auth%2Fcallback`** (other tracked links point to the homepage and do not log in), URL-decode it, or grab the plain callback URL from the message body text
5. Navigate directly to the decoded callback URL — it logs in AND redirects back to the referrer page (e.g. the job posting)

## Core flows

### Search jobs

```
URL: https://www.getonbrd.com/empleos/<category>?q=<keywords>&remote=true
```

Job cards render as `a[href*="/empleos/"]` with title, company, location, and salary in `innerText`.

### Apply — wizard + separate send

The apply wizard has multiple steps (Experiencia → Información básica → profile fields → Vista previa). All `input[type=submit]` elements are "Siguiente" navigation buttons.

**CRITICAL GOTCHA:** finishing the wizard does NOT send the application. It lands on `applications?job_application_preview=true#<id>` showing a preview modal with status **POR ENVIAR** ("Aún no ha sido enviada"). The real send is a separate CTA:

- `button "Enviar postulación ahora"` — located in the right aside AND in a banner above "Mis habilidades" inside the preview modal
- It is a plain `<button>` (not a form submit). Find it via snapshot by accessible name
- **Verification:** after clicking, the applications list (`/misempleos` → "Tus postulaciones") must show the job with status `ENVIADA` and today's date. Do not report success on the preview alone

### Application fields

- Experience bio: rich text editor, pre-filled from profile. Many postings require English ("Requiere postular en Inglés") — keep the bio in English
- CV: pre-selected from previously uploaded CVs
- `job_application[expected_salary]` — number, USD/month gross
- `job_application[reason_to_apply]` — textarea, 50–1000 chars, "¿Por qué te interesa trabajar en X?"
- Some steps ask English level and profile fields

### React-controlled inputs

Use the native setter pattern: `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el, v)` + `input`/`change` events. Plain `el.value =` does not register.

## Anti-patterns

- **Do not assume the wizard's last "Siguiente" submits** — it only opens the preview. The application stays in `POR ENVIAR` until "Enviar postulación ahora" is clicked
- **Do not use the first awstrack link in the login email** — it points to the homepage, not the auth callback. The callback link contains `auth%2Fcallback` in its encoded path
- **Do not click "Editar postulación" to submit** — it re-enters the wizard loop. The send CTA lives only in the preview modal/page
