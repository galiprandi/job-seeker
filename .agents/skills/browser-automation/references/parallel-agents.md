# Parallel Subagent Browser Pattern

How to organize browser work across multiple apps and subagents.

## Key learning: parallel browser work is COUNTERPRODUCTIVE

**Tested empirically:** running multiple subagents simultaneously on the same browser causes interference. The browser has a single active tab context, and even with named tabs and `--tab` flags, commands get routed to the wrong tab when multiple agents are active.

**Symptoms observed:**
- Agent A's commands execute on Agent B's tab
- Agents have to create temp tabs to recover from interference
- Agents report "another process was actively switching tabs"

## Recommended pattern: one tab per app, SEQUENTIAL work

Don't run browser subagents in parallel. Instead:

1. **Coordinator opens one tab per app** (upfront)
2. **Subagents run sequentially**, each targeting its tab with `--tab`
3. **No tab switching needed** — `--tab` handles it

```
Coordinator
├── open browser
├── tab-new "https://gmail.com" --name gmail
├── tab-new "https://www.linkedin.com" --name linkedin
│
├── Subagent A (gmail) — runs FIRST, completes, returns
│   └── exec eval "..." --tab gmail
│
├── Subagent B (linkedin) — runs AFTER A completes
│   └── exec eval "..." --tab linkedin
│
└── Cleanup
    └── close-all
```

```bash
# 1. Open browser and create named tabs
node scripts/browser.js open "https://gmail.com" --headless
node scripts/browser.js tab-new "https://www.linkedin.com" --name linkedin

# 2. Run subagent A (gmail) — wait for it to finish
node scripts/browser.js exec eval "(async()=>{var r=await fetch('https://mail.google.com/mail/feed/atom');return await r.text()})()" --tab gmail

# 3. Run subagent B (linkedin) — only after A is done
node scripts/browser.js exec eval "document.title" --tab linkedin

# 4. Cleanup
node scripts/browser.js close-all
```

## Why not parallel?

The browser is a single process with a single active page. Even with `--tab` targeting, the underlying playwright-cli daemon serializes commands and can route them to whichever tab was last active. Named tabs help with targeting but don't provide true isolation.

**What `--tab` does:** tells the wrapper which tab to target before running the command. The wrapper switches to that tab, runs the command, and returns. If two agents do this simultaneously, they fight over the active tab.

**What attached sessions do:** `playwright-cli attach` creates a separate session with its own tab context. In theory this enables parallelism. In practice, the browser still has a single rendering pipeline and commands from different sessions can interfere.

## When parallel MIGHT work

Only for truly independent operations that don't depend on tab state:
- One agent does an `eval` with `fetch()` (no DOM interaction, no tab switch needed)
- Another agent does a `snapshot` on a different tab

But even this is fragile. Prefer sequential.

## Safe close (ref-count)

`close` and `close-all` check for live attached sessions before killing the browser. If other agents are active:
- `close` refuses (use `--force` to override)
- `close-all` refuses (use `--force` to override)

```bash
# Check who is active
node scripts/browser.js who

# Safe close (refuses if agents active)
node scripts/browser.js close

# Force close (kills browser even if agents active)
node scripts/browser.js close --force
node scripts/browser.js close-all --force
```

## Tab naming convention

Use the app name as the tab name. This makes `--tab` intuitive:

| App | Tab name | URL |
|---|---|---|
| Gmail | `gmail` | `https://mail.google.com` |
| LinkedIn | `linkedin` | `https://www.linkedin.com` |
| X/Twitter | `x` | `https://x.com` |
| YouTube | `youtube` | `https://youtube.com` |

```bash
node scripts/browser.js tab-new "https://mail.google.com" --name gmail
node scripts/browser.js tab-new "https://www.linkedin.com" --name linkedin

# Target by app name
node scripts/browser.js exec eval "..." --tab gmail
node scripts/browser.js exec eval "..." --tab linkedin
```

## Pitfalls

- **Don't** run browser subagents in parallel — they'll interfere with each other
- **Don't** close the browser while other agents might still be working (use `who` to check)
- **Don't** open a second browser with `playwright-cli open` directly (use `attach` or the wrapper's auto-attach)
- **Don't** forget to clean up tabs when finished (use `tab-close <name>`)
- **Don't** use `kill-all` when one session is zombie (use targeted `close --session <name>`)
- **Don't** create temp tabs ad hoc — create all needed tabs upfront with clear names
