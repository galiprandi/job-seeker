---
domains:
  - maps.google.com
---

# Google Maps Web Automation Guide

**Interaction doctrine (semantic-first):** 1) Maps keyboard shortcuts 2) `find` semantic locators 3) `snapshot -i` @eN refs 4) `eval` as last resort — and there is no `exec type`; typing into the focused element is `keyboard type`, filling a located element is `fill <sel|@eN>`.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://www.google.com/maps"
# or, with an active session: goto "https://www.google.com/maps"
```

Wait 3-5 seconds for the SPA to load (or `exec wait --fn "(() => !!document.querySelector('#searchboxinput'))()"`).

## Keyboard shortcuts (PREFERRED over UI clicks)

**Always prefer keyboard shortcuts over clicking buttons.** They are faster and more reliable.

**⚠️ Verified 2026-10-24:** `Control+Slash` does NOT open the shortcuts dialog on google.com/maps — it toggles the transit layer. The official table below is kept for reference but treat `Ctrl+/` as unreliable (unverified after agent-browser migration).

### All app

| Shortcut | Action |
|---|---|
| `Ctrl+/` | Show keyboard shortcuts dialog (⚠️ see note above — observed toggling transit layer instead) |
| `Arrow keys` | Move map (up/down/left/right) |
| `Shift+Arrow` | Move map by one square (larger jump) |
| `+` | Zoom in |
| `-` | Zoom out |
| `Esc` | Close popup / dialog |
| `/` | Focus search box (⚠️ leaves a literal `/` in the input — clear before typing) |
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

### Usage with agent-browser

```bash
# Focus search box via find (preferred over "/" which inserts a literal slash)
node .agents/skills/browser-automation/scripts/browser.js exec find placeholder "Search Google Maps" click

# Move map (map must be focused — click it or tab to [role=application] first)
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowUp
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowDown
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowLeft
node .agents/skills/browser-automation/scripts/browser.js exec press ArrowRight

# Zoom
node .agents/skills/browser-automation/scripts/browser.js exec press "+"
node .agents/skills/browser-automation/scripts/browser.js exec press "-"

# Show my location
node .agents/skills/browser-automation/scripts/browser.js exec press "Control+Shift+L"

# Toggle traffic layer
node .agents/skills/browser-automation/scripts/browser.js exec press "Control+Shift+2"
```

## Detecting modals

Google Maps uses the `dialog` role for panels like Keyboard Shortcuts:

| Modal | Snapshot pattern |
|---|---|
| Keyboard shortcuts | `dialog` > `heading "Keyboard Shortcuts"` |

```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i | grep "dialog"
```

## Verifying map position

The URL contains the current map center and zoom level:

```
https://www.google.com/maps/@<lat>,<lng>,<zoom>z
```

Extract with (eval must be an IIFE):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const m = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+)z/);
  return m ? { lat: m[1], lng: m[2], zoom: m[3] } : 'no match';
})()"
```

## Searching for a place

```bash
# 1. Focus + fill the search box semantically
node .agents/skills/browser-automation/scripts/browser.js exec find placeholder "Search Google Maps" fill "Obelisco Buenos Aires"

# 2. Press Enter to search
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

`fill` is native and does not need a ref: a CSS selector works too (`fill "#searchboxinput" "..."`), but prefer the semantic locator. If you focused the box with `press "/"` instead, clear the literal `/` first (`press "Control+a"` then `keyboard type`).

## Getting directions

```bash
# 1. Click "Cómo llegar" / "Directions" button
node .agents/skills/browser-automation/scripts/browser.js exec find label "Directions" click   # ES: "Cómo llegar"

# 2. Fill destination (snapshot -i → @eN ref, or find placeholder)
node .agents/skills/browser-automation/scripts/browser.js exec find placeholder "Choose destination" fill "Obelisco Buenos Aires"   # ES: "Elige un destino..."
node .agents/skills/browser-automation/scripts/browser.js exec press Enter

# 3. Add another destination (requires directions panel open)
node .agents/skills/browser-automation/scripts/browser.js exec press "Control+Shift+D"
```

**URL pattern:** After opening directions, the URL changes to `/dir/<from>/<to>/@<lat>,<lng>,<zoom>z`. (unverified after agent-browser migration — URL patterns unchanged, click locators should be re-verified)

## Gotchas

- **`/` leaves a literal `/` in the search input** — prefer `find placeholder ... fill`, or clear with `press "Control+a"` before `keyboard type`.
- **`Control+Slash` does not open the shortcuts panel** on google.com/maps (observed toggling the transit layer).
- **`Ctrl+Shift+D` (add destination) requires directions panel open** — it only works after opening directions and having at least one destination set.
- **Map must be focused for arrow keys** — focus the `[role="application"]` element before using arrow keys or zoom shortcuts.
- **URL changes with map movement** — the `@lat,lng,zoom` in the URL updates as you pan/zoom. Use this to verify movements.
- **`+` and `-` need the map focused** — if focus is elsewhere, they may not zoom.
- **Eval must be an IIFE** `(()=>{...})()` — bare `async () => {...}` does not run.

## Anti-patterns

- **Don't** click zoom buttons when `+`/`-` keys work — prefer `press`
- **Don't** click the map to pan when arrow keys work — prefer `press ArrowUp/Down/Left/Right`
- **Don't** use `exec type` — it does not exist; use `fill` or `keyboard type`
- **Don't** assume `Ctrl+Shift+D` works without the directions panel open
