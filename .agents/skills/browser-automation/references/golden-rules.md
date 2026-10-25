# Golden Rules (validated empirically)

These rules were validated through extensive testing. Breaking them causes failure.

### Rule 0: Verify identity before acting

The first action on any logged-in site must confirm WHICH account is active (account avatar, aria-label, profile corner). If it is not the repo owner's account, STOP and report. A shared daemon or stale profile can attach you to someone else's session.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('img[alt*=\"profile\"], [aria-label*=\"Account\"]')?.getAttribute('aria-label') || document.title"
```

### Rule 1: eval > ref-based clicks

Refs (`@eN`) are per-snapshot and **do not persist** reliably across separate CLI calls. A ref from one `snapshot` call may be stale by the next `click` call (agent-browser tries to re-resolve by role+name, but ambiguous matches fail).

**Wrong:**
```
snap = snapshot()
ref = findRef(snap, "Message")
clickRef(ref)  # may fail, ref may be stale
```

**Right:**
```bash
# Use find (semantic locator + action in one call)
node .agents/skills/browser-automation/scripts/browser.js exec find text "Message" click

# Or eval to find and click by text in one atomic call
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function(){
  const els = document.querySelectorAll('a, button, [role=\"link\"]');
  for (const el of els) {
    if (el.textContent.includes('Message')) { el.click(); return 'clicked'; }
  }
  return 'not_found';
})()"
```

### Rule 2: In-page polling > shell sleep

Shell `sleep` between browser commands wastes round-trips and races async page updates: the page keeps mutating while the shell sleeps, and you still don't know if it is ready.

**Wrong:**
```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://example.com"
sleep 4                        # blind wait, page may not be ready
node .agents/skills/browser-automation/scripts/browser.js exec snapshot
```

**Right:**
```bash
# wait --fn polls inside the page until a real condition is true
node .agents/skills/browser-automation/scripts/browser.js goto "https://example.com"
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('div.target-element')"

# or eval with in-page polling
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('div.target-element')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### Rule 3: Scope snapshots, retry on failure

`exec snapshot` on a complex SPA can be huge, truncated, or momentarily fail. Retry scoped:

```bash
# Interactive elements only (much smaller)
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i
# Scoped to a subtree
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i -s "#main"
# Or skip the snapshot entirely: read the page as text
node .agents/skills/browser-automation/scripts/browser.js exec read
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

Doing wait + click + verify in one `eval` call is more robust than multiple separate CLI calls: fewer process spawns, no race between steps.

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

For non-JS sequences (open + wait + press), prefer `batch` over chained shell calls:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec batch "navigate https://example.com" "wait --load load" "press Enter"
```

### Rule 7: Verify before send (irreversible actions)

Before any action that cannot be undone (send message, submit application, post, delete, pay): verify recipient, account identity, and the FULL content in the compose area via `get text` / `eval`. Show a draft when the flow requires it. Only then trigger the send. Never send on assumption.

### Rule 8: Empirical learnings only

Never write a hypothesis about site behavior ("paste doesn't register", "that selector fails") into a guide or reference without a controlled test confirming it (e.g. send to yourself first). A false learning is worse than none.
