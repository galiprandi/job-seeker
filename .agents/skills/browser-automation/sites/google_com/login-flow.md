---
name: google-login
description: Google account sign-in flow with phone-number confirmation and device-notification approval. Use when automating Google login via playwright-cli in headed mode.
---

# Google Account Login Flow

Guide for completing Google sign-in when an existing browser session is not available. Validated against `accounts.google.com` Spanish UI.

## Prerequisite

Read the main Browser Automation `SKILL.md` for profile setup and the safe wrapper. This flow requires **headed mode** because it involves a human-in-the-loop device notification.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://accounts.google.com" --headed
```

## Flow

1. **Enter email.** Fill the textbox labeled `Correo electrónico o teléfono` and click **Siguiente**.
2. **Choose an alternative if asked for a password.** If the next screen asks for a password and the user wants to avoid typing it, click **Probar otra manera**.
3. **Confirm a phone number.** Google may ask the user to confirm a phone number it already knows. The number is displayed masked. This step requires the user to confirm that the number is still valid.
4. **Approve on the phone.** Google sends a notification to the user's linked Android / iOS device. The user must tap **Sí, soy yo** or equivalent.
5. **Login completes.** After approval, the browser redirects to `myaccount.google.com` (or the originally requested service).

## Selectors (Spanish UI)

| Element | Selector |
|---|---|
| Email input | `input[aria-label="Correo electrónico o teléfono"]` or `textbox "Correo electrónico o teléfono"` |
| Next button | `button:has-text("Siguiente")` |
| Try another way | `button:has-text("Probar otra manera")` |

## Verification

After step 5, the page title should become `Cuenta de Google` and the URL should contain `myaccount.google.com`.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "() => document.title.includes('Cuenta de Google')"
```

## Anti-patterns

- **Do not** attempt to type the user's password for them. This flow is designed for human-in-the-loop approval.
- **Do not** fill the masked phone number from memory; the user must confirm it.
- **Do not** reuse an old storage state without first checking whether the session is still valid, because Google may force re-verification.

## Notes

- The exact wording and available options depend on the user's 2FA configuration.
- If the device does not receive the notification, the user can request a fallback such as SMS.
- The email typed by the agent should be the one the user explicitly provided.

**Validated:** 2026-08-19 against live `accounts.google.com`.
