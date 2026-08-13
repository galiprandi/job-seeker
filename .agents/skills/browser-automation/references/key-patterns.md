# Key Patterns

### Always get fresh refs before interacting

Refs (`[ref=eXXX]`) change after every action (click, fill, navigate, even async updates). Never reuse a ref from a previous snapshot or find.

```bash
node scripts/browser.js exec find "Compose"    # get fresh ref
node scripts/browser.js exec click <ref>       # use ref from THIS find
# ref is now stale, get a new one
node scripts/browser.js exec find "To"         # get fresh ref
node scripts/browser.js exec fill <ref> "text" # use new ref
```

### Wait for page load

After `goto` or `click` that triggers navigation, use in-page polling (Rule 2):

```bash
node scripts/browser.js goto "https://example.com"
node scripts/browser.js exec eval "(async function(){
  for (let i = 0; i < 50; i++) {
    if (document.querySelector('[data-loaded]')) return 'ready';
    await new Promise(r => setTimeout(r, 200));
  }
  return 'timeout';
})()"
```

For SPA navigation (URL doesn't change but content updates), use `eval` to check:

```bash
node scripts/browser.js exec eval "() => document.querySelector('[data-loaded]') ? 'ready' : 'loading'"
```

### Custom components need eval

Some sites use custom web components (Google Search, LinkedIn tiptap editor, React widgets). `fill` and `type` may not work on them. Use `eval` as fallback:

```bash
# If fill doesn't work on a custom input
node scripts/browser.js exec eval "(function() {
  const el = document.querySelector('[role=textbox]');
  el.innerHTML = 'text';
  el.dispatchEvent(new Event('input', {bubbles: true}));
})()"
```

**React-controlled inputs need native value setter:**
```bash
node scripts/browser.js exec eval "(function() {
  const el = document.querySelector('input');
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(el, 'your value');
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()"
```

### Buttons that ignore plain .click()

Some buttons (Gmail send, custom UI) require a mousedown -> click -> mouseup sequence:

```bash
node scripts/browser.js exec eval "(function() {
  const btn = document.querySelector('div[role=button]');
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
})()"
```
