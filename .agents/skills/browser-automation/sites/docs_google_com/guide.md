---
name: docs-google
description: Automate Google Docs and Google Sheets (docs.google.com) with playwright-cli. Covers keyboard shortcuts for Sheets (cell selection, formatting, navigation, menus, rows/columns), Docs editing basics, and the tool finder. Use when editing spreadsheets or documents, filling cells, formatting, or extracting data from Google Editors. Part of the browser-automation skill.
verified: 2026-09-26
source: https://support.google.com/docs/answer/181110
---

# Google Docs / Sheets Automation

Automate Google Editors via `playwright-cli`. Docs lives at `docs.google.com/document/...`, Sheets at `docs.google.com/spreadsheets/...` — same host, same guide.

## Keyboard shortcuts (PREFERRED over UI clicks)

Unlike Gmail, **Google Editors keyboard shortcuts are enabled by default** — no settings toggle needed. `Ctrl+/` (or `Cmd+/` on Mac) opens the full shortcuts dialog in-app.

**Buscador de herramientas / Tool finder:** `Alt+/` (Windows) / `Option+/` (Mac) — the fastest way to reach ANY menu action: press it, type the action name, `Enter`. Prefer this when a dedicated shortcut doesn't exist.

**Menus (Chrome):** `Alt+<letter>` opens a menu — `Alt+f` File, `Alt+e` Edit, `Alt+v` View, `Alt+i` Insert, `Alt+o` Format, `Alt+d` Data, `Alt+t` Tools, `Alt+h` Help. Then arrow-key or type the underlined letter.

## Google Sheets — common actions (PC)

| Shortcut | Action |
|---|---|
| `Ctrl+/` | Show shortcuts dialog |
| `Ctrl+f` / `Ctrl+h` | Find / Find and replace |
| `Ctrl+z` / `Ctrl+y` | Undo / Redo |
| `Ctrl+c` `Ctrl+x` `Ctrl+v` | Copy / Cut / Paste |
| `Ctrl+Shift+v` | Paste values only |
| `Ctrl+d` / `Ctrl+r` | Fill down / Fill right |
| `Ctrl+Enter` | Fill range with value |
| `Shift+F11` | Insert new sheet |
| `Ctrl+Alt+T` | Convert range to table |
| `Ctrl+Space` / `Shift+Space` | Select column / Select row |
| `Ctrl+a` or `Ctrl+Shift+Space` | Select all |

## Sheets — cell formatting

