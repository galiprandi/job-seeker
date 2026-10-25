---
name: vea
description: Automate Vea supermercado (vea.com.ar). Covers login via Google, delivery mode selection, product search, adding to cart. Vea uses VTEX IO platform with React components. Use when buying groceries online on Vea Argentina.
verified: 2026-09-02
domains:
  - vea.com.ar
  - www.vea.com.ar
---

# Vea Supermercado Automation

Automate `vea.com.ar` - online grocery shopping. Vea runs on **VTEX IO** (React-based storefront). The site uses dynamic class names (prefixed with `veaargentina-`) that change between builds, so prefer text-based and role-based selectors over class names.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

## Setup

```bash
# Open Vea (headed for login, headless if already logged in)
node .agents/skills/browser-automation/scripts/browser.js open "https://www.vea.com.ar/" --headed

# If login needed: user logs in manually, then save state
node .agents/skills/browser-automation/scripts/browser.js close

# Next sessions: load state and go headless
node .agents/skills/browser-automation/scripts/browser.js open "https://www.vea.com.ar/"
```

## Login

Vea supports Google login and email/password.

```bash
# Click "Mi Cuenta" button (top right area) - semantic first
node .agents/skills/browser-automation/scripts/browser.js exec find text "Mi Cuenta" click

# Click "Google" button in the login modal
node .agents/skills/browser-automation/scripts/browser.js exec find text "Google" click
```

If `find` matches more than one element (e.g. "Google" elsewhere on the page), take `exec snapshot -i` and click the specific `@eN` ref of the button inside the login modal.

**Google login opens a popup window.** The agent cannot interact with the Google popup (cross-origin). The user must select their Google account manually. After login completes, the page shows "Hola, <Name>" in the account button.

**Verification:** Check if the account button contains "Hola":
```bash
node .agents/skills/browser-automation/scripts/browser.js exec wait --text "Hola"
# or:
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Hola')); return btn ? btn.textContent.trim() : 'not_logged_in'; })()"
```

## Delivery mode selection (required after first login)

After login, a modal appears asking "¿Cómo querés recibir tu pedido?" with two options:
- **Recibirlo a domicilio** - minimum purchase $20.000
- **Retirar en una tienda** - minimum purchase $10.000

The modal uses class prefix `veaargentina-delivery-modal-1-x-`. The options are inside `<p>` tags with class `veaargentina-delivery-modal-1-x-deliveryText`, wrapped in `<div class="veaargentina-delivery-modal-1-x-deliveryInfo">`.

```bash
# Click "Recibirlo a domicilio" (home delivery)
node .agents/skills/browser-automation/scripts/browser.js exec find text "Recibirlo a domicilio" click

# Click "Retirar en una tienda" (store pickup)
node .agents/skills/browser-automation/scripts/browser.js exec find text "Retirar en una tienda" click
```

If `find` clicks the text node but not the clickable wrapper, fall back to `exec snapshot -i` and click the `@eN` ref of the `deliveryInfo` container, or `exec eval` clicking `el.closest('[class*="deliveryInfo"]')`.

**Note:** The modal says "Antes de finalizar la compra te pediremos que nos lo confirmes" - the selection can be changed later at checkout.

## Product search

The search bar is a combobox with placeholder "¡Hola! ¿Qué estás buscando?".

```bash
# Locate and fill the search input by placeholder (semantic)
node .agents/skills/browser-automation/scripts/browser.js exec find placeholder "buscando" fill "café instantáneo dorca"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter

# Or via snapshot refs: exec snapshot -i, find the combobox @eN, then:
node .agents/skills/browser-automation/scripts/browser.js exec fill @eN "café instantáneo dorca"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

**`fill` appends:** if the combobox has previous text, clear it first (Ctrl+A then type, or `exec eval` with native value setter + input event).

**Search URL pattern:** `https://www.vea.com.ar/<query>?_q=<query>&map=ft` - can navigate directly for faster results.

```bash
# Direct URL navigation (faster than UI search)
node .agents/skills/browser-automation/scripts/browser.js goto "https://www.vea.com.ar/cafe%20instantaneo%20dorca?_q=cafe%20instantaneo%20dorca&map=ft"
```

