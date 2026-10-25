---
name: discord-login
description: Discord web sign-in flow with mobile-app approval. Use when logging in to Discord via agent-browser in headed mode.
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

1. **Enter credentials.** Fill the email and password fields and submit the form. Prefer `exec snapshot -i` to get the field refs, then `exec fill "@eN" "<value>"`; submit via `exec press Enter` or `exec find role button "Iniciar sesión" click`.
2. **Handle 2FA if prompted.** Discord may ask for an authenticator code or a backup code. If so, stop and ask the user.
3. **Approve on the mobile app.** For some accounts, Discord sends an in-app approval prompt to the logged-in mobile client. The user must confirm the login from the Discord app.
4. **Login completes.** The browser loads the Discord main interface.

## Selectors

| Element | Selector |
|---|---|
| Email input | `input[name="email"]` or `input[placeholder*="Correo"]` |
| Password input | `input[name="password"]` or `input[type="password"]` |
| Submit button | `button[type="submit"]` or visible text "Iniciar sesión" |

Prefer `find`/`snapshot -i` over raw selectors; use these only as eval fallback (unverified after agent-browser migration):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec fill "input[name=email]" "<email>"
node .agents/skills/browser-automation/scripts/browser.js exec fill "input[name=password]" "<password>"
node .agents/skills/browser-automation/scripts/browser.js exec click "button[type=submit]"
```

## Verification

After login, the URL should no longer be `/login`. A safe check is to wait for the Discord main layout to appear.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!location.pathname.includes('/login')"
```

## Auth state persistence

There is no explicit state-save/state-load step: after a successful login the session persists automatically in `.browser-profile/`. On the next run just open the site; do not commit anything profile-related to git.

## Anti-patterns

- **Do not** ask the user for their Discord token to use a CLI client. Third-party clients and self-bots violate Discord's Terms of Service and can result in account bans.
- **Do not** turn off 2FA or ask the user to do so.
- **Do not** store `.browser-profile/` or any exported state in version control; keep it in `.gitignore`.

## Notes

- The mobile-app approval may appear instead of, or in addition to, a 2FA code.
- If the user does not receive the in-app prompt, the Discord mobile app may not be actively logged in. In that case, prefer an authenticator code or backup code.
- Discord UI text may vary by language; prefer stable `name` or `type` attributes.

**Validated:** 2026-08-19 against live `discord.com/login`.