| Shortcut | Action |
|---|---|
| `Ctrl+b` / `Ctrl+i` / `Ctrl+u` | Bold / Italic / Underline |
| `Alt+Shift+5` | Strikethrough |
| `Ctrl+Shift+e` `l` `r` | Center / Left / Right align |
| `Ctrl+k` | Insert link |
| `Ctrl+;` / `Ctrl+Shift+;` | Insert date / time |
| `Ctrl+\` | Clear formatting |
| `Ctrl+Shift+1..6` | Decimal / Time / Date / Currency / Percent / Exponent format |

## Sheets — navigation

| Shortcut | Action |
|---|---|
| `Home` / `End` | Start / end of row |
| `Ctrl+Home` / `Ctrl+End` | Start / end of sheet |
| `Ctrl+Backspace` | Scroll to active cell |
| `Alt+ArrowDown` / `Alt+ArrowUp` | Next / previous sheet tab |
| `Alt+Shift+k` | List all sheets |
| `Alt+Enter` | Open hyperlink |
| `Ctrl+Alt+.` / `Ctrl+Alt+,` | Move to side panel |

## Sheets — rows, columns, comments

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+=` then `r`/`c` | Insert row/column (Chrome: `Alt+i` `r`/`c` then letter) |
| `Ctrl+Alt+-` | Delete selected rows/columns |
| `Shift+F2` | Insert/edit note |
| `Ctrl+Alt+m` | Insert/edit comment |
| `Ctrl+Shift+\` | Context menu |
| `Ctrl+Alt+Shift+m` | Move focus out of spreadsheet (escape to page) |

## Google Docs — essentials (PC)

Docs shares the same editing shortcuts: `Ctrl+b/i/u`, `Ctrl+k` (link), `Ctrl+f` (find), `Ctrl+h` (find & replace), `Ctrl+z/y`, `Ctrl+Alt+m` (comment). Navigation: `Ctrl+Home`/`Ctrl+End` start/end of doc, `Ctrl+Alt+Shift+h` heading navigation via tool finder. Full list: `Ctrl+/` inside the doc, or support.google.com/docs/answer/179738.

## Gotchas

- **Focus:** shortcuts only work when the editor grid/canvas has focus. If the agent just clicked a menu or the formula bar, `press Escape` or click a cell first.
- **Auto-save:** everything saves automatically to Drive — there is no save step; don't wait for one.
- **`Alt+/` tool finder > menus:** menu mnemonics vary by locale (Spanish UI changes underlined letters). The tool finder accepts typed action names in the UI language — more stable than `Alt+<letter>` sequences.
- **Two-key shortcuts:** like Gmail, send sequences (e.g. `Alt+i` then `r`) as ONE `exec press "Alt+i"` followed quickly — or use `batch` to guarantee latency: `[["press","Alt+i"],["press","r"]]`.
- **Reading data:** for extracting cell values, `eval` on the DOM is unreliable (canvas-rendered grid). Prefer copy range + read clipboard, or File → Download via tool finder.
- **Spanish locale:** some date/time shortcuts differ (`Ctrl+Shift+d` date, `Ctrl+Shift+h` time in ES/DE/IT/PT).

## Sheets — cell navigation & bulk editing (validated 2026-10-04)

- **`#t-name-box`** (the input at top-left, "Cuadro de nombre") — jump to any cell or range by reference: `exec fill` it with `A2` or `E2:E12`, then `Enter`. Far more reliable than clicking cells in the canvas. Works in any sheet tab.
- **TSV paste via clipboard**: write a tab/newline-separated block to the clipboard (`page.evaluate` + `navigator.clipboard.writeText`), click the anchor cell, `Ctrl+V` — fills multi-row/multi-column ranges in one shot. More robust than typing cell by cell.
- **`u$s` prefix bug**: typing or pasting `u$s 123,45` makes Sheets parse it as currency and store `u 123,45` (eats `$s`). If the column's number format already prefixes `u$s`, write only the number. Same for any custom prefix — never type the prefix itself.
- **Clone formatting + value**: `Ctrl+C` a healthy cell, `Ctrl+V` on a corrupted one — restores format and content; then just retype the value. Useful when a cell's format got mangled by a bad paste.
- **Read a cell's formula**: select the cell via `#t-name-box`, then read `.cell-input` (the formula bar element) — the DOM grid does not expose formulas.

## Sheets — formulas & locale (validated 2026-10-04)

- **es_AR locale**: argument separator is `;` (comma is the decimal separator). Spanish function names (`SI`, `TIR.NO.PER`, `HOY`) work; mixing English names with `,` separators produces `#ERROR`/`#REF`. Use `;` always.
- **`XIRR`/`TIR.NO.PER` does not accept array literals `{}` or cross-sheet ranges** in some workbooks (returns `#ERROR`/`#REF`). Workaround: helper columns in the source tab (negated flows + dates), then reference a single cell (`=Tab!I1`) from the summary sheet.
- **Spill ranges** (`FILTER`/`ARRAYFORMULA`): a manually written cell inside the spill range breaks the whole array (`#REF!`). Never write under/beside a spill formula that will occupy that space.

## Sheets — programmatic read

- **CSV export** (fastest full read): `exec eval` with `(async () => (await fetch('https://docs.google.com/spreadsheets/d/{doc}/export?format=csv&gid={gid}', {credentials:'include'})).text())()` — runs in the page context so it uses the browser session's cookies, no DOM scraping. Get `doc`/`gid` from the tab's URL. Export can lag ~2s behind edits — wait before verifying.

