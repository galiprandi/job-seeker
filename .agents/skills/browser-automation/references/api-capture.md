# API Request Capture (Reverse Engineering)

When an app's internal API is undocumented, capture network requests to discover endpoints. agent-browser records requests automatically per session; use `network requests` and `network har` instead of writing interceptor scripts.

## Quick capture

```bash
# 1. Open the app
node .agents/skills/browser-automation/scripts/browser.js open "https://app.example.com" --headed

# 2. Perform the action you want to capture in the UI

# 3. List recorded requests, filtered to what looks like an API call
node .agents/skills/browser-automation/scripts/browser.js exec network requests --filter "api"
node .agents/skills/browser-automation/scripts/browser.js exec network requests --filter "message"
```

## Full detail via HAR

For headers, request bodies, and response bodies, record a HAR file:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec network har start
# ... perform the action in the UI ...
node .agents/skills/browser-automation/scripts/browser.js exec network har stop /tmp/capture.har

# Inspect locally
jq '.log.entries[] | {url: .request.url, method: .request.method, headers: .request.headers, body: .request.postData.text}' /tmp/capture.har
```

## Blocking requests during capture

To confirm an endpoint is required (or to stub a response):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec network route "*://*.example.com/api/track*" --abort
node .agents/skills/browser-automation/scripts/browser.js exec network route "*/api/data" --body '{"ok":true}'
node .agents/skills/browser-automation/scripts/browser.js exec network unroute
```

This works for any web app. Use it when:
- The app has no public API documentation
- You need to automate an action not covered by existing scripts
- The API has changed and existing scripts break
