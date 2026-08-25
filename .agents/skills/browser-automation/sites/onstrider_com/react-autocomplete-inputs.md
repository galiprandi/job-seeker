# React autocomplete inputs — onstrider.com

**Date:** 2026-08-17
**Type:** failure-recovery
**Site:** app.onstrider.com

## What was expected

The skill input fields in the "Roles and main skills" modal on Strider's profile page look like standard text inputs (`input[type=text][placeholder="E.g React.js"]`). The expected approach from `key-patterns.md` is to use `fill` or the native value setter pattern for React-controlled inputs:

```bash
# fill approach
node scripts/browser.js exec fill <ref> "Python"

# native value setter approach
node scripts/browser.js exec eval "(function() {
  var input = document.querySelector('#stacks-4');
  var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, 'Python');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
})()"
```

## What was found

Neither `fill` nor the native value setter persists the value. The input is a React-controlled autocomplete that:

1. Accepts the value in the DOM (`input.value` returns the new value immediately after setting)
2. Reverts to the previous value when the input loses focus or `blur` is dispatched
3. Only persists if the user selects an option from the dropdown suggestion list

The working pattern is a 3-step sequence: **type a prefix → wait for the dropdown → click the matching option.**

```bash
# Step 1: Focus the input and type a prefix
node scripts/browser.js exec eval "(async function(){
  var input = document.querySelector('#stacks-<N>');
  input.focus();
  input.click();
  var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, '<PREFIX>');
  input.dispatchEvent(new Event('input', {bubbles: true}));
  return 'typed';
})()"

# Step 2: Wait for the dropdown and click the matching option
node scripts/browser.js exec eval "(async function(){
  await new Promise(r => setTimeout(r, 1000));
  var suggestions = document.querySelectorAll('[role=option], [class*=suggestion], [class*=option]');
  for (var i = 0; i < suggestions.length; i++) {
    if (suggestions[i].textContent.trim() === '<EXACT_OPTION_TEXT>') {
      suggestions[i].click();
      return 'clicked';
    }
  }
  return 'not_found';
})()"
```

The prefix should be short (2-3 chars) to trigger the dropdown without filtering out the target option. For example, `Py` for `Python`, `LL` for `LLM`, `ci` for `CI/CD`.

The option text must match exactly (case-sensitive). Some platforms use different casing than expected (e.g. `TRPC` instead of `tRPC`).

## Reproduction

1. Navigate to `https://app.onstrider.com/profile`
2. Click the "Edit" button next to "Open to roles"
3. Attempt to change a skill input value using `fill` — value reverts on blur
4. Attempt with native value setter + `input`/`change`/`blur` events — value reverts
5. Use the type-prefix + click-option pattern — value persists after Save

## Suggested guide update

Add a new pattern to `references/key-patterns.md` under "Custom components need eval":

**React autocomplete inputs (typeahead/combobox):** Some React autocomplete inputs reject both `fill` and native value setter because the component reverts to the last selected option on blur. The only reliable way to set the value is to type a prefix, wait for the dropdown, and click the matching option. This pattern is needed for any React combobox that uses a controlled value backed by a suggestion list (Strider skill inputs, some Ashby fields, etc.).
