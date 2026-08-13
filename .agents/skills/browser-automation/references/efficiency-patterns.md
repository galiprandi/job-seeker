# Efficiency Patterns (Save Tokens)

**IMPORTANT: Full snapshots of complex pages (Gmail, LinkedIn, Facebook) are HUGE and get truncated.** Use these patterns instead:

**1. Use `find` to locate elements (no snapshot needed):**
```bash
node scripts/browser.js exec find "Redactar"       # find by text
node scripts/browser.js exec find "Compose"
node scripts/browser.js exec find --regex "/sign (in|up)/i"
node scripts/browser.js exec find "Easy Apply"
```
Returns matching elements with refs. Much smaller than a full snapshot.

**2. Use `eval` to check state or extract data (no snapshot needed):**
```bash
node scripts/browser.js exec eval "() => document.title"
node scripts/browser.js exec eval "() => document.querySelector('h1')?.textContent"
node scripts/browser.js exec eval "() => document.querySelectorAll('tr.zA').length + ' emails'"
```

**3. If you need a snapshot, use `find` first to narrow down, then snapshot a specific element:**
```bash
node scripts/browser.js exec find "Redactar"       # get the ref
node scripts/browser.js exec snapshot <ref>        # snapshot just that element
```

**4. Only use full snapshots on simple pages or when you need to understand the overall structure:**
```bash
node scripts/browser.js exec snapshot              # full snapshot (avoid on complex pages)
```

**Fill + submit in one command:**
```bash
node scripts/browser.js exec fill e15 "search term" --submit   # fill + press Enter atomically
```

**Detect errors without snapshots:**
```bash
node scripts/browser.js console error    # check for JS errors
node scripts/browser.js requests         # check for failed network requests
```

**Extract data with eval + fetch (avoid UI navigation):**
```bash
node scripts/browser.js exec eval "(async () => { const r = await fetch('/api/data'); return JSON.stringify(await r.json()) })()"
```
