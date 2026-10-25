---
name: google-login
description: Google account sign-in flow with phone-number confirmation and device-notification approval. Use when automating Google login via agent-browser in headed mode.
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

**Interaction doctrine (semantic-first):** use `find` semantic locators; `snapshot -i` @eN refs as fallback; `eval` only as last resort.

1. **Enter email.** Fill the textbox labeled `Correo electrónico o teléfono` (EN: `Email or phone`) and click **Siguiente** (EN: **Next**).
2. **Choose an alternative if asked for a password.** If the next screen asks for a password and the user wants to avoid typing it, click **Probar otra manera** (EN: **Try another way**).
3. **Confirm a phone number.** Google may ask the user to confirm a phone number it already knows. The number is displayed masked. This step requires the user to confirm that the number is still valid.
4. **Approve on the phone.** Google sends a notification to the user's linked Android / iOS device. The user must tap **Sí, soy yo** or equivalent.
5. **Login completes.** After approval, the browser redirects to `myaccount.google.com` (or the originally requested service).

## Locators (Spanish UI — semantic via `find`)

```bash
# Email input (textbox labeled "Correo electrónico o teléfono")
node .agents/skills/browser-automation/scripts/browser.js exec find label "Correo electrónico o teléfono" fill "user@example.com"
# Next button
node .agents/skills/browser-automation/scripts/browser.js exec find text "Siguiente" click
# Try another way
node .agents/skills/browser-automation/scripts/browser.js exec find text "Probar otra manera" click
```

Fallback CSS selectors (for `eval` or `snapshot -i` inspection only):

| Element | Selector |
|---|---|
| Email input | `input[aria-label="Correo electrónico o teléfono"]` |
| Next button | `button` containing text `Siguiente` |
| Try another way | `button` containing text `Probar otra manera` |

## Verification

After step 5, the page title should become `Cuenta de Google` and the URL should contain `myaccount.google.com`.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => document.title.includes('Cuenta de Google'))()"
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
