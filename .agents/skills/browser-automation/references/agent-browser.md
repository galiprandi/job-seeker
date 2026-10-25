# agent-browser Command Reference

*Validated against agent-browser 0.39.x (Vercel CLI). Run `agent-browser --help` or `agent-browser skills get core --full` for the version-matched reference.*

Always invoke through the wrapper:

```bash
node .agents/skills/browser-automation/scripts/browser.js <wrapper-cmd>
node .agents/skills/browser-automation/scripts/browser.js exec <agent-browser-cmd> [args...]
```

`exec` forwards args to `agent-browser` unchanged. Everything below that is not a wrapper command goes through `exec`.

## Command hierarchy (semantic first)

Pick the first level that can do the job:

1. **App/site keyboard shortcuts** — `press <key>`, `keyboard type <text>`
2. **Semantic locators** — `find role|text|label|placeholder <value> <action>`
3. **Snapshot refs** — `snapshot -i` then `click @eN` / `fill @eN`
4. **eval / raw JS** — last resort only

## Core commands

| Command | Args | Description |
|---|---|---|
| `open` | `<url>` | Launch browser and navigate (wrapper: adds blocklist + guide) |
| `navigate` | `<url>` | Navigate active tab to URL (wrapper `goto` maps here) |
| `read` | `[url]` | Agent-readable page text (or fetch a URL without navigating) |
| `snapshot` | `[-i] [-s <sel>]` | Accessibility tree with `@eN` refs; `-i` = interactive only |
| `find` | `<locator> <value> [action] [text]` | Semantic find + act: `find text "Send" click` |
| `click` | `<sel|@ref>` | Click element |
| `fill` | `<sel|@ref> <text>` | Clear and fill input |
| `type` | `<sel> <text>` | Type into a specific element |
| `keyboard type` | `<text>` | Real keystrokes into the focused element (no selector) |
| `press` | `<key>` | Key or chord: `Enter`, `Tab`, `Escape`, `Control+a`, `Meta+Enter`, `Control+Shift+s` |
| `wait` | `<sel|ms>` | Wait for selector or milliseconds |
| `wait --fn` | `<js>` | Wait until a JS expression is truthy (active polling) |
| `wait --text` | `<text>` | Wait for text to appear on the page |
| `eval` | `<js>` | Run JavaScript in page context |
| `batch` | `["cmd1","cmd2",...]` or `--json` via stdin | Run commands sequentially in one call |

Key names use `+` chords: `Control`, `Alt`, `Shift`, `Meta` (e.g. `Control+x`, `Meta+Enter`). NOT `Ctrl`, `Cmd`, or `ControlOrMeta`.

`type` vs `fill` vs `keyboard type`: `fill <sel>` clears then sets (best for inputs); `type <sel>` types into a named element; `keyboard type` sends real keystrokes to whatever has focus (best for rich editors, chat boxes, contenteditable).

## More commands

| Group | Commands |
|---|---|
| Elements | `dblclick`, `hover`, `focus`, `check`, `uncheck`, `select <sel> <val>`, `drag`, `upload <sel> <files>`, `download` |
| Navigation | `back`, `forward`, `reload`, `pushstate <url>` (SPA nav) |
| Get info | `get text|html|value|attr|title|url|count|box|styles` |
| State checks | `is visible|enabled|checked <sel>` |
| Scroll/mouse | `scroll <dir> [px]`, `scrollintoview <sel>`, `mouse move|down|up|wheel` |
| Capture | `screenshot [path]`, `pdf <path>`, `highlight <sel>` |
| Tabs | `tab [new|list|close|<id>]`; `tab new --label <name>` for named tabs |
| Network | `network requests [--filter <pat>]`, `network route|unroute`, `network har start|stop` |
| Console | `console [--clear]`, `errors [--clear]` |
| Storage | `cookies get|set|clear`, `storage local|session` |
| State | `state save <path>`, `state load <path>` (wrapper: `save-state`/`load-state`) |
| Sessions | `session`, `session list`, `session info` |
| Setup | `install`, `upgrade`, `doctor`, `profiles` |

## Sessions, namespaces, profiles

- **Namespace** (`AGENT_BROWSER_NAMESPACE` or `namespace` in `agent-browser.json`) isolates the daemon socket per repo. The wrapper sets it to the repo name automatically; `agent-browser.json` is created on first run. Never share a namespace across repos.
- **Session** (`--session <name>` or `AGENT_BROWSER_SESSION`) is an isolated browser instance inside a namespace: separate cookies, storage, tabs. Default session is `default`. Parallel agents each get their own session name.
- **Profile** (`AGENT_BROWSER_PROFILE` or `profile` in `agent-browser.json`) is the persistent Chrome profile dir. The wrapper forces `.browser-profile/` in the repo root. Cookies and logins persist across restarts.
- **Tabs** are named via `tab new --label <name>` (wrapper: `tab-new <url> --name <name>`); labels are accepted everywhere a tab ref works. `--pin-tab` makes commands fail instead of falling back when the bound tab closes.

## Verify before send

Before any irreversible action (send message, submit form, post, delete): snapshot or `get text` the compose area, confirm the recipient, the account identity, and the full body content. Only then `press Enter` / click send. Never send on assumption.
