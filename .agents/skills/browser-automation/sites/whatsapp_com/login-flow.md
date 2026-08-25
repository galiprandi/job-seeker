---
name: whatsapp-web-login
description: WhatsApp Web sign-in using QR scan or phone-pairing code. Use when opening WhatsApp Web via playwright-cli in headed mode.
---

# WhatsApp Web Login Flow

Guide for linking WhatsApp Web to an existing phone. Validated against `web.whatsapp.com`.

## Prerequisite

Read the main Browser Automation `SKILL.md` for profile setup and the safe wrapper. This flow requires **headed mode** because it needs a human to either scan a QR code or enter a linking code on the phone.

## Setup

```bash
node scripts/browser.js open "https://web.whatsapp.com" --headed
```

## Flow

1. **Open WhatsApp Web.** The page loads a QR code and offers an alternative linking method.
2. **Choose the phone-code method (optional).** On the WhatsApp Web page, next to the QR code, there is an option to link with a numeric code. Click it.
3. **Enter the code on the phone.** In the WhatsApp mobile app, go to **Dispositivos vinculados** (or **WhatsApp Web / Escritorio**) and choose to link a new device with a code.
4. **Type the code.** The web page displays an 8-digit (or longer) numeric code. Enter it on the phone when prompted.
5. **Connection completes.** The browser loads the WhatsApp Web chat list.

## Selector notes

WhatsApp Web renders its UI with React and dynamic class names. Prefer semantic attributes and text:

| Element | Selector |
|---|---|
| QR region | `div[data-testid="qr-code"]` (if available) or `canvas` near the text `Usa WhatsApp en tu computadora` |
| Link with code button | `button:has-text("Vincular con código")` or text `Conectar con número` |

## Verification

After linking, wait for the main chat list. A safe check is to look for the search box or the chat list header.

```bash
playwright-cli eval "() => document.querySelector('[data-testid=\"chat-list\"]') !== null"
```

## Auth state persistence

After a successful link, save the storage state for later headless reuse:

```bash
node scripts/browser.js exec state-save whatsapp-state.json
```

Load it next time:

```bash
node scripts/browser.js exec state-load whatsapp-state.json
```

## Anti-patterns

- **Do not** ask the user to share their WhatsApp account token or seed.
- **Do not** try to decode the QR code image and send it elsewhere; the QR is for the current browser session only.
- **Do not** store `whatsapp-state.json` in version control; add it to `.gitignore`.

## Notes

- The phone must remain online. If the phone loses connection, WhatsApp Web may log out.
- Linking with a code is simpler than scanning the QR when the user is already using a phone and cannot easily point the camera at the screen.
- The exact wording of the button may vary with language and WhatsApp Web updates; look for a text link near the QR code.

**Validated:** 2026-08-19 against live `web.whatsapp.com`.
