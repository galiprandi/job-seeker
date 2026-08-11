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

The wrapper hardcodes `--profile=.browser-profile`. This ensures:
1. Cookies and localStorage persist across browser restarts
2. Logins are preserved (no need to re-login every session)
3. Profile is isolated from personal browser sessions
4. Multiple agents can share the same profile via sessions

## Auth state persistence

After a manual login, save the auth state so you don't need to re-login next time.

```bash
# 1. Open browser in headed mode for manual login
node scripts/browser.js open "https://mail.google.com" --headed

# 2. User logs in manually (handles captcha, 2FA, etc.)

# 3. Save auth state (cookies + localStorage)
node scripts/browser.js save-state
# Saves to .browser-profile/auth-state.json

# 4. Close browser
node scripts/browser.js close

# 5. Next session: open + load state (no re-login needed)
node scripts/browser.js open "https://mail.google.com"
node scripts/browser.js load-state
```

### Auth state vs persistent profile

The persistent profile (`--profile=.browser-profile`) already preserves cookies across restarts. The `save-state`/`load-state` commands are an additional layer that explicitly saves cookies + localStorage to a JSON file. Use cases:

- **Profile alone:** Works for most sites. Cookies persist in the profile dir.
- **Profile + save-state:** Use when the profile gets corrupted or when you want a portable auth state file.
- **load-state after open:** Use when a site logged you out despite the profile (rare, but happens with aggressive session expiration).

### Multiple sites in one profile

The profile is shared across all sites. Logging into Gmail and LinkedIn in the same profile means both sessions persist. This is fine for most use cases.

If you need isolation (e.g. testing with different accounts), use separate profile dirs:

```bash
# Default profile
node scripts/browser.js open "https://gmail.com"

# Custom profile (advanced, not supported by the wrapper)
playwright-cli open "https://gmail.com" --profile ./.browser-profile-alt
```

## Headed vs headless workflow

### Config file

```bash
# .browser-config.json
{
  "browser_mode": "headed_logins_only"
}
```

Mode values:
- `headless` — always headless. Use for pure automation where login is already persisted.
- `headed` — always headed. Use for development/debugging.
- `headed_logins_only` — headless by default. The caller passes `--headed` explicitly when a manual login is needed. **Recommended for most use cases.**

### When to use headed

- Manual login (first time or when session expires)
- Captcha solving (never attempt programmatically)
- 2FA / hardware key authentication
- Visual debugging (seeing what the agent sees)
- UI review / design feedback

### When to use headless

- All automation after login is persisted
- Background tasks (checking inbox, scraping data)
- Parallel subagent work
- CI/CD pipelines

### Session expiration flow

When a site logs you out:

1. Detect the logout (check for login form, "Sign in" button, or redirect to login page)
2. Open headed browser: `node scripts/browser.js open "https://site.com" --headed`
3. Notify the user to log in manually
4. Wait for confirmation
5. Save state: `node scripts/browser.js save-state`
6. Close: `node scripts/browser.js close`
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
  "browser_mode": "headed_logins_only"
}
```

Only `browser_mode` is currently supported. The wrapper reads this file on every `open` call (unless `--headed`/`--headless` is passed explicitly).

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BROWSER_MODE` | (none) | Override browser mode (headed, headless, headed_logins_only) |
| `BROWSER_DEBUG` | 0 | Set to 1 for verbose logging to stderr |
| `BROWSER_LOCK_TIMEOUT_MS` | 60000 | Max wait for browser lock |
| `BROWSER_HEALTH_CHECK_TIMEOUT_MS` | 10000 | Timeout for session health check |
| `BROWSER_HEALTH_CHECK_RETRIES` | 2 | Retries before declaring zombie |
| `PLAYWRIGHT_CLI_SESSION` | (none) | Default session name for playwright-cli |
