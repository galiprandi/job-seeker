# playwright-cli Full Command Reference

*Validated against @playwright/cli 0.1.17 (Aug 2026)*

## Core

| Command | Args | Description |
|---|---|---|
| `open` | `[url]` | Open browser (headless by default) |
| `attach` | `[name]` | Attach to running browser (new session) |
| `close` | | Close browser |
| `detach` | | Detach from attached browser |
| `goto` | `<url>` | Navigate to URL |
| `type` | `<text>` | Type into focused element |
| `click` | `<ref> [button]` | Click element |
| `dblclick` | `<ref> [button]` | Double-click element |
| `fill` | `<ref> <text>` | Fill input (replaces content) |
| `drag` | `<startRef> <endRef>` | Drag and drop |
| `drop` | `<ref>` | Drop files/data onto element |
| `hover` | `<ref>` | Hover over element |
| `select` | `<ref> <value>` | Select dropdown option |
| `upload` | `<file>` | Upload file to chooser |
| `check` | `<ref>` | Check checkbox/radio |
| `uncheck` | `<ref>` | Uncheck checkbox |
| `snapshot` | `[ref]` | Capture page structure with refs |
| `find` | `[text]` | Search snapshot for text/regex |
| `eval` | `<func> [ref]` | Evaluate JS in page context |
| `dialog-accept` | `[prompt]` | Accept dialog |
| `dialog-dismiss` | | Dismiss dialog |
| `resize` | `<w> <h>` | Resize browser window |
| `delete-data` | | Delete session data |

## Navigation

| Command | Description |
|---|---|
| `go-back` | Browser back |
| `go-forward` | Browser forward |
| `reload` | Reload page |

## Keyboard

| Command | Args | Description |
|---|---|---|
| `press` | `<key>` | Press key (`Enter`, `Tab`, `Escape`, `ArrowDown`, etc.) |
| `keydown` | `<key>` | Press key down |
| `keyup` | `<key>` | Release key |

## Mouse

| Command | Args | Description |
|---|---|---|
| `mousemove` | `<x> <y>` | Move mouse to position |
| `mousedown` | `[button]` | Press mouse button |
| `mouseup` | `[button]` | Release mouse button |
| `mousewheel` | `<dx> <dy>` | Scroll mouse wheel |

## Save as

| Command | Args | Description |
|---|---|---|
| `screenshot` | `[ref]` | Screenshot page or element |
| `pdf` | | Save page as PDF |

## Tabs

| Command | Args | Description |
|---|---|---|
| `tab-list` | | List all tabs |
| `tab-new` | `[url]` | Create new tab |
| `tab-select` | `<index>` | Switch to tab by index |
| `tab-close` | `[index]` | Close tab |

## Storage

| Command | Args | Description |
|---|---|---|
| `state-load` | `<filename>` | Load auth state from file |
| `state-save` | `[filename]` | Save auth state to file |
| `cookie-list` | | List all cookies |
| `cookie-get` | `<name>` | Get cookie by name |
| `cookie-set` | `<name> <value>` | Set cookie |
| `cookie-delete` | `<name>` | Delete cookie |
| `cookie-clear` | | Clear all cookies |
| `localstorage-list` | | List localStorage |
| `localstorage-get` | `<key>` | Get localStorage item |
| `localstorage-set` | `<key> <value>` | Set localStorage item |
| `localstorage-delete` | `<key>` | Delete localStorage item |
| `localstorage-clear` | | Clear localStorage |
| `sessionstorage-list` | | List sessionStorage |
| `sessionstorage-get` | `<key>` | Get sessionStorage item |
| `sessionstorage-set` | `<key> <value>` | Set sessionStorage item |
| `sessionstorage-delete` | `<key>` | Delete sessionStorage item |
| `sessionstorage-clear` | | Clear sessionStorage |

## Network

| Command | Args | Description |
|---|---|---|
| `requests` | | List network requests |
| `request` | `<index>` | Full request details |
| `request-headers` | `<index>` | Request headers only |
| `request-body` | `<index>` | Request body only |
| `response-headers` | `<index>` | Response headers only |
| `response-body` | `<index>` | Response body |
| `route` | `<pattern>` | Mock requests matching pattern |
| `route-list` | | List active routes |
| `unroute` | `[pattern]` | Remove routes |
| `network-state-set` | `<state>` | Set network online/offline |

## DevTools

| Command | Args | Description |
|---|---|---|
| `console` | `[min-level]` | List console messages |
| `run-code` | `[code]` | Run playwright code snippet |
| `tracing-start` | | Start trace recording |
| `tracing-stop` | | Stop trace recording |
| `video-start` | `[filename]` | Start video recording |
| `video-stop` | | Stop video recording |
| `video-chapter` | `<title>` | Add chapter marker |
| `video-show-actions` | | Annotate actions on page |
| `video-hide-actions` | | Stop annotating |
| `show` | | Open playwright dashboard |
| `pause-at` | `<location>` | Pause at location |
| `resume` | | Resume execution |
| `step-over` | | Step over next call |
| `generate-locator` | `<ref>` | Generate locator for element |
| `highlight` | `[ref]` | Highlight element |

## Install

| Command | Args | Description |
|---|---|---|
| `install` | | Initialize workspace |
| `install-browser` | `[browser]` | Install browser |

## Sessions

| Command | Description |
|---|---|
| `list` | List browser sessions |
| `close-all` | Close all sessions |
| `kill-all` | Force kill all sessions |

## Global options

| Flag | Description |
|---|---|
| `-s=<session>` | Specify session name |
| `--help [command]` | Print help |
| `--json` | Output as JSON |
| `--raw` | Output only result value |
| `--version` | Print version |

## open options

| Flag | Description |
|---|---|
| `--browser` | Browser: chrome, firefox, webkit, msedge |
| `--config` | Config file path (default: .playwright/cli.config.json) |
| `--device` | Emulate device (e.g. "iphone 15") |
| `--headed` | Run in headed mode |
| `--mobile` | Emulate generic mobile device |
| `--persistent` | Use persistent browser profile |
| `--profile` | Path to persistent user data directory |
