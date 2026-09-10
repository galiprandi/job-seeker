---
name: discord-login
description: Discord web sign-in flow with mobile-app approval. Use when logging in to Discord via playwright-cli in headed mode.
---

# Discord Web Login Flow

Guide for logging in to Discord through the web client when a stored session is not available. Validated against `discord.com/login`.

## Prerequisite

Read the main Browser Automation `SKILL.md` for profile setup and the safe wrapper. This flow requires **headed mode** because it may require a human-in-the-loop approval step on the user's mobile device.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://discord.com/login" --headed
```

## Flow

1. **Enter credentials.** Fill the email and password fields and submit the form.
2. **Handle 2FA if prompted.** Discord may ask for an authenticator code or a backup code. If so, stop and ask the user.
3. **Approve on the mobile app.** For some accounts, Discord sends an in-app approval prompt to the logged-in mobile client. The user must confirm the login from the Discord app.
4. **Login completes.** The browser loads the Discord main interface.

## Selectors

| Element | Selector |
|---|---|
| Email input | `input[name="email"]` or `input[placeholder*="Correo"]` |
| Password input | `input[name="password"]` or `input[type="password"]` |
| Submit button | `button[type="submit"]` or `button:has-text("Iniciar sesión")` |

## Verification

After login, the URL should no longer be `/login`. A safe check is to wait for the Discord main layout to appear.

```bash
playwright-cli eval "() => !location.pathname.includes('/login')"
```

## Auth state persistence

After a successful login, save the storage state for headless reuse:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec state-save discord-state.json
```

On the next run, load the state:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec state-load discord-state.json
```

## Anti-patterns

- **Do not** ask the user for their Discord token to use a CLI client. Third-party clients and self-bots violate Discord's Terms of Service and can result in account bans.
- **Do not** turn off 2FA or ask the user to do so.
- **Do not** store `discord-state.json` in version control; add it to `.gitignore`.

## Notes

- The mobile-app approval may appear instead of, or in addition to, a 2FA code.
- If the user does not receive the in-app prompt, the Discord mobile app may not be actively logged in. In that case, prefer an authenticator code or backup code.
- Discord UI text may vary by language; prefer stable `name` or `type` attributes.

**Validated:** 2026-08-19 against live `discord.com/login`.
