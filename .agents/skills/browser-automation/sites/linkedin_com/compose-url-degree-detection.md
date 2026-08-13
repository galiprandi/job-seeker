# Compose URL only works for 1st degree connections — linkedin.com

**Date:** 2026-08-13
**Type:** gotcha
**Site:** linkedin.com

## What was expected

The compose URL pattern `https://www.linkedin.com/messaging/compose/?profileUrn=<URN>&recipient=<ID>` opens a message composer for any LinkedIn member, regardless of connection degree.

## What was found

The compose URL behaves differently depending on the connection degree:

### 1st degree connection

The compose URL opens a "New message" dialog with a functional `textbox "Write a message…"` ready for input:

```
- heading "New message" [level=2]
- textbox "Write a message…" [ref=...]
```

### 2nd degree or higher

The compose URL opens a "New message" dialog but **without a message textbox**. Instead, it shows a Premium InMail upsell:

```
- heading "Get Hired Faster with Premium" [level=3]
- paragraph: "With Premium InMail, you can message members outside of your network. It's 4.6x more effective in hearing back than cold email."
- link "Try Premium for ARS 0"
- button "InMail"
```

There is no `textbox "Write a message…"` in the snapshot. The only way to message 2nd+ connections is via Premium InMail or by sending a connection invite first.

### 3rd degree connections

Same as 2nd degree: InMail upsell, no compose textbox. Additionally, the profile page may not show a "Connect" button at all.

## Reproduction

### Detect connection degree from the profile snapshot

The profile page shows the degree as a paragraph in the snapshot:

```yaml
# 1st degree
- paragraph: "· 1st"

# 2nd degree
- paragraph: "· 2nd"

# 3rd degree
- paragraph: "· 3rd"
```

### Test compose URL for 1st degree

```bash
# Navigate to a 1st degree profile
node scripts/browser.js goto "https://www.linkedin.com/in/<username>/"
playwright-cli snapshot  # Look for "· 1st" in the snapshot

# Extract the compose URL from the Message button
playwright-cli snapshot | grep "messaging/compose"

# Navigate to the compose URL
node scripts/browser.js goto "https://www.linkedin.com/messaging/compose/?profileUrn=<URN>&recipient=<ID>"
playwright-cli snapshot  # Shows: textbox "Write a message…"
```

### Test compose URL for 2nd degree

```bash
# Navigate to a 2nd degree profile
node scripts/browser.js goto "https://www.linkedin.com/in/<username>/"
playwright-cli snapshot  # Look for "· 2nd" in the snapshot

# Navigate to the compose URL
node scripts/browser.js goto "https://www.linkedin.com/messaging/compose/?profileUrn=<URN>&recipient=<ID>"
playwright-cli snapshot  # Shows: heading "Get Hired Faster with Premium", NO textbox
```

## Notes

- The compose URL pattern `?profileUrn=urn:li:fsd_profile:<ID>&recipient=<ID>` is extracted from the profile page's "Message" button `href`.
- For 2nd+ connections, do not attempt to use the compose URL. Use the Voyager API (if you have a thread ID) or send a connection invite first.
- The degree indicator (`· 1st`, `· 2nd`, `· 3rd`) is visible in the profile snapshot and can be used to decide which messaging approach to use before attempting compose.
- A profile may show a "Message" button even for 2nd+ connections, but clicking it or using the compose URL redirects to the InMail upsell.

## Suggested guide update

Add to `linkedin_com/guide.md` under "Messaging" or "Anti-patterns":

> The compose URL (`/messaging/compose/?profileUrn=...`) only works for 1st degree connections. For 2nd+ connections, it shows a Premium InMail upsell with no message textbox. Before using the compose URL, check the connection degree from the profile snapshot (`· 1st`, `· 2nd`, `· 3rd`). For 2nd+ connections, use the Voyager API with a thread ID, or send a connection invite first and wait for acceptance.
