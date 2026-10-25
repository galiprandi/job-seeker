# Profile Management

How to manage the browser profile directory, auth state, and headed/headless workflow.

## Profile directory

The profile directory (`.browser-profile/`) stores cookies, localStorage, and session data. It must NEVER be committed to git.

```bash
# Add to .gitignore IMMEDIATELY
echo ".browser-profile/" >> .gitignore
echo "agent-browser.json" >> .gitignore      # optional: per-repo browser contract
echo "downloads/" >> .gitignore              # agent-browser downloadPath
echo "screenshots/" >> .gitignore            # agent-browser screenshotDir
echo "*.auth-state.json" >> .gitignore
```

The wrapper always sets `AGENT_BROWSER_PROFILE` to `<repo-root>/.browser-profile`. This ensures:
1. Cookies and localStorage persist across browser restarts
2. Logins are preserved (no need to re-login every session)
3. Profile is isolated from personal browser sessions

The profile resolves to `process.cwd()/.browser-profile` — i.e. the consuming repo's root, not the skill directory. Run the wrapper from the repo root so the profile lands in the right place.

## Repo config: agent-browser.json

On first run the wrapper creates `agent-browser.json` in the repo root from `agent-browser.template.json` (never overwrites). It is the repo's browser contract:

```json
{
  "$schema": "https://agent-browser.dev/schema.json",
  "namespace": "<repo-name>",
  "profile": "./.browser-profile",
  "headed": true,
  "idleTimeout": "0",
  "downloadPath": "./downloads",
  "screenshotDir": "./screenshots",
  "screenshotFormat": "jpeg",
  "screenshotQuality": 80,
  "annotate": true,
  "maxOutput": 50000
}
```

- `namespace` gives the repo its own agent-browser daemon socket — per-repo isolation (replaces the old workspace-marker approach).
- `headed` sets the default mode; override per call with `--headed`/`--headless`.
- Env vars override everything: `AGENT_BROWSER_NAMESPACE`, `AGENT_BROWSER_PROFILE`, `AGENT_BROWSER_CONFIG`, `AGENT_BROWSER_ARGS`, `AGENT_BROWSER_EXECUTABLE_PATH`.

## Auth state persistence

After a manual login, save the auth state so you don't need to re-login next time.

```bash
# 1. Open browser in headed mode for manual login
node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com" --headed

# 2. User logs in manually (handles captcha, 2FA, etc.)

# 3. Save auth state (cookies + localStorage) — path is required
node .agents/skills/browser-automation/scripts/browser.js save-state .browser-profile/auth-state.json

# 4. Close browser
node .agents/skills/browser-automation/scripts/browser.js close

# 5. Next session: open + load state (no re-login needed)
node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com"
node .agents/skills/browser-automation/scripts/browser.js load-state .browser-profile/auth-state.json
```

`save-state`/`load-state` are wrapper commands that map to agent-browser `state save <path>` / `state load <path>`.

### Auth state vs persistent profile

The persistent profile (`.browser-profile/`) already preserves cookies across restarts. `save-state`/`load-state` are an additional layer that explicitly saves cookies + localStorage to a JSON file. Use cases:

- **Profile alone:** Works for most sites. Cookies persist in the profile dir.
- **Profile + save-state:** Use when the profile gets corrupted or when you want a portable auth state file (e.g. seeding a separate agent-browser session for parallel work).
- **load-state after open:** Use when a site logged you out despite the profile (rare, but happens with aggressive session expiration).

### Multiple sites in one profile

The profile is shared across all sites. Logging into Gmail and LinkedIn in the same profile means both sessions persist. This is fine for most use cases.

If you need isolation (e.g. testing with different accounts), run the wrapper from a different working directory (profile resolves to `process.cwd()/.browser-profile`) or use separate agent-browser sessions via `AGENT_BROWSER_SESSION`.

## Headed vs headless workflow

### Resolution order

The mode is resolved on every `open` call:

1. `--headed` / `--headless` flag on the command line (always wins)
2. `headed` field in `agent-browser.json`

Note: the shipped template defaults `headed` to `true`. Set it to `false` (or pass `--headless` explicitly) for unattended automation.

### When to use headed

- Manual login (first time or when session expires)
- Captcha solving (never attempt programmatically)
- 2FA / hardware key authentication
- Visual debugging (seeing what the agent sees)
- UI review / design feedback
- Sites that block headless browsers (e.g. Reddit)

### When to use headless

- All automation after login is persisted
- Background tasks (checking inbox, scraping data)
- Sequential subagent work
- CI/CD pipelines

### Session expiration flow

When a site logs you out:

1. Detect the logout (check for login form, "Sign in" button, or redirect to login page)
2. Open headed browser: `node .agents/skills/browser-automation/scripts/browser.js open "https://site.com" --headed`
3. Notify the user to log in manually
4. Wait for confirmation
5. Save state: `node .agents/skills/browser-automation/scripts/browser.js save-state .browser-profile/auth-state.json`
6. Close: `node .agents/skills/browser-automation/scripts/browser.js close`
7. Continue headless: `open --headless` + `load-state .browser-profile/auth-state.json`

### Captcha flow

When a captcha appears (hCaptcha, reCAPTCHA, image challenge):

1. Detect the captcha (check for iframe with captcha domain, or specific selectors)
2. Ensure browser is headed (open headed if currently headless)
3. Notify the user and wait
4. Continue after user confirms
5. Never attempt to solve captchas programmatically
6. Never retry captchas in a loop

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENT_BROWSER_CONFIG` | `<repo>/agent-browser.json` | Config file path |
| `AGENT_BROWSER_NAMESPACE` | repo dir name | Daemon socket namespace (per-repo isolation) |
| `AGENT_BROWSER_PROFILE` | `<repo>/.browser-profile` | Chrome profile dir |
| `AGENT_BROWSER_ARGS` | `--no-sandbox,--disable-blink-features=AutomationControlled` | Extra Chrome args |
| `AGENT_BROWSER_EXECUTABLE_PATH` | auto-detected | Chrome binary path |
| `AGENT_BROWSER_SESSION` | `default` | Session name (use for parallel agents) |
| `BROWSER_DEBUG` | 0 | Set to 1 for verbose wrapper logging to stderr |
