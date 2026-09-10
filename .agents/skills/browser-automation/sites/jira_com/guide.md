---
name: jira
description: Automate Jira via browser UI for issue creation, form filling, navigation, and transitions.
verified: 2026-09-02
---

# Jira Automation

Automate Jira via browser UI for issue creation, form filling, and navigation. Jira's web UI is the primary interface; there is no simple internal API accessible from the browser (unlike LinkedIn or Teams).

## Keyboard shortcuts

**Validated 2026-08-23 against Jira Cloud (cencosud.atlassian.net).** All shortcuts below were tested live via the wrapper's `exec press`. Jira's shortcuts work at the document level — no iframe focus issues like LinkedIn.

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
| Toggle sidebar | `[` | ✅ Sidebar `display:none` → visible |
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

- **`?`** is the discovery shortcut — press it first to confirm the full list in-app.
- **`/`** focuses the board search; type to filter work items on the current page.
- **`c`** opens the create-work-item dialog without clicking the Create button.
- **`Ctrl+K`** opens the command palette for navigating to any space, issue, or setting.
- **`[`** toggles the left sidebar — useful when you need more screen space for the board.
- **`Esc`** closes any open dialog, drawer, or panel.

## Setup

```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://<your-domain>.atlassian.net" --headed
```

**Note:** Jira login often uses Google SSO or Microsoft SSO. The browser profile preserves the SSO session across restarts. See the parent [SKILL.md](../../SKILL.md) for the full login/state workflow.

## Create issue

Jira's create-issue form is a multi-field dialog. The pattern:

1. Navigate to the create-issue URL or click "Create" button
2. Wait for the dialog to appear (in-page polling)
3. Fill fields using `fill` or `eval` (for custom dropdowns)
4. Take a snapshot for user approval before submitting
5. Submit and verify

```bash
# 1. Navigate to Jira
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net"

# 2. Open the create dialog (keyboard shortcut 'c')
node .agents/skills/browser-automation/scripts/browser.js exec press c

# 3. Wait for the dialog
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('div[role=\"dialog\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# 4. Fill project field (if not pre-selected)
node .agents/skills/browser-automation/scripts/browser.js exec find "Project"
# Then fill or select from the dropdown

# 5. Fill issue type
node .agents/skills/browser-automation/scripts/browser.js exec find "Issue Type"
# Select the appropriate type

# 6. Fill summary (the title)
node .agents/skills/browser-automation/scripts/browser.js exec find "Summary"
# Use the ref to fill
node .agents/skills/browser-automation/scripts/browser.js exec fill <summary_ref> "Issue title here"

# 7. Fill description
node .agents/skills/browser-automation/scripts/browser.js exec find "Description"
node .agents/skills/browser-automation/scripts/browser.js exec fill <desc_ref> "Issue description here"

# 8. Take snapshot for approval before submitting
node .agents/skills/browser-automation/scripts/browser.js exec snapshot

# 9. After user approval, click Create/Submit
node .agents/skills/browser-automation/scripts/browser.js exec find "Create"
node .agents/skills/browser-automation/scripts/browser.js exec click <create_ref>

# 10. Verify (check for success toast or redirect to issue page)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 30; i++) {
    if (document.querySelector('.aui-message-success, [data-testid=\"issue-created-notification\"]')) return 'created';
    if (location.href.includes('/browse/')) return 'redirected';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

## Custom dropdown fields

Jira custom fields often use custom dropdown components that don't respond to standard `fill`. Use `eval`:

```bash
# Click to open the dropdown
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const field = document.querySelector('[data-field-id=\"customfield_12345\"]');
  if (field) { field.click(); return 'opened'; }
  return 'not_found';
})()"

# Wait for dropdown options
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 20; i++) {
    if (document.querySelector('[role=\"option\"], [data-role=\"option\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Click the option by text
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const options = document.querySelectorAll('[role=\"option\"], [data-role=\"option\"]');
  for (const opt of options) {
    if (opt.textContent.includes('Option Text')) { opt.click(); return 'selected'; }
  }
  return 'not_found';
})()"
```

## Navigate to an issue

```bash
# Direct URL (most reliable)
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"
```

## Add comment to an issue

```bash
# Navigate to the issue
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"

# Find the comment field
node .agents/skills/browser-automation/scripts/browser.js exec find "Comment"
node .agents/skills/browser-automation/scripts/browser.js exec fill <comment_ref> "Your comment here"

# Submit the comment
node .agents/skills/browser-automation/scripts/browser.js exec find "Save"
node .agents/skills/browser-automation/scripts/browser.js exec click <save_ref>
```

## Transition an issue (change status)

```bash
# Navigate to the issue
node .agents/skills/browser-automation/scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"

# Click the status transition button
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const btn = document.querySelector('[data-testid=\"issue.views.issue-base.status.transition-button\"]');
  if (btn) { btn.click(); return 'clicked'; }
  return 'not_found';
})()"

# Select the target status from the dropdown
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const options = document.querySelectorAll('[role=\"option\"], [data-role=\"option\"]');
  for (const opt of options) {
    if (opt.textContent.includes('In Progress')) { opt.click(); return 'selected'; }
  }
  return 'not_found';
})()"
```

## Gotchas

- **Jira UI varies by version** (Cloud vs Server vs Data Center). Selectors may differ.
- **Custom fields are unpredictable** — use `find` to locate them by label text, not by CSS selector.
- **The create dialog may pre-select project/issue type** from context. Check before filling.
- **Description field may be a contenteditable** (not a textarea). Use `eval` with `innerHTML` if `fill` doesn't work.
- **Jira Cloud uses React** — some inputs need the native value setter pattern (see main Browser Automation guide).
- **Approval before submit is critical** — always snapshot the filled form and ask the user before creating.
