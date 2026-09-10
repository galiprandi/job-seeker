---
name: linkedin-posting
description: LinkedIn feed post automation with playwright-cli. Covers composer variants (modal dialog + shadow DOM Quill), typing, scheduling, publishing, deleting, and reading your own posts. Use when creating, scheduling, or deleting LinkedIn feed posts. Part of the browser-automation skill.
verified: 2026-09-02
---

# LinkedIn Publishing posts

## Critical rules for posting

1. **SIEMPRE verificar el estado del modal antes de escribir.** Antes de tipear, hacer un snapshot y confirmar que el editor está vacío. Si ya tiene texto, NO escribir de nuevo.
2. **Nunca asumir que el modal se cerró.** El `type` con saltos de línea puede causar que el modal se cierre o que el texto se duplique. Después de escribir, verificar con snapshot que el texto está cargado correctamente.
3. **El botón "Post" puede estar en un dialog regular o en un shadow DOM.** Verificar cuál de los dos está activo antes de interactuar.
4. **No re-abrir el modal si ya está abierto con texto.** Si el usuario dice que el modal está abierto, hacer snapshot primero y verificar.

## Open the composer

LinkedIn tiene dos variantes del composer de posts:

**Variante A: Modal dialog (validado 2026-08-24)**
El modal aparece como un `dialog` con role="dialog" y contiene un textbox "Text editor for creating content".

```bash
# Navigate to feed
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/feed/" --tab linkedin

# Click "Start a post"
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const els = Array.from(document.querySelectorAll('*')).filter(e => e.textContent.trim() === 'Start a post' && e.children.length === 0); if (els.length) { let el = els[0]; while (el && el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') el = el.parentElement; (el || els[0]).click(); return 'clicked'; } return 'not_found'; })()"

# Wait for the modal dialog to appear
sleep 3

# VERIFY the modal is open and the editor is empty BEFORE typing
node .agents/skills/browser-automation/scripts/browser.js exec snapshot --tab linkedin
# Look for: dialog with "Create post modal" heading and textbox "Text editor for creating content"
# If the textbox already has paragraph children with text, DO NOT type again
```

**Variante B: Shadow DOM composer (validado 2026-08-23)**
El composer vive dentro de un shadow DOM (`#interop-outlet` → `shadowRoot`).

```bash
# Click "Start a post" (same as above)
# Then check for shadow DOM:
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const s = document.querySelector('#interop-outlet'); return s && s.shadowRoot ? 'shadow DOM found' : 'no shadow DOM'; })()"
```

## Type the post content

**Para la variante A (modal dialog):**

El editor es un `contenteditable` div dentro del dialog. `playwright-cli type` funciona pero los saltos de línea pueden causar problemas.

```bash
# Click the textbox to focus it (use the ref from snapshot)
node .agents/skills/browser-automation/scripts/browser.js exec click --tab linkedin "<textbox_ref>"

# Type the content — usar \n para saltos de línea
node .agents/skills/browser-automation/scripts/browser.js exec type --tab linkedin "Your post text here.

Second paragraph."

# VERIFY after typing that the text loaded correctly
node .agents/skills/browser-automation/scripts/browser.js exec snapshot --tab linkedin
# Check that the textbox has paragraph children with the expected text
# If text is missing or duplicated, STOP and ask the user
```

**Para la variante B (Quill editor en shadow DOM):**

El composer usa **Quill.js** (`.ql-editor`), NOT tiptap. The tiptap `innerHTML` + `beforeinput` pattern from messaging does NOT work here — the "Post" button stays disabled because Quill's internal state is never updated.

**What works:** `playwright-cli type` simulates real keyboard input and Quill registers it correctly.

```bash
# Wait for the editor to appear in the shadow DOM, then focus it
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => {
  for (let i = 0; i < 40; i++) {
    let editors = document.querySelectorAll('div.ql-editor');
    let editor = Array.from(editors).find(e => e.offsetParent !== null);
    if (!editor) { const s = document.querySelector('#interop-outlet'); if (s && s.shadowRoot) editor = s.shadowRoot.querySelector('div.ql-editor'); }
    if (editor) { editor.focus(); editor.click(); return 'focused'; }
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"

# Type the content (simulates real keyboard — Quill registers it)
node .agents/skills/browser-automation/scripts/browser.js exec type "Your post text here. Use \\n for line breaks."
```

