# Custom Comboboxes & Portal Dropdowns

Resilient strategy for dropdown widgets that are neither native `<select>` nor standard ARIA comboboxes — the kind used by modern ATS and enterprise forms (EPAM careers, Oracle CX, etc.). Commands below run via `node .agents/skills/browser-automation/scripts/browser.js exec <cmd>` (agent-browser; validated patterns unverified after migration).

## Why these widgets defeat naive automation

1. **Transient portal** — options render in a `div` appended to `document.body` only while the dropdown is open. A blur event (or the next CLI call) unmounts them, so a second command finds an empty DOM.
2. **No standard roles** — many render options as `<div>`/`<li>` without `role=option`/`role=listbox`, so `[role=option]` queries return `[]` even when the list is visible.
3. **Filter-on-type, not select-on-type** — `fill` sets the input text but does not commit a selection; `Enter` alone grabs whatever is highlighted (often the first option), producing silent wrong values (validated: typing "Upper" then Enter selected "Elementary (A1)").
4. **Focus loss between calls** — each `exec` is a separate process. `click` in one call + `press ArrowDown` in the next works *only* if the widget kept focus and the list stayed mounted. It sometimes does — inconsistently. Never rely on it.

## Strategy ladder (try in order)

### 1. Atomic open-inspect-pick (first resort, most reliable)

Open the dropdown and read the options **inside the same eval**, before anything can blur:

```js
(async () => {
  const combo = [...document.querySelectorAll('[role=combobox], input')]
    .find(e => /english/i.test(e.getAttribute('aria-label') || ''));
  combo.focus();
  combo.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
  combo.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}));
  combo.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  await new Promise(r => setTimeout(r, 800));
  // Options live in a portal at document root — scan leaf nodes, not roles
  const opts = [...document.querySelectorAll('body *')]
    .filter(e => e.children.length === 0 && e.offsetHeight > 0
                 && e.innerText && e.innerText.trim().length < 60)
    .filter(e => /intermediate|advanced|fluent|elementary|basic|native/i.test(e.innerText));
  const pick = opts.find(e => /upper.?intermediate|b2/i.test(e.innerText));
  if (pick) { pick.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
              pick.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
              pick.dispatchEvent(new MouseEvent('click', {bubbles: true})); }
  await new Promise(r => setTimeout(r, 400));
  return JSON.stringify({options: opts.map(e => e.innerText.trim()), picked: !!pick});
})()
```

Key points:
- `focus()` + real PointerEvent/MouseEvent sequence — many widgets only open on trusted-looking events.
- Scan **all leaf elements** under `body` for text matches — portal options may have no role attributes at all.
- Verify `picked` in the same call.

### 2. fill + verify (autocomplete-style combos)

When typing filters the option list (EPAM Country/City combos work this way):

```bash
exec click @eN             # open (ref from snapshot -i)
exec fill @eN "Argent"     # filter — use partial, unambiguous text
exec press Enter           # commits the highlighted match
```

Then **immediately** read back the rendered chip/value:

```js
eval: document.body.innerText.slice(idx, idx+150)
// expect: "Country* | option Argentina, selected." — if empty, retry
```

### 3. Keyboard on open list (blind fallback)

Only when options can't be read at all. After opening the list, `ArrowDown` cycles options and `Enter` commits. Verify the resulting value and correct with a second attempt if it landed wrong.

**Never loop blindly** — each attempt must end with a read-back verification; wrong selections are silent and stay wrong.

### 4. Re-focus before every keyboard burst

If `press` keys seem to do nothing, the focus moved. Re-click the combobox, then send keys. If clicking toggles the dropdown closed, use `eval` to check `aria-expanded` or look for the portal before deciding whether to click.

## Verification is mandatory

A combobox "set" is only real when the **committed value** (chip, tag, or readout text like `option X, selected`) appears in `innerText` — not when the input holds text, not when no error fired. Wrong committed values pass silently into the submitted form.

## Anti-patterns (validated failures)

- ❌ `press ArrowDown ×N + Enter` in a separate call after `click` — works sometimes, fails often; the open state doesn't survive process boundaries reliably.
- ❌ `fill` with the exact option text + `Enter` — commits the highlighted option, which may not be your text.
- ❌ Querying `[role=option]` after the dropdown is open via a previous call — the portal is already gone.
- ❌ Querying near the combobox element — options render at document root, not inside the widget.
- ❌ Assuming `aria-label` on the input matches the field label — check the surrounding field wrapper too.
