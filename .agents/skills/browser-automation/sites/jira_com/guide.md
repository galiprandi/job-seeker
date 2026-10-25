---
name: jira
description: Automate Jira via browser UI for issue creation, form filling, navigation, and transitions.
verified: 2026-09-02
domains:
  - jira.com
  - atlassian.net
---

# Jira Automation

Automate Jira via browser UI for issue creation, form filling, and navigation. Jira's web UI is the primary interface; there is no simple internal API accessible from the browser (unlike LinkedIn or Teams).

**Semantic-first on Jira:** keyboard shortcuts are the most reliable layer (Jira has a rich global hotkey map). Then `exec find`, then `exec snapshot -i` refs, then `exec eval` only with exact selectors.

## Keyboard shortcuts

**Validated 2026-08-23 against Jira Cloud (cencosud.atlassian.net).** All shortcuts below were tested live via the wrapper's `exec press`. Jira's shortcuts work at the document level - no iframe focus issues like LinkedIn.

**Sequence vs chord:** hotkeys like `g` then `i` or `s` then `t` are SEQUENCES - send two separate `exec press` calls. `"a+b"` in `press` means simultaneous keys (chord), not a sequence.

Open the cheatsheet with `?` to see the full list in-app:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec press "?"
```

This opens `dialog "Keyboard shortcuts"` with the complete list grouped by category.

### Global

| Action | Hotkey | Validated |
|---|---|---|
| Quick search | `/` | ✅ Opens `combobox "Search"` with `textbox "Search board"` |
| Close drawer | `Esc` | ✅ |
| Create work item | `c` | ✅ Opens `dialog "Create New Work Item"` |
| Keyboard shortcuts | `?` | ✅ Opens `dialog "Keyboard shortcuts"` |
| Find work items | `g` then `i` | Not validated live |
| Browse to a space | `g` then `p` | Not validated live |
| Toggle sidebar | `[` | ✅ Sidebar `display:none` -> visible |
| Open help panel | `h` | Not validated live |
| Open command palette | `Ctrl+K` | ✅ Opens `dialog "Command palette modal"` |

### Space navigation

| Action | Hotkey |
|---|---|
| Go to Summary | `1` |
| Go to Timeline | `2` |
| Go to Backlog | `3` |
| Go to Active sprints | `4` |
| Go to Releases | `5` |
| Go to Reports | `6` |
| Go to Calendar | `7` |
| Go to List | `8` |
| Go to Forms | `9` |

### Navigating issues

| Action | Hotkey |
|---|---|
| View selected issue | `o` |
| Next issue | `j` |
| Previous issue | `k` |
| Toggle issue fullscreen | `z` |
| Dock/undock the filters panel | `[` |
| Next activity | `n` |
| Previous activity | `p` |
| Focus search field | `f` |
| Search for issues | `u` |
| Switch filter view | `t` |
| Detail view order by | `y` |
| Scroll around open issue | `→` `↓` `↑` `←` |
| Share search criteria | `s` |

### Issue actions

| Action | Hotkey |
|---|---|
| Create child issue | `Shift+C` |
| Link existing issue | `Shift+K` |
| Assign issue | `a` |
| Comment on issue | `m` |
| Watch issue | `w` |
| Edit issue labels | `l` |
| Actions menu | `.` |
| Assign to me | `i` |
| Change status | `d` |
| Log work | `q` |
| Share | `Shift+S` |

### Plans

| Action | Hotkey |
|---|---|
| Set timespan to weeks | `Ctrl+Alt+W` |
| Set timespan to months | `Ctrl+Alt+M` |
| Set timespan to quarters | `Ctrl+Alt+Q` |
| Set timespan to years | `Ctrl+Alt+Y` |
| Set timespan to custom range | `Ctrl+Alt+X` |
| Go to today | `Ctrl+Alt+T` |
| Unsaved changes | `Ctrl+Alt+R` |
| Add fields | `Ctrl+Alt+A` |
| Toggle timeline/list mode | `Ctrl+Alt+L` |

### Plans dependencies

| Action | Hotkey |
|---|---|
| Pan to the left | `←` |
| Pan to the right | `→` |
| Pan to the top | `↑` |
| Pan to the bottom | `↓` |
| Zoom the report in | `+` |
| Zoom the report out | `-` |

### Board

| Action | Hotkey |
|---|---|
| Next column | `n` |
| Previous column | `p` |
| Hide/show detail view | `t` |
| Toggle epic panel | `e` |
| Toggle version panel | `v` |
| Toggle all swimlanes | `-` |
| Send to top | `s` then `t` |
| Send to bottom | `s` then `b` |

### Bulk operations

| Action | Hotkey |
|---|---|
| Skip to toolbar | `Ctrl+B` |

### Usage notes

- **`?`** is the discovery shortcut - press it first to confirm the full list in-app.
- **`/`** focuses the board search; type to filter work items on the current page.
- **`c`** opens the create-work-item dialog without clicking the Create button.
- **`.`** opens the actions menu on an issue - use for transitions/operations without hunting buttons.
- **`Ctrl+K`** opens the command palette for navigating to any space, issue, or setting.
- **`[`** toggles the left sidebar - useful when you need more screen space for the board.
- **`Esc`** closes any open dialog, drawer, or panel.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://<your-domain>.atlassian.net" --headed
```

**Note:** Jira login often uses Google SSO or Microsoft SSO. The browser profile preserves the SSO session across restarts. See the parent [SKILL.md](../../SKILL.md) for the full login/state workflow.

## Create issue

Jira's create-issue form is a multi-field dialog. The pattern:

1. Navigate to Jira, press `c` to open the create dialog
2. Wait for the dialog
3. Fill fields using `find`/`fill` (or `eval` for custom dropdowns)
4. Take a snapshot for user approval before submitting
5. Submit and verify

```bash
# 1. Navigate to Jira
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net"

# 2. Open the create dialog (keyboard shortcut 'c')
node .agents/skills/browser-automation/scripts/browser.js exec press c

# 3. Wait for the dialog
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('div[role=\"dialog\"]')"

# 4. Fill fields semantically. `find label`/`find placeholder`/`find text` locate
#    the field; refs come from `exec snapshot -i` when needed.
node .agents/skills/browser-automation/scripts/browser.js exec find label "Summary" fill "Issue title here"
node .agents/skills/browser-automation/scripts/browser.js exec find label "Description" fill "Issue description here"

# If find can't target the field, snapshot the dialog and fill by ref:
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i
node .agents/skills/browser-automation/scripts/browser.js exec fill @eN "Issue title here"

# 5. Take snapshot for approval before submitting
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i

# 6. After user approval, click Create
node .agents/skills/browser-automation/scripts/browser.js exec find role "button" click   # or click @eN of the Create button from the snapshot

# 7. Verify: success toast or redirect to the issue page
node .agents/skills/browser-automation/scripts/browser.js exec wait --url "/browse/"
# or:
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('[data-testid=\"issue-created-notification\"]') || location.href.includes('/browse/')"
```

`fill` appends: if a field has pre-selected content, clear it first (Ctrl+A, then type).

## Custom dropdown fields

Jira custom fields often use custom dropdown components that don't respond to standard `fill`. Prefer semantic clicks first; `eval` only as last resort:

```bash
# Semantic: open the field, then pick the option by role/text
node .agents/skills/browser-automation/scripts/browser.js exec find label "Field Name" click
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('[role=\"option\"]')"
node .agents/skills/browser-automation/scripts/browser.js exec find role "option" click   # or find text "Option Text" click

# Last resort with exact selectors (unverified after agent-browser migration):
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const field = document.querySelector('[data-field-id=\"customfield_12345\"]');
  if (field) { field.click(); return 'opened'; }
  return 'not_found';
})()"
```

## Navigate to an issue

```bash
# Direct URL (most reliable)
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"

# Or via command palette: Ctrl+K, then type the issue key
node .agents/skills/browser-automation/scripts/browser.js exec press "Ctrl+K"
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "ISSUE-123"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

## Add comment to an issue

```bash
# Navigate to the issue
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"

# 'm' focuses the comment field on an open issue
node .agents/skills/browser-automation/scripts/browser.js exec press m
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "Your comment here"
# or: exec find label "Comment" fill "..." / exec fill @eN "..."

# Submit
node .agents/skills/browser-automation/scripts/browser.js exec find text "Save" click
```

## Transition an issue (change status)

```bash
# Navigate to the issue, then use the 'd' shortcut to open the status picker
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"
node .agents/skills/browser-automation/scripts/browser.js exec press d

# Select the target status
node .agents/skills/browser-automation/scripts/browser.js exec find text "In Progress" click

# Alternative: '.' opens the actions menu with transitions too
```

If the dropdown needs a direct click (unverified after agent-browser migration):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const btn = document.querySelector('[data-testid=\"issue.views.issue-base.status.transition-button\"]');
  if (btn) { btn.click(); return 'clicked'; }
  return 'not_found';
})()"
```

## Gotchas

- **Jira UI varies by version** (Cloud vs Server vs Data Center). Selectors may differ.
- **Custom fields are unpredictable** - use `find` to locate them by label text, not by CSS selector.
- **The create dialog may pre-select project/issue type** from context. Check before filling.
- **Description field may be a contenteditable** (not a textarea). If `fill` doesn't work, use `exec keyboard type` after focusing, or `eval` with `innerHTML` as last resort.
- **Jira Cloud uses React** - some inputs need the native value setter pattern (see main Browser Automation guide).
- **Approval before submit is critical** - always snapshot the filled form and ask the user before creating.

## agent-browser notes (verified 2026-10-24)
- `exec find` requires a type: `exec find text|label|placeholder|role "<value>" <action>`.
- Snapshot refs are used as `@eN` (`[ref=eN]` maps to `@eN`).
- Key sequences (g then i, s then t): two separate `press` calls - `"a+b"` is a chord, not a sequence.
- `fill` appends: clear the field first if it has content.
- No Jira session in .browser-profile (Oct 2026): all of cencosud.atlassian.net redirects to id.atlassian.com - a headed manual re-login is required before validating operations.