**Limitation:** `playwright-cli type` does not handle multi-line text well (newlines are parsed as args). For long multi-paragraph posts, type the text in one line or use multiple `type` calls with `press Enter` between them:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec type "First paragraph"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
node .agents/skills/browser-automation/scripts/browser.js exec type "Second paragraph"
```

**Bad patterns (Quill — validated 2026-08-23):**
- `editor.innerHTML = '<p>...</p>'` + `InputEvent('beforeinput', {inputType: 'insertFromPaste'})` → text appears visually but "Post" button stays disabled (Quill internal state not updated)
- `editor.dispatchEvent(new ClipboardEvent('paste', ...))` → same issue, text visible but button disabled
- `document.execCommand('insertText', false, text)` → text appears but button stays disabled
- `editor.innerText = text` + `InputEvent('input')` → same issue
- Solution: `playwright-cli type` (real keyboard input) → Quill registers it, Post enables

## Schedule a post for later

After typing the content, the footer has a clock icon button to schedule.

```bash
# Click the schedule button (inside shadow DOM)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = shadow.querySelector('button[aria-label=\"Schedule post\"]'); if (btn) { btn.click(); return 'clicked'; } return 'not_found'; })()"

# Set date and time (inputs are in the shadow DOM)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const shadow = document.querySelector('#interop-outlet').shadowRoot;
  const dateInput = shadow.querySelector('input[name=\"artdeco-date\"]');
  const timeInput = shadow.querySelector('input[name=\"timepicker\"]');
  dateInput.value = 'MM/DD/YYYY';
  dateInput.dispatchEvent(new Event('input', { bubbles: true }));
  dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  timeInput.value = 'H:00 AM';
  timeInput.dispatchEvent(new Event('input', { bubbles: true }));
  timeInput.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ date: dateInput.value, time: timeInput.value });
})()"

# Click "Next" then "Schedule" (both in shadow DOM)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = Array.from(shadow.querySelectorAll('button')).find(b => b.textContent.trim() === 'Next' && !b.disabled); if (btn) { btn.click(); return 'clicked Next'; } return 'not_found'; })()"

# Wait a moment, then click "Schedule"
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => { await new Promise(r => setTimeout(r, 1000)); const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = Array.from(shadow.querySelectorAll('button')).find(b => b.textContent.trim() === 'Schedule' && !b.disabled); if (btn) { btn.click(); return 'clicked Schedule'; } return 'not_found'; })()"
```

**Verification:** after scheduling, the page shows a toast: "Post scheduled. View scheduled posts".

**Gotcha — date input:** Setting `dateInput.value` directly may not always update the calendar widget's internal state. If the post publishes immediately instead of at the scheduled time, click the day button in the calendar instead:

```bash
# Click a specific day in the calendar (aria-label format: "Day, Month DD, YYYY")
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const shadow = document.querySelector('#interop-outlet').shadowRoot;
  const dayBtn = Array.from(shadow.querySelectorAll('button')).find(b => b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Monday, August 24, 2026'));
  if (dayBtn) { dayBtn.click(); return 'clicked'; } return 'not_found';
})()"
```

## Publish immediately

After typing content (and the "Post" button is enabled):

**Variante A (modal dialog):**

```bash
# VERIFY the modal is still open and text is correct before clicking Post
node .agents/skills/browser-automation/scripts/browser.js exec snapshot --tab linkedin
# Confirm: dialog with "Create post modal", textbox has all paragraphs, button "Post" is present and not disabled

# Click "Post" (use the ref from snapshot)
node .agents/skills/browser-automation/scripts/browser.js exec click --tab linkedin "<post_button_ref>"

