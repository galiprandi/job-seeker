# Golden Rules (validated empirically)

These rules were validated through extensive testing. Breaking them causes failure.

### Rule 1: eval > ref-based clicks

Refs (`[ref=e123]`) are per-snapshot and **do not persist** between separate `playwright-cli` CLI calls. A ref from one `snapshot` call is invalid by the next `click` call.

**Wrong:**
```
snap = snapshot()
ref = findRef(snap, "Message")
clickRef(ref)  # may fail, ref may be stale
```

**Right:**
```bash
# Use eval to find and click by text in one atomic call
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const els = document.querySelectorAll('a, button, [role=\"link\"]');
  for (const el of els) {
    if (el.textContent.includes('Message')) { el.click(); return 'clicked'; }
  }
  return 'not_found';
})()"
```

### Rule 2: In-page polling > shell sleep

Shell `sleep` between browser commands kills the playwright-cli daemon session. The session dies within 5-10 seconds of inactivity.

**Wrong:**
```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://example.com"
sleep 4                        # session may die here
node .agents/skills/browser-automation/scripts/browser.js exec snapshot        # fails: "No active session"
```

**Right:**
```bash
# Use eval with in-page polling (keeps connection alive)
node .agents/skills/browser-automation/scripts/browser.js goto "https://example.com"
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('div.target-element')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

**Exception:** Very short sleeps (1-2s) within a single shell command using `&&` chaining are safe. The session stays alive as long as the shell process is running.

### Rule 3: Read snapshot file as fallback

When `exec snapshot` fails (session briefly busy), the `open`/`goto` commands auto-generate a snapshot YAML file in `.playwright-cli/`. Read it directly.

```bash
# Try exec snapshot first
node .agents/skills/browser-automation/scripts/browser.js exec snapshot
# If it fails, read the latest snapshot file
ls -t .playwright-cli/page-*.yml | head -1 | xargs cat
```

### Rule 4: Use URLs directly, not clicks for navigation

Navigating to a specific URL is more reliable than clicking navigation links.

**Wrong:** Click "Messaging" icon in header
**Right:** `node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/messaging/"`

**Wrong:** Click "Saved Jobs" menu item
**Right:** `node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/jobs-tracker/?stage=saved"`

### Rule 5: Verify with DOM content, not URL

SPAs (LinkedIn, Gmail, React apps) update the right panel without changing the URL.

**Wrong:** Check if URL changed after clicking a conversation
**Right:** Check if the target container exists and matches expected content

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const panel = document.querySelector('.msg-s-message-list-container');
  const header = document.querySelector('h2');
  if (panel && header && header.textContent.includes('Person Name')) return 'ok';
  return 'not_loaded';
})()"
```

### Rule 6: Batch operations into a single eval call

Doing wait + click + verify in one `eval` call is more robust than multiple separate CLI calls. Each separate call risks session death between steps and adds latency.

**Wrong:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('#btn')"
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('#btn').click()"
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('#result')"
```

**Right:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const btn = document.querySelector('#btn');
  if (!btn) return 'not_found';
  btn.click();
  const result = document.querySelector('#result');
  return result ? result.textContent : 'no_result';
})()"
```

### Chaining: open + eval in a single shell command

Chain `open && eval` in a single shell command to prevent session death between calls.

**Wrong:**
```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com"
# session may die here
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.title"
```

**Right:**
```bash
node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com" && \
  node .agents/skills/browser-automation/scripts/browser.js exec eval "document.title"
```
