# Setup — browser-automation (agent-browser engine)

Requirements to run this skill on a new machine.

## Requirements

- **Node.js** 18+
- **System Google Chrome** (`google-chrome`, `chromium`, or `chromium-browser`). Required: agent-browser's bundled Chromium fails UA-gates on hostile sites (WhatsApp, Google sign-in).
- **agent-browser** (Vercel CLI) — optional: the wrapper falls back to `npx -y agent-browser` automatically. Global install only saves the per-call npx lookup:

```bash
npm install -g agent-browser
agent-browser --version   # verify (or let the wrapper use npx)
```

Without a global install, `npx agent-browser <cmd>` works too.

## Configuration

- `agent-browser.json` at the consuming repo root: committed, repo-scoped defaults (namespace, profile, headed, downloads, screenshots). The skill ships a template (`scripts/agent-browser.template.json`); the wrapper auto-copies it into the repo root on first use, substituting the repo name as namespace — never overwrites an existing file.
- Env vars the wrapper sets on its own (do not configure by hand):
  - `AGENT_BROWSER_PROFILE` → repo's `.browser-profile/`
  - `AGENT_BROWSER_NAMESPACE` → repo directory name (per-repo daemon isolation)
  - `AGENT_BROWSER_ARGS` → `--no-sandbox,--disable-blink-features=AutomationControlled`
  - `AGENT_BROWSER_EXECUTABLE_PATH` → autodetects system Chrome
  - `AGENT_BROWSER_CONFIG` → repo's `agent-browser.json`

## First run

```bash
node .agents/skills/browser-automation/scripts/browser.js open https://example.com --headed
```

- Sessions (logins) persist in `.browser-profile/` — same directory as the previous engine; the profile is 100% compatible.
- **Never run two browsers on the same profile at once** (SingletonLock).
- **Google sites (Gmail, Calendar, Drive):** the login must happen INSIDE the automated browser (headed) — Google rejects sign-ins inherited from regular Chrome in a CDP context. Once logged in, the session persists.
- **All authentication is manual login inside the dedicated browser.** No passwords through chat channels, no credential vaults — the Chrome profile is the only credential store.

## Diagnostics — `agent-browser doctor`

Runs the full install check:

```bash
agent-browser doctor            # full diagnostics
agent-browser doctor --quick    # fast, no launch test
agent-browser doctor --fix      # repairs detected issues
```

**Expected failures on this setup (not real problems):**

- `Chrome for Testing CDN unreachable` → we don't use bundled Chrome (UA-gates), we use system Chrome. Ignore.
- `Browser launch failed: No usable sandbox` → doctor's launch test runs without `--no-sandbox`. The wrapper does pass it, so real usage works. Ignore unless real usage also fails.

**Expected result on this machine:** 10 pass, 2 fail (the two above).

- Chrome won't launch on Linux/AppArmor → `--no-sandbox` (already in the wrapper).
- WhatsApp or other UA-gates fail → verify `AGENT_BROWSER_EXECUTABLE_PATH` points to real Chrome, not the bundled one.
