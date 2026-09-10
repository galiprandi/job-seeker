# Profile Management

How to manage the browser profile directory, auth state, and headed/headless workflow.

## Profile directory

The profile directory (`.browser-profile/`) stores cookies, localStorage, and session data. It must NEVER be committed to git.

```bash
# Create the profile dir
mkdir -p .browser-profile

# Add to .gitignore IMMEDIATELY
echo ".browser-profile/" >> .gitignore
echo ".playwright-cli/" >> .gitignore
echo "*.session-state.json" >> .gitignore
echo "*.auth-state.json" >> .gitignore
echo ".browser-config.json" >> .gitignore
```

The wrapper always passes `--profile=.browser-profile`. This ensures:
1. Cookies and localStorage persist across browser restarts
2. Logins are preserved (no need to re-login every session)
3. Profile is isolated from personal browser sessions

The profile resolves to `process.cwd()/.browser-profile` — i.e. the consuming repo's root, not the skill directory. Run the wrapper from the repo root so the profile lands in the right place.

## Auth state persistence

After a manual login, save the auth state so you don't need to re-login next time.

```bash
# 1. Open browser in headed mode for manual login
node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com" --headed

# 2. User logs in manually (handles captcha, 2FA, etc.)

# 3. Save auth state (cookies + localStorage)
node .agents/skills/browser-automation/scripts/browser.js save-state
# Saves to .browser-profile/auth-state.json

# 4. Close browser
node .agents/skills/browser-automation/scripts/browser.js close

# 5. Next session: open + load state (no re-login needed)
node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com"
node .agents/skills/browser-automation/scripts/browser.js load-state
```

### Auth state vs persistent profile

The persistent profile (`--profile=.browser-profile`) already preserves cookies across restarts. The `save-state`/`load-state` commands are an additional layer that explicitly saves cookies + localStorage to a JSON file. Use cases:

- **Profile alone:** Works for most sites. Cookies persist in the profile dir.
- **Profile + save-state:** Use when the profile gets corrupted or when you want a portable auth state file.
- **load-state after open:** Use when a site logged you out despite the profile (rare, but happens with aggressive session expiration).

### Multiple sites in one profile

The profile is shared across all sites. Logging into Gmail and LinkedIn in the same profile means both sessions persist. This is fine for most use cases.

If you need isolation (e.g. testing with different accounts), use separate profile dirs by running the wrapper from different working directories, since the profile resolves to `process.cwd()/.browser-profile`.

## Headed vs headless workflow

### Config file

```bash
# .browser-config.json
{
  "browser_mode": "headed"
}
```

Mode values:
- `headless` — always headless. Use for pure automation where login is already persisted.
- `headed` — always headed. Use for development/debugging.

The recommended setup is to leave the config at `headless` (or omit it — headless is the default) and pass `--headed` explicitly only when a manual login is needed. This keeps automation headless by default while still allowing headed sessions on demand.

### Config resolution order

The wrapper resolves browser mode on every `open` call, in this order:

1. `--headed` / `--headless` flag on the command line
2. `.browser-config.json` `browser_mode` field
3. `BROWSER_MODE` environment variable
4. Default: headless

The first match wins. The flag always overrides config and env.

### When to use headed

- Manual login (first time or when session expires)
- Captcha solving (never attempt programmatically)
- 2FA / hardware key authentication
- Visual debugging (seeing what the agent sees)
- UI review / design feedback

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
5. Save state: `node .agents/skills/browser-automation/scripts/browser.js save-state`
6. Close: `node .agents/skills/browser-automation/scripts/browser.js close`
7. Continue headless: `open` + `load-state`

### Captcha flow

When a captcha appears (hCaptcha, reCAPTCHA, image challenge):

1. Detect the captcha (check for iframe with captcha domain, or specific selectors)
2. Ensure browser is headed (open headed if currently headless)
3. Notify the user and wait
4. Continue after user confirms
5. Never attempt to solve captchas programmatically
6. Never retry captchas in a loop

## Config file reference

`.browser-config.json` (in repo root, gitignored):

```json
{
  "browser_mode": "headed"
}
```

Only `browser_mode` is currently supported. Valid values are `headed` and `headless`. The wrapper reads this file on every `open` call (unless `--headed`/`--headless` is passed explicitly).

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BROWSER_MODE` | (none) | Override browser mode (`headed` or `headless`) |
| `BROWSER_DEBUG` | 0 | Set to 1 for verbose logging to stderr |
| `BROWSER_NO_UPDATE_CHECK` | 0 | Set to 1 to disable the update check on `open` |
