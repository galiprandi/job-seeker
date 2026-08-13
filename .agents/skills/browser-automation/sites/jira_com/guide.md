# Jira Automation

Automate Jira via browser UI for issue creation, form filling, and navigation. Jira's web UI is the primary interface; there is no simple internal API accessible from the browser (unlike LinkedIn or Teams).

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

**Before doing anything manually, check if the consuming repo has scripts that wrap these operations.** Run `ls scripts/jira*.js` to see what's available.

## Setup

```bash
# Open Jira (headed for login, headless after)
node scripts/browser.js open "https://<your-domain>.atlassian.net" --headed

# If login needed: user logs in manually (may use Google SSO), then save state
node scripts/browser.js save-state
node scripts/browser.js close

# Next sessions: load state and go headless
node scripts/browser.js open "https://<your-domain>.atlassian.net"
node scripts/browser.js load-state
```

**Note:** Jira login often uses Google SSO or Microsoft SSO. The browser profile preserves the SSO session across restarts.

## Create issue

Jira's create-issue form is a multi-field dialog. The pattern:

1. Navigate to the create-issue URL or click "Create" button
2. Wait for the dialog to appear (in-page polling)
3. Fill fields using `fill` or `eval` (for custom dropdowns)
4. Take a snapshot for user approval before submitting
5. Submit and verify

```bash
# 1. Navigate to Jira
node scripts/browser.js goto "https://<your-domain>.atlassian.net"

# 2. Open the create dialog (keyboard shortcut 'c')
node scripts/browser.js exec press c

# 3. Wait for the dialog
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('div[role=\"dialog\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# 4. Fill project field (if not pre-selected)
node scripts/browser.js exec find "Project"
# Then fill or select from the dropdown

# 5. Fill issue type
node scripts/browser.js exec find "Issue Type"
# Select the appropriate type

# 6. Fill summary (the title)
node scripts/browser.js exec find "Summary"
# Use the ref to fill
node scripts/browser.js exec fill <summary_ref> "Issue title here"

# 7. Fill description
node scripts/browser.js exec find "Description"
node scripts/browser.js exec fill <desc_ref> "Issue description here"

# 8. Take snapshot for approval before submitting
node scripts/browser.js exec snapshot

# 9. After user approval, click Create/Submit
node scripts/browser.js exec find "Create"
node scripts/browser.js exec click <create_ref>

# 10. Verify (check for success toast or redirect to issue page)
node scripts/browser.js exec eval "(async function(){
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
node scripts/browser.js exec eval "(function(){
  const field = document.querySelector('[data-field-id=\"customfield_12345\"]');
  if (field) { field.click(); return 'opened'; }
  return 'not_found';
})()"

# Wait for dropdown options
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 20; i++) {
    if (document.querySelector('[role=\"option\"], [data-role=\"option\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Click the option by text
node scripts/browser.js exec eval "(function(){
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
node scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"
```

## Add comment to an issue

```bash
# Navigate to the issue
node scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"

# Find the comment field
node scripts/browser.js exec find "Comment"
node scripts/browser.js exec fill <comment_ref> "Your comment here"

# Submit the comment
node scripts/browser.js exec find "Save"
node scripts/browser.js exec click <save_ref>
```

## Transition an issue (change status)

```bash
# Navigate to the issue
node scripts/browser.js goto "https://<your-domain>.atlassian.net/browse/<ISSUE-123>"

# Click the status transition button
node scripts/browser.js exec eval "(function(){
  const btn = document.querySelector('[data-testid=\"issue.views.issue-base.status.transition-button\"]');
  if (btn) { btn.click(); return 'clicked'; }
  return 'not_found';
})()"

# Select the target status from the dropdown
node scripts/browser.js exec eval "(function(){
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

## Anti-patterns

- **Don't** submit without user approval — always show the filled form first
- **Don't** assume field positions — Jira reorders fields based on project/issue type
- **Don't** use `type` for the description — it's likely a contenteditable, use `fill` or `eval`
- **Don't** try to log in programmatically — open headed and let the user log in (SSO)
- **Don't** hardcode project keys or issue types — read them from the consuming repo's config or DB
