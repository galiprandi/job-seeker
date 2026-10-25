# Efficiency Patterns (Save Tokens)

**IMPORTANT: Full snapshots of complex pages (Gmail, LinkedIn, Facebook) are HUGE and get truncated.** Use these patterns instead:

**1. Use `find` to locate elements (no snapshot needed):**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec find text "Redactar"          # find by text
node .agents/skills/browser-automation/scripts/browser.js exec find text "Compose"
node .agents/skills/browser-automation/scripts/browser.js exec find role button --name "Send"
node .agents/skills/browser-automation/scripts/browser.js exec find text "Easy Apply" click  # find + act in one call
```
Returns matching elements with refs. Much smaller than a full snapshot.

**2. Use `eval` to check state or extract data (no snapshot needed):**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.title"
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('h1')?.textContent"
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelectorAll('tr.zA').length + ' emails'"
```

**3. If you need a snapshot, scope it: interactive-only or a subtree:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i                    # interactive elements only
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i -s "#main"         # scoped to a CSS selector
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -c -d 5               # compact, depth-limited
```

**4. Only use full snapshots on simple pages or when you need to understand the overall structure:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot              # full snapshot (avoid on complex pages)
```

**Read the page as text when you only need content:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec read                  # agent-readable text of active tab
```

**Fill + submit via find (one command):**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec find placeholder "Search" fill "search term"
```

**Detect errors without snapshots:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec errors                # page JS errors
node .agents/skills/browser-automation/scripts/browser.js exec network requests      # check for failed network requests
```

**Extract data with eval + fetch (avoid UI navigation):**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async () => { const r = await fetch('/api/data'); return JSON.stringify(await r.json()) })()"
```
