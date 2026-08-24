---
name: vea
description: Automate Vea supermercado (vea.com.ar). Covers login via Google, delivery mode selection, product search, adding to cart. Vea uses VTEX IO platform with React components. Use when buying groceries online on Vea Argentina.
---

# Vea Supermercado Automation

Automate `vea.com.ar` — online grocery shopping. Vea runs on **VTEX IO** (React-based storefront). The site uses dynamic class names (prefixed with `veaargentina-`) that change between builds, so prefer text-based and role-based selectors over class names.

**Prerequisite:** Read the main Browser Automation guide first for profile-dir setup, the safe wrapper, and golden rules.

## Setup

```bash
# Open Vea (headed for login, headless if already logged in)
node scripts/browser.js open "https://www.vea.com.ar/" --headed

# If login needed: user logs in manually, then save state
node scripts/browser.js save-state
node scripts/browser.js close

# Next sessions: load state and go headless
node scripts/browser.js open "https://www.vea.com.ar/"
node scripts/browser.js load-state
```

## Login

Vea supports Google login and email/password.

```bash
# Click "Mi Cuenta" button (top right area)
node scripts/browser.js exec eval "(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Mi Cuenta')); if (btn) { btn.click(); return 'clicked'; } return 'not_found'; })()"

# Click "Google" button in the login modal
node scripts/browser.js exec eval "(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Google' && b.offsetParent !== null); if (btn) { btn.click(); return 'clicked'; } return 'not_found'; })()"
```

**Google login opens a popup window.** The agent cannot interact with the Google popup (cross-origin). The user must select their Google account manually. After login completes, the page shows "Hola, <Name>" in the account button.

**Verification:** Check if the account button contains "Hola":
```bash
node scripts/browser.js exec eval "(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Hola')); return btn ? btn.textContent.trim() : 'not_logged_in'; })()"
```

## Delivery mode selection (required after first login)

After login, a modal appears asking "¿Cómo querés recibir tu pedido?" with two options:
- **Recibirlo a domicilio** — minimum purchase $20.000
- **Retirar en una tienda** — minimum purchase $10.000

The modal uses class prefix `veaargentina-delivery-modal-1-x-`. The options are inside `<p>` tags with class `veaargentina-delivery-modal-1-x-deliveryText`, wrapped in `<div class="veaargentina-delivery-modal-1-x-deliveryInfo">`.

```bash
# Click "Recibirlo a domicilio" (home delivery)
node scripts/browser.js exec eval "(() => { const el = Array.from(document.querySelectorAll('p')).find(p => p.textContent.trim() === 'Recibirlo a domicilio'); if (el) { const clickable = el.closest('[class*=\"deliveryInfo\"]') || el.parentElement; clickable.click(); return 'clicked'; } return 'not_found'; })()"

# Click "Retirar en una tienda" (store pickup)
node scripts/browser.js exec eval "(() => { const el = Array.from(document.querySelectorAll('p')).find(p => p.textContent.trim() === 'Retirar en una tienda'); if (el) { const clickable = el.closest('[class*=\"deliveryInfo\"]') || el.parentElement; clickable.click(); return 'clicked'; } return 'not_found'; })()"
```

**Note:** The modal says "Antes de finalizar la compra te pediremos que nos lo confirmes" — the selection can be changed later at checkout.

## Product search

The search bar is a combobox with placeholder "¡Hola! ¿Qué estás buscando?".

```bash
# Find the search input (by placeholder)
node scripts/browser.js exec eval "(() => { const input = document.querySelector('input[placeholder*=\"buscando\"]') || document.querySelector('input[placeholder*=\"Hola\"]'); return input ? 'found' : 'not_found'; })()"

# Search for a product (fill + Enter)
# Use the find command to get the ref, then fill + submit
node scripts/browser.js exec find "¿Qué estás buscando?"
# Then: node scripts/browser.js exec fill <ref> "café instantáneo dorca" --submit

# Or directly via eval:
node scripts/browser.js exec eval "(() => { const input = document.querySelector('input[placeholder*=\"buscando\"]'); if (input) { input.focus(); input.value = 'café instantáneo dorca'; input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); return 'searched'; } return 'not_found'; })()"
```

