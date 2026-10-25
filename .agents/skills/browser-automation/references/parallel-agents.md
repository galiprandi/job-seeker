# Parallel Subagent Browser Pattern

How to organize browser work across multiple apps and subagents.

## Isolation model (agent-browser)

agent-browser isolates at three levels:

- **Namespace** — the daemon socket namespace. The wrapper sets `AGENT_BROWSER_NAMESPACE` to the repo directory name and writes it into `agent-browser.json` (auto-created on first run). Per-repo isolation is automatic; nothing to configure. Never point two repos at the same namespace.
- **Session** — an isolated browser instance inside a namespace (own cookies, storage, tabs). Name it via `--session <name>` on any agent-browser command or the `AGENT_BROWSER_SESSION` env var. Give each parallel agent its own session name.
- **Tab** — a labeled tab inside a session: `browser.js tab-new <url> --name <name>` (agent-browser: `tab new --label <name>`). Labels work everywhere a tab ref is accepted; `--pin-tab` fails instead of falling back if the bound tab closes.

## Key learning: parallel work on ONE browser is COUNTERPRODUCTIVE

**Tested empirically:** multiple subagents on the same session/tab set cause interference. Even with named tabs and `--tab` targeting, commands route to whichever tab was last active.

**Symptoms observed:**
- Agent A's commands execute on Agent B's tab
- Agents have to create temp tabs to recover from interference
- Agents report "another process was actively switching tabs"

**Two safe shapes:**

1. **Sequential, one session, one tab per app** (recommended, shares the logged-in profile)
2. **Parallel, one session per agent** (isolated, but each session needs its own login state)

## Recommended pattern: one tab per app, SEQUENTIAL work

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

## Parallel with separate sessions

If work must run in parallel, give each agent its own session. Sessions have separate browsers, so they cannot interfere — but also separate auth, so each session needs login state (reuse `.browser-profile` is not shared; export/import via `save-state`/`load-state` if needed).

```bash
# Agent A
AGENT_BROWSER_SESSION=agent-a node .agents/skills/browser-automation/scripts/browser.js exec eval "..."

# Agent B (concurrently, different browser)
AGENT_BROWSER_SESSION=agent-b node .agents/skills/browser-automation/scripts/browser.js exec eval "..."
```

## Why not parallel on one session?

The session has a single active tab context. Even with `--tab` targeting, the agent-browser daemon serializes commands and can route them to whichever tab was last active. Named tabs help with targeting but don't provide true isolation.

**What `--tab` does:** tells the wrapper which tab to target before running the command. The wrapper switches to that tab, runs the command, and returns. If two agents do this simultaneously, they fight over the active tab.

There is no session attachment, ref-counting, or locking in the wrapper — it does not track which agents are active. This is intentional: the only safe model is sequential execution (or separate sessions).

## When parallel MIGHT work on one session

Only for truly independent operations that don't depend on tab state:
- One agent does an `eval` with `fetch()` (no DOM interaction, no tab switch needed)
- Another agent does a `snapshot` on a different tab

But even this is fragile. Prefer sequential or separate sessions.

## Closing the browser

`close` and `close-all` close the browser immediately without checking for active agents — there is no ref-count to consult. The coordinator is responsible for ensuring subagents have finished before closing.

```bash
# Close the current session
node .agents/skills/browser-automation/scripts/browser.js close

# Close all sessions
node .agents/skills/browser-automation/scripts/browser.js close-all
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
node .agents/skills/browser-automation/scripts/browser.js tab-new "https://mail.google.com" --name gmail
node .agents/skills/browser-automation/scripts/browser.js tab-new "https://www.linkedin.com" --name linkedin

# Target by app name
node .agents/skills/browser-automation/scripts/browser.js exec eval "..." --tab gmail
node .agents/skills/browser-automation/scripts/browser.js exec eval "..." --tab linkedin
```

## Pitfalls

- **Don't** run browser subagents in parallel on one session — they'll interfere with each other
- **Don't** close the browser until all subagents have finished (the coordinator must track this; the wrapper will not refuse)
- **Don't** open a second browser with `agent-browser open` directly — always go through the wrapper so the profile, namespace, and tab state stay consistent
- **Don't** create temp tabs ad hoc — create all needed tabs upfront with clear names
- **Don't** forget to clean up with `close-all` when finished
