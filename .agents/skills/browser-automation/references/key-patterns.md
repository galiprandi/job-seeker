# Key Patterns

### Always get fresh refs before interacting

Refs (`@eN`) change after every action (click, fill, navigate, even async updates). Never reuse a ref from a previous snapshot or find.

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find text "Compose"    # get fresh ref
node .agents/skills/browser-automation/scripts/browser.js exec click @e5              # use ref from THIS find
# ref is now stale, get a new one
node .agents/skills/browser-automation/scripts/browser.js exec find label "To"        # get fresh ref
node .agents/skills/browser-automation/scripts/browser.js exec fill @e8 "text"        # use new ref
```

Prefer `find <locator> <value> <action>` (find + act in one call) so no ref crosses calls at all:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find text "Compose" click
node .agents/skills/browser-automation/scripts/browser.js exec find placeholder "To" fill "user@example.com"
```

### Wait for page load

After `goto` or `click` that triggers navigation, use `wait --fn` or in-page polling (Rule 2):

```bash
node .agents/skills/browser-automation/scripts/browser.js goto "https://example.com"
node .agents/skills/browser-automation/scripts/browser.js exec wait --fn "!!document.querySelector('[data-loaded]')"
```

Or with `eval`:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('[data-loaded]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

For SPA navigation (URL doesn't change but content updates), use `eval` to check:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "document.querySelector('[data-loaded]') ? 'ready' : 'loading'"
```

### Typing into elements

Three tools, in order of preference:

```bash
# 1. keyboard type — real keystrokes into the FOCUSED element (best for editors/chat boxes)
node .agents/skills/browser-automation/scripts/browser.js exec focus "div[role=textbox]"
node .agents/skills/browser-automation/scripts/browser.js exec keyboard type "message text"

# 2. fill <sel|@ref> — clears and sets value (best for plain inputs)
node .agents/skills/browser-automation/scripts/browser.js exec fill "input[type=email]" "user@example.com"

# 3. type <sel> — types into a named element without clearing
node .agents/skills/browser-automation/scripts/browser.js exec type "input[name=q]" "query"
```

### Custom components need eval

Some sites use custom web components (Google Search, LinkedIn tiptap editor, React widgets). `fill` and `type` may not work on them. Use `eval` as fallback:

```bash
# If fill doesn't work on a custom input
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function() {
  const el = document.querySelector('[role=textbox]');
  el.innerHTML = 'text';
  el.dispatchEvent(new Event('input', {bubbles: true}));
})()"
```

**React-controlled inputs need native value setter:**
```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function() {
  const el = document.querySelector('input');
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(el, 'your value');
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()"
```

### Buttons that ignore plain .click()

Some buttons (Gmail send, custom UI) require a mousedown -> click -> mouseup sequence:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(function() {
  const btn = document.querySelector('div[role=button]');
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
})()"
```

### Key names

`press` uses `+` chords with `Control`, `Alt`, `Shift`, `Meta` (not `Ctrl`, `Cmd`, or `ControlOrMeta`):

```bash
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
node .agents/skills/browser-automation/scripts/browser.js exec press "Control+Enter"   # send (Gmail)
node .agents/skills/browser-automation/scripts/browser.js exec press "Meta+Enter"      # send (macOS-style, Teams)
node .agents/skills/browser-automation/scripts/browser.js exec press "Shift+Enter"     # newline in chat
node .agents/skills/browser-automation/scripts/browser.js exec press "Control+x"       # cut
```