**Search URL pattern:** `https://www.vea.com.ar/<query>?_q=<query>&map=ft` — can navigate directly for faster results.

```bash
# Direct URL navigation (faster than UI search)
node scripts/browser.js goto "https://www.vea.com.ar/cafe%20instantaneo%20dorca?_q=cafe%20instantaneo%20dorca&map=ft"
```

## Product listing and add to cart

Products are rendered as `region` elements with `aria-label` starting with "Producto". Each product has:
- A link with the product name (navigates to product page)
- An "Agregar" button (adds to cart directly)
- A "Ver Producto" button (opens product detail)

```bash
# Get all visible products with names and prices
node scripts/browser.js exec eval "(() => {
  const regions = Array.from(document.querySelectorAll('[aria-label*=\"Producto\"]'));
  return JSON.stringify(regions.map(r => {
    const link = r.querySelector('a');
    const addBtn = Array.from(r.querySelectorAll('button')).find(b => b.textContent.trim() === 'Agregar');
    const priceText = r.textContent.match(/\\\$[\\d.,]+/);
    return {
      name: link?.textContent.trim().substring(0, 80) || null,
      href: link?.getAttribute('href') || null,
      hasAddButton: !!addBtn,
      price: priceText ? priceText[0] : null
    };
  }));
})()"

# Add first product to cart
node scripts/browser.js exec eval "(() => {
  const regions = Array.from(document.querySelectorAll('[aria-label*=\"Producto\"]'));
  if (!regions.length) return 'no products';
  const addBtn = Array.from(regions[0].querySelectorAll('button')).find(b => b.textContent.trim() === 'Agregar');
  if (addBtn) { addBtn.click(); return 'added'; }
  return 'no add button';
})()"
```

**Verification after adding:** The cart counter (button showing "0" initially) should increment. Check:
```bash
node scripts/browser.js exec eval "(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '0' || /^\\d+$/.test(b.textContent.trim())); return btn ? btn.textContent.trim() : 'cart_not_found'; })()"
```

## VTEX IO platform notes

Vea runs on VTEX IO. Key characteristics:
- **Dynamic class names:** Prefixed with `veaargentina-` followed by component path (e.g. `veaargentina-delivery-modal-1-x-deliveryText`). These change between builds — don't rely on exact class names, use text content or aria-labels instead.
- **React rendering:** Content loads asynchronously. Wait for elements with in-page polling (Rule 2), don't assume the page is ready after `goto`.
- **Combobox search:** The search input is inside a combobox component. `fill` + `--submit` works, but direct URL navigation is faster and more reliable.
- **Product regions:** Products use `role="region"` with `aria-label="Producto<name>"`. This is the most stable selector.
- **Login popup:** Google login opens a cross-origin popup the agent cannot control. User must complete login manually.

## Anti-patterns

- **Don't** rely on exact class names (e.g. `veaargentina-delivery-modal-1-x-deliveryText`) — they change between VTEX builds. Use text content or aria-labels.
- **Don't** try to interact with the Google login popup — it's cross-origin and blocked. Let the user complete login.
- **Don't** assume the delivery modal appears every time — it only shows on first login or when no delivery method is set.
- **Don't** use `document.querySelector('input[type="search"]')` — the search input is `type="text"` inside a combobox, not a search input.
- **Don't** navigate to `/login` directly — it redirects to home. Use the "Mi Cuenta" button instead.

## Validation

- **Validated:** 2026-08-23 against live site
- **Login flow:** Google popup — user completes manually
- **Delivery modal:** Text-based selectors for "Recibirlo a domicilio" / "Retirar en una tienda"
- **Product search:** URL navigation + combobox fill both work
- **Product structure:** `aria-label="Producto<name>"` regions with "Agregar" buttons
