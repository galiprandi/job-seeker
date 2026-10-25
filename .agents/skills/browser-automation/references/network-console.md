# Network Inspection & Console

## Network inspection

```bash
node .agents/skills/browser-automation/scripts/browser.js exec network requests                    # list all network requests
node .agents/skills/browser-automation/scripts/browser.js exec network requests --filter "api"   # filter by URL pattern
node .agents/skills/browser-automation/scripts/browser.js exec network requests --clear          # clear the log
node .agents/skills/browser-automation/scripts/browser.js exec network har start                 # start HAR recording
node .agents/skills/browser-automation/scripts/browser.js exec network har stop /tmp/net.har     # stop and save HAR
```

Useful for:
- Capturing API calls sites make internally
- Extracting CSRF tokens from request headers (use the HAR file for full headers/bodies)
- Debugging failed requests

## Console

```bash
node .agents/skills/browser-automation/scripts/browser.js exec console          # console messages
node .agents/skills/browser-automation/scripts/browser.js exec console --clear  # clear console buffer
node .agents/skills/browser-automation/scripts/browser.js exec errors           # page errors only
node .agents/skills/browser-automation/scripts/browser.js exec errors --clear   # clear error buffer
```
