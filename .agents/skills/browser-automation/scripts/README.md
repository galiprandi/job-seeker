# browser-automation scripts

## `browser.js`

Safe wrapper around `agent-browser` (Vercel CLI). Guarantees repo-scoped isolation: the Chrome profile (`.browser-profile`) and the daemon namespace always resolve to the consuming repo's root, so multiple agents on the same machine never share a browser session. Auto-injects site guides when navigating to a documented site. Runs in-place from this skill directory; never copy it to the consuming repo.

### Wrapper commands

```bash
node .agents/skills/browser-automation/scripts/browser.js open <url> [--headed|--headless]
node .agents/skills/browser-automation/scripts/browser.js goto <url> [--tab <name>]
node .agents/skills/browser-automation/scripts/browser.js tab-new <url> --name <name>
node .agents/skills/browser-automation/scripts/browser.js tab-list
node .agents/skills/browser-automation/scripts/browser.js exec <cmd> [args...] [--tab <name>]
node .agents/skills/browser-automation/scripts/browser.js wait-dom [--timeout <ms>]
node .agents/skills/browser-automation/scripts/browser.js close | close-all
node .agents/skills/browser-automation/scripts/browser.js save-state <path> | load-state <path>
node .agents/skills/browser-automation/scripts/browser.js status
node .agents/skills/browser-automation/scripts/browser.js doctor
node .agents/skills/browser-automation/scripts/browser.js guides
node .agents/skills/browser-automation/scripts/browser.js contribute
```

`exec` forwards everything after it to `agent-browser` (`eval`, `press`, `click`, `fill`, `type`, `keyboard type`, `snapshot`, `find`, `wait`, `screenshot`, `read`, `batch`, ...). `exec goto` is rewritten to `navigate`; `run-code` is rejected (use `eval`/`batch`).

On first run the wrapper creates `agent-browser.json` in the repo root from `agent-browser.template.json` (namespace, profile, headed mode). It never overwrites an existing file.

Environment: `BROWSER_DEBUG=1` for verbose logging; `AGENT_BROWSER_*` vars pass through and override wrapper defaults.

See `SKILL.md` for the full usage reference.

## `teams.js`

Helper for sending messages to Microsoft Teams web via keyboard automation. Useful for long or multiline messages where typing line by line manually is impractical.

### Usage

```bash
# Short message (inline)
node scripts/teams.js send <chatId> "short message"

# Long message via stdin (heredoc)
node scripts/teams.js send <chatId> << 'EOF'
📊 Triage report

46 tickets · 27 overdue

[#1234](https://example.com/tickets/1234)
EOF

# Long message from a file
cat /tmp/report.md | node scripts/teams.js send <chatId>
```

### chatId formats

| Type | Format | Example |
|---|---|---|
| Personal notes | `48:notes` | `48:notes` |
| Meeting chat | `19:meeting_xxx@thread.v2` | `19:meeting_NDQ2Nz...@thread.v2` |
| 1:1 chat | `19:*@unq.gbl.spaces` | `19:8:orgid:xxx@unq.gbl.spaces` |
| Group chat | `19:*@thread.v2` | `19:xxx_yyy@thread.v2` |

### Supported Markdown

Teams web parses Markdown in the compose box:

- `[#text](url)` → clickable link with display text
- `**bold**`, `*italic*`, `~~strike~~`
- `- bullet`, `1. numbered`, `> quote`

HTML tags (`<a href>`) are typed as literal text. Use Markdown.

### How it works

All browser calls go through `node browser.js ...` (never `agent-browser` directly):

1. `browser.js goto https://teams.microsoft.com/v2/chat/<chatId>` navigates to the chat
2. `browser.js exec eval` polls for `div[role=textbox]` (up to ~24s; Teams v2 is slow)
3. Focus + clear the textbox (`exec eval` focus, `exec press Meta+a`, `exec press Delete`)
4. Each line is typed with real keystrokes via `exec keyboard type <line>`
5. `exec press Shift+Enter` between lines (Enter alone is a newline, not send)
6. `exec press Meta+Enter` after the last line sends the message

### Requirements

- `browser.js` in the same directory (`scripts/browser.js`)
- Browser logged into Teams (persistent session in `.browser-profile`)
- `agent-browser` installed (`npm install -g agent-browser`) + system Chrome

### When to use it

- Long or multiline messages (reports, triage, summaries)
- Sending from a file or heredoc

For short one-line messages, use the manual commands in the site guide (`sites/teams_com/guide.md`).

## `test-find-guide.js`

Dependency-free test for the site-guide resolution logic in `browser.js` (`findGuide`). Run:

```bash
node .agents/skills/browser-automation/scripts/test-find-guide.js
```
