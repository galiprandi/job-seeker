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
node .agents/skills/browser-automation/scripts/browser.js open "https://gmail.com" --headless
node .agents/skills/browser-automation/scripts/browser.js tab-new "https://www.linkedin.com" --name linkedin

# 2. Run subagent A (gmail) — wait for it to finish
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async()=>{var r=await fetch('https://mail.google.com/mail/feed/atom');return await r.text()})()" --tab gmail

# 3. Run subagent B (linkedin) — only after A is done
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.title" --tab linkedin

# 4. Cleanup
node .agents/skills/browser-automation/scripts/browser.js close-all
```

## Why not parallel?

The browser is a single process with a single active page. Even with `--tab` targeting, the underlying playwright-cli daemon serializes commands and can route them to whichever tab was last active. Named tabs help with targeting but don't provide true isolation.

**What `--tab` does:** tells the wrapper which tab to target before running the command. The wrapper switches to that tab, runs the command, and returns. If two agents do this simultaneously, they fight over the active tab.

There is no session attachment, ref-counting, or locking in the wrapper — it does not track which agents are active. This is intentional: the only safe model is sequential execution.

## When parallel MIGHT work

Only for truly independent operations that don't depend on tab state:
- One agent does an `eval` with `fetch()` (no DOM interaction, no tab switch needed)
- Another agent does a `snapshot` on a different tab

But even this is fragile. Prefer sequential.

## Closing the browser

`close` and `close-all` close the browser immediately without checking for active agents — there is no ref-count to consult. The coordinator is responsible for ensuring subagents have finished before closing.

```bash
# Close the current session
node .agents/skills/browser-automation/scripts/browser.js close

# Close all sessions
node .agents/skills/browser-automation/scripts/browser.js close-all
```

The `--force` flag is accepted for compatibility but has no special behavior — close always closes.

## Tab naming convention

Use the app name as the tab name. This makes `--tab` intuitive:

| App | Tab name | URL |
|---|---|---|
| Gmail | `gmail` | `https://mail.google.com` |
| LinkedIn | `linkedin` | `https://www.linkedin.com` |
| X/Twitter | `x` | `https://x.com` |
| YouTube | `youtube` | `https://youtube.com` |

```bash
node .agents/skills/browser-automation/scripts/browser.js tab-new "https://mail.google.com" --name gmail
node .agents/skills/browser-automation/scripts/browser.js tab-new "https://www.linkedin.com" --name linkedin

# Target by app name
node .agents/skills/browser-automation/scripts/browser.js exec eval "..." --tab gmail
node .agents/skills/browser-automation/scripts/browser.js exec eval "..." --tab linkedin
```

## Pitfalls

- **Don't** run browser subagents in parallel — they'll interfere with each other
- **Don't** close the browser until all subagents have finished (the coordinator must track this; the wrapper will not refuse)
- **Don't** open a second browser with `playwright-cli open` directly — always go through the wrapper so the profile and tab state stay consistent
- **Don't** create temp tabs ad hoc — create all needed tabs upfront with clear names
- **Don't** forget to clean up with `close-all` when finished
