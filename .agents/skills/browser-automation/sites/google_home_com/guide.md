---
name: google-home
description: Control Google Home smart devices via home.google.com — view device states by room, toggle on/off, scenes, automations. Use when asked to control home domotics, lights, switches, TVs, speakers. Part of the browser-automation skill.
domains:
  - home.google.com
---

# Google Home — home.google.com

Web control for all Google Home-registered devices (lights, switches, TVs, speakers, cameras). **Covers devices that are physically powered off** — unlike local network discovery, the dashboard lists every registered device with last-known state.

## Access

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://home.google.com" --headed
```

- Requires a Google session in `.browser-profile`.
- First visit may ask for identity re-verification — user completes it headed. Never enter passwords.
- If the page shows "Se ha producido un error": click the **Reintentar** button (ref from snapshot). If it persists, report to the user.

## Layout (verified 2026-10-26)

- Top nav: `videocam Cámaras` | `devices_other Dispositivos` | `auto_awesome Automatiz.`
- The **Dispositivos** tab lists devices grouped by room (`meeting_room <Room>` headers).
- Each device is a tile: icon + name + state line:
  - `Encendido • 15%` — on with brightness
  - `Apagada` — off
  - `Sin conexión` — unreachable (physically off or offline)
  - `Cargando` — state still hydrating; wait before trusting it
- Icons: `lightbulb` (light), `switch` (switch), `tv` (TV/cast), `light_group` (room light group), `videocam` (camera).

## Control

- **Toggle on/off**: click the device tile (snapshot → ref → `exec click @eN`).
- **Details**: opening a tile expands controls (brightness slider, color, volume).
- **No keyboard shortcuts** verified; interaction is tile clicks.

## Gotchas

- States load lazily — always `wait --fn` or sleep 3-5s before reading statuses.
- Tile names are the user's custom names, localized UI (ES here).
- Group tiles (`light_group`) control the whole room's lights.
- `Sin conexión` ≠ off — the device is unreachable; toggling won't work until powered.
