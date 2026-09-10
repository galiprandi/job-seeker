# Google Maps Web Automation Guide

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.google.com/maps"
```

Wait 3-5 seconds for the SPA to load.

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster and more reliable.

**Show all shortcuts:** `Ctrl+/` — opens the "Keyboard Shortcuts" dialog. **Note:** Press `Esc` first if the search box is focused, otherwise `Ctrl+/` may not respond.

### All app

| Shortcut | Action |
|---|---|
| `Ctrl+/` | Show keyboard shortcuts dialog |
| `Arrow keys` | Move map (up/down/left/right) |
| `Shift+Arrow` | Move map by one square (larger jump) |
| `+` | Zoom in |
| `-` | Zoom out |
| `Esc` | Close popup / dialog |
| `/` | Focus search box |
| `Ctrl+Shift+L` | Show my location |
| `Ctrl+Shift+H` | Get help |
| `Ctrl+Shift+F` | Send feedback |
| `Ctrl+Shift+E` | Share or embed map |

### Map

| Shortcut | Action |
|---|---|
| `.` | Show/hide menu |
| `,` | Show/hide side panel |
| `Ctrl+Shift+1` | Toggle satellite layer |
| `Ctrl+Shift+2` | Toggle traffic layer |
| `Ctrl+Shift+3` | Toggle transit layer |
| `Ctrl+Shift+4` | Toggle biking layer |
| `Ctrl+Shift+5` | Toggle terrain layer |
| `Ctrl+Shift+D` | Add destination (requires directions panel open) |

### Usage with playwright-cli

```bash
# Show keyboard shortcuts (press Esc first if search is focused)
node .agents/skills/browser-automation/scripts/browser.js exec press Escape
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Slash

# Focus search box
node .agents/skills/browser-automation/scripts/browser.js exec press "/"

# Move map
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowUp
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowDown
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowLeft
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowRight

# Zoom
node .agents/skills/browser-automation/scripts/browser.js exec press "+"
node .agents/skills/browser-automation/scripts/browser.js exec press "-"

# Show my location
node .agents/skills/browser-automation/scripts/browser.js exec press Ctrl+Shift+L

# Toggle traffic layer
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Shift+1
```

## Detecting modals

Google Maps uses `dialog` role for the shortcuts panel:

| Modal | Snapshot pattern |
|---|---|
| Keyboard shortcuts (`Ctrl+/`) | `dialog` > `heading "Keyboard Shortcuts"` |

```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot | grep "dialog"
```

## Verifying map position

The URL contains the current map center and zoom level:

```
https://www.google.com/maps/@<lat>,<lng>,<zoom>z
```

Extract with:

```javascript
(() => {
  const m = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+)z/);
  return m ? { lat: m[1], lng: m[2], zoom: m[3] } : 'no match';
})()
```

## Searching for a place

```bash
# 1. Focus search box
node .agents/skills/browser-automation/scripts/browser.js exec press "/"

# 2. Type the place
node .agents/skills/browser-automation/scripts/browser.js exec type "Obelisco Buenos Aires"

# 3. Press Enter to search
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

## Getting directions

```bash
# 1. Click "Cómo llegar" / "Directions" button
node .agents/skills/browser-automation/scripts/browser.js exec click "button[aria-label=\"Cómo llegar\"]"

# 2. Fill destination
node .agents/skills/browser-automation/scripts/browser.js exec click "input[aria-label=\"Elige un destino...\"]"
node .agents/skills/browser-automation/scripts/browser.js exec type "Obelisco Buenos Aires"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter

# 3. Add another destination (Ctrl+Shift+D requires directions panel open)
node .agents/skills/browser-automation/scripts/browser.js exec press Control+Shift+d
```

**URL pattern:** After opening directions, the URL changes to `/dir/<from>/<to>/@<lat>,<lng>,<zoom>z`.

## Gotchas

- **`Ctrl+/` requires `Esc` first** — if the search box is focused, `Ctrl+/` does nothing. Press `Esc` to blur, then `Ctrl+/`.
- **`Ctrl+Shift+D` (add destination) requires directions panel open** — it only works after clicking "Cómo llegar" and having at least one destination set.
- **Map must be focused for arrow keys** — focus the `[role="application"]` element before using arrow keys or zoom shortcuts.
- **URL changes with map movement** — the `@lat,lng,zoom` in the URL updates as you pan/zoom. Use this to verify movements.
- **`+` and `-` need the map focused** — if focus is elsewhere, they may not zoom.

## Anti-patterns

- **Don't** click zoom buttons when `+`/`-` keys work — prefer `press`
- **Don't** click the map to pan when arrow keys work — prefer `press ArrowUp/Down/Left/Right`
- **Don't** forget to press `Esc` before `Ctrl+/` if search is focused
- **Don't** assume `Ctrl+Shift+D` works without the directions panel open
