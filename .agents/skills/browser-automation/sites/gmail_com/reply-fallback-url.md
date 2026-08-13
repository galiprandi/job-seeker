# Reply button intermittently fails to open compose — gmail.com

**Date:** 2026-08-13
**Type:** fallback
**Site:** gmail.com

## What was expected

Clicking the "Responder" / "Reply" button on an open email reliably opens the reply compose box with the recipient pre-filled and the cursor in the message body.

## What was found

The Reply button click is **intermittent**. In some sessions, clicking `button[aria-label="Responder"]` opens the reply compose box normally (`textbox "Cuerpo del mensaje"` appears). In other sessions, the click does nothing — no compose box appears, no error, the button just doesn't trigger the reply UI.

This is not a selector issue (the button is found and clicked successfully). The click event fires but Gmail's internal state sometimes doesn't react. This may be related to Gmail's heavy SPA architecture, timing, or internal state management.

When the Reply button fails, the **compose URL** is a reliable fallback that opens a new compose window with all fields pre-filled.

## Reproduction

### 1. The compose URL fallback

```
URL: https://mail.google.com/mail/u/0/?view=cm&fs=1&to=<email>&su=<subject>&body=<body>
```

Parameters:
- `view=cm` — open in compose mode
- `fs=1` — fullscreen compose
- `to=<email>` — recipient email (URL-encoded)
- `su=<subject>` — subject line (URL-encoded)
- `body=<body>` — message body (URL-encoded)

### 2. Navigate to the compose URL

```bash
node scripts/browser.js goto "https://mail.google.com/mail/u/0/?view=cm&fs=1&to=<email>&su=Test%20subject&body=Test%20body"
# Wait for compose to load
playwright-cli eval "(async function(){
  for (let i = 0; i < 25; i++) {
    if (document.querySelector('div[contenteditable=true]') || document.querySelector('textarea[name=\"to\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

### 3. Verify the compose window

The snapshot shows:

```yaml
- region "Test subject":
  - generic: "<Recipient Name> (<email>)"  # To field auto-resolved
  - textbox "Asunto": "Test subject"        # Subject pre-filled
  - textbox "Cuerpo del mensaje" [active]   # Body ready for input
  - button "Enviar (⌘Enter)"                # Send button
```

### 4. Fill and send via the compose URL

The compose URL pre-fills `to`, `su`, and `body`. If you need to modify the body after opening:

```bash
# The body is a contenteditable div (same as reply body)
playwright-cli eval "(function(){
  const el = document.querySelector('div[contenteditable=true]');
  if (!el) return 'not found';
  el.innerHTML = 'Your message here';
  el.dispatchEvent(new InputEvent('input', {bubbles: true}));
  return 'filled';
})()"

# Click Send
playwright-cli eval "(function(){
  const btn = document.querySelector('div[role=button][aria-label*=\"Enviar\"]');
  if (btn) { btn.click(); return 'sent'; }
  return 'not found';
})()"
```

## Notes

- The compose URL uses `?view=cm` which opens a **new compose** (not a reply). The email will not be threaded as a reply to the original conversation. If threading is important, use the Reply button and only fall back to compose URL if it fails.
- The `to` parameter auto-resolves to the recipient's name if they are in your contacts.
- The `body` parameter is plain text. For HTML formatting, set `innerHTML` after the compose opens.
- Gmail also has a `beforeunload` dialog when discarding drafts: `button "Descartar borrador"` → `dialog "¿Salir sin guardar cambios?"` → `dialog-accept` to confirm.
- The compose URL works for both reply fallback and new email composition.

## Suggested guide update

Add to `gmail_com/guide.md` under "Replying to emails" or as a new "Fallback" section:

> The Reply button (`button[aria-label="Responder"]`) intermittently fails to open the compose box. When this happens, use the compose URL as a fallback: `https://mail.google.com/mail/u/0/?view=cm&fs=1&to=<email>&su=<subject>&body=<body>`. This opens a new compose window with all fields pre-filled. Note that the email will not be threaded as a reply — use this only when the Reply button fails and threading is not critical.