# VERIFY the post was published
sleep 5
node .agents/skills/browser-automation/scripts/browser.js exec snapshot --tab linkedin
# The modal should be gone and the post should appear in the feed
```

**Variante B (shadow DOM):**

```bash
# Click "Post" (inside shadow DOM)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const shadow = document.querySelector('#interop-outlet').shadowRoot; const btn = Array.from(shadow.querySelectorAll('button')).find(b => b.textContent.trim() === 'Post' && !b.disabled); if (btn) { btn.click(); return 'posted'; } return 'not_found_or_disabled'; })()"
```

## Delete a post

Navigate to your activity page and delete from the control menu:

```bash
# Go to your activity
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/in/<profile_id>/recent-activity/all/"

# Find the post by text content, open its control menu
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const btn = document.querySelector('button[aria-label=\"Open control menu for post by <Your Name>\"]'); if (btn) { btn.click(); return 'clicked'; } return 'not_found'; })()"

# Click "Delete post" (use find + click with refs)
node .agents/skills/browser-automation/scripts/browser.js exec find "Delete post"
# then click the ref

# Confirm in the dialog
node .agents/skills/browser-automation/scripts/browser.js exec find "Delete"
# then click the ref (the dialog's Delete button, not the menu item)
```

**Verification:** the post text no longer appears in the activity page, and a toast confirms deletion.

## Read your own posts (activity page extraction)

*Validated 2026-08-23 against live LinkedIn.*

To extract your own published posts (feed shares), navigate to your activity page and scrape the post text from the DOM.

```bash
# 1. Navigate to your activity page (shares only, or all activity)
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/in/<profile_id>/recent-activity/shares/" --tab linkedin

# Note: LinkedIn may redirect /shares/ to /all/ — both work, /all/ shows posts + comments + reactions

# 2. Wait for posts to render (poll — async SPA load)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (var i = 0; i < 30; i++) {
    var posts = document.querySelectorAll('.feed-shared-update-v2__description, .update-components-text');
    if (posts.length > 0) return 'ready: ' + posts.length;
    await new Promise(function(r){setTimeout(r, 500)});
  }
  return 'timeout';
})()" --tab linkedin

# 3. Extract post texts (deduplicated — the activity page may render duplicates)
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  var posts = document.querySelectorAll('.feed-shared-update-v2__description, .update-components-text');
  var seen = {};
  var out = [];
  posts.forEach(function(p){
    var t = p.innerText.trim();
    if (t.length > 20 && !seen[t]) { seen[t] = true; out.push(t); }
  });
  return JSON.stringify(out);
})()" --tab linkedin
```

**Selectors:** `.feed-shared-update-v2__description` and `.update-components-text` both contain post body text. Query both to cover different LinkedIn UI versions.

**Duplicates:** the activity page sometimes renders the same post twice (e.g. once in a featured section, once in the feed). Always deduplicate by text content using a `seen` map.

**Scrolling for more posts:** the activity page uses lazy loading. To load older posts, scroll down and re-extract:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  var seen = {};
  var out = [];
  for (var s = 0; s < 5; s++) {
    var posts = document.querySelectorAll('.feed-shared-update-v2__description, .update-components-text');
    posts.forEach(function(p){
      var t = p.innerText.trim();
      if (t.length > 30 && !seen[t]) { seen[t] = true; out.push(t); }
    });
    window.scrollBy(0, 3000);
    await new Promise(function(r){setTimeout(r, 2000)});
  }
  return JSON.stringify(out);
})()" --tab linkedin
```

**Gotcha — URL redirect:** navigating to `/recent-activity/shares/` may redirect to `/recent-activity/all/`. This is fine — `/all/` includes shares. Don't rely on the URL staying as `/shares/`.

**Gotcha — profile ID required:** you need your own profile ID (the `ACoAA...` string) or vanity name for the URL. Get it from any LinkedIn page:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  var ids = document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g) || [];
  var counts = {};
  ids.forEach(function(id){counts[id] = (counts[id]||0) + 1});
  return Object.entries(counts).sort(function(a,b){return b[1]-a[1]})[0][0];
})()" --tab linkedin
```

Or use your vanity name: `https://www.linkedin.com/in/<vanity_name>/recent-activity/all/`