## Product listing and add to cart

Products are rendered as `region` elements with `aria-label` starting with "Producto". Each product has:
- A link with the product name (navigates to product page)
- An "Agregar" button (adds to cart directly)
- A "Ver Producto" button (opens product detail)

```bash
# Semantic: list products via snapshot, then click "Agregar" on the right one
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i
# Identify the product region and its "Agregar" @eN ref, then:
node .agents/skills/browser-automation/scripts/browser.js exec click @eN
```

For bulk listing (names + prices), `exec eval` is acceptable:

```bash
# Get all visible products with names and prices
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  const regions = Array.from(document.querySelectorAll('[aria-label*=\"Producto\"]'));
  return JSON.stringify(regions.map(r => {
    const link = r.querySelector('a');
    const addBtn = Array.from(r.querySelectorAll('button')).find(b => b.textContent.trim() === 'Agregar');
    const priceText = r.textContent.match(/\\$[\\d.,]+/);
    return {
      name: link?.textContent.trim().substring(0, 80) || null,
      href: link?.getAttribute('href') || null,
      hasAddButton: !!addBtn,
      price: priceText ? priceText[0] : null
    };
  }).filter(p => p.href || p.hasAddButton));
})()"
```

**Verification after adding:** The cart counter should increment. Click it to open the minicart:
```bash
node .agents/skills/browser-automation/scripts/browser.js exec snapshot -i   # find the cart counter button @eN
node .agents/skills/browser-automation/scripts/browser.js exec click @eN
# Empty minicart shows "Su carrito se encuentra vacío"
node .agents/skills/browser-automation/scripts/browser.js exec wait --text "carrito"
```

## VTEX IO platform notes

Vea runs on VTEX IO. Key characteristics:
- **Dynamic class names:** Prefixed with `veaargentina-` followed by component path (e.g. `veaargentina-delivery-modal-1-x-deliveryText`). These change between builds - don't rely on exact class names, use text content or aria-labels instead.
- **React rendering:** Content loads asynchronously. Wait for elements (`exec wait --text/--fn`), don't assume the page is ready after `goto`.
- **Combobox search:** The search input is inside a combobox component. `find placeholder` + `fill` + `press Enter` works, but direct URL navigation is faster and more reliable.
- **Product regions:** Products use `role="region"` with `aria-label="Producto<name>"`. This is the most stable selector.
- **Login popup:** Google login opens a cross-origin popup the agent cannot control. User must complete login manually.

## Anti-patterns

- **Don't** rely on exact class names (e.g. `veaargentina-delivery-modal-1-x-deliveryText`) - they change between VTEX builds. Use text content or aria-labels.
- **Don't** try to interact with the Google login popup - it's cross-origin and blocked. Let the user complete login.
- **Don't** assume the delivery modal appears every time - it only shows on first login or when no delivery method is set.
- **Don't** use `document.querySelector('input[type="search"]')` - the search input is `type="text"` inside a combobox, not a search input.
- **Don't** navigate to `/login` directly - it redirects to home. Use the "Mi Cuenta" button instead.

## Validation

- **Validated:** 2026-08-23 against live site
- **Login flow:** Google popup - user completes manually
- **Delivery modal:** Text-based selectors for "Recibirlo a domicilio" / "Retirar en una tienda"
- **Product search:** URL navigation + combobox fill both work
- **Product structure:** `aria-label="Producto<name>"` regions with "Agregar" buttons

## agent-browser notes (verified 2026-10-24)
- `fill` appends: if the combobox has previous text, clear first (native setter + input event or Ctrl+A).
- Refs come from `exec snapshot -i` (`[ref=eN]` → `@eN`); `exec find` supports `role|text|label|placeholder` + an action (`click`, `fill`, etc.).
- `h1` on product detail/category pages is the promo banner, not the product name - use `document.title` or the region's aria-label.
- First `[aria-label*="Producto"]` may be an empty skeleton - filter by href/"Agregar" button present.
- Minicart: click the counter button; empty says "Su carrito se encuentra vacío".
- Vea session is not currently logged in - delivery/login/real-cart flows require a prior headed manual login.
