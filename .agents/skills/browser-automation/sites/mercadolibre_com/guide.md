---
name: mercadolibre
description: Automate MercadoLibre (Argentina) with agent-browser. Covers the aggressive bot-wall (headless/datacenter IP blocks, account-verification redirect), headed-mode workaround, meli.la short links, /p/ catalog vs articulo item URL namespaces, product page extraction (price, specs, reviews, sold count), and the public search API. Use when searching products, comparing prices, reading listings, or extracting product data from mercadolibre.com.ar. Part of the browser-automation skill.
verified: 2026-11-12
domains:
  - mercadolibre.com.ar
  - www.mercadolibre.com.ar
  - listado.mercadolibre.com.ar
  - articulo.mercadolibre.com.ar
  - meli.la
---

# MercadoLibre Automation (Argentina)

ML runs one of the most aggressive bot-detection stacks of any LatAm site
(PerimeterX-style). Expect blocks; plan for them.

## The bot wall — read first

Symptoms of being blocked, in order of severity:

1. **"Hubo un error accediendo a esta pagina... Ir a la página principal"** —
   ML error page rendered instead of content. Happens to curl, headless
   Chrome, and flagged sessions alike.
2. **Redirect to `/gz/account-verification?go=...`** — anti-bot interstitial.
   Seen on `listado.`, `articulo.`, `www.`, `meli.la`, and even
   `auth.mercadolibre.com.ar`. Being logged in does NOT bypass it — the
   check runs before auth.

What triggers it (observed 2026-11):

- **Headless Chrome** — ML fingerprints headless even with
  `--disable-blink-features=AutomationControlled`. The same URLs load fine
  in **headed** mode. Always try headed before concluding the IP is burned.
- **Datacenter/flagged IP** — this server's residential IP got flagged after
  heavy scraping; EVERY endpoint 302'd to account-verification for hours,
  curl included. Login cannot fix an IP-level flag.
- **curl / plain HTTP clients** — always 403. Never diagnose ML health with
  curl; only the real browser counts.

Escalation path when blocked:

1. `close` + `open --headed <url>` — headed fingerprint usually passes.
2. If still walled: the IP is flagged. Options: retry later (flags decay),
   use the user's own browser/session, or mobile data (different IP).
3. Do NOT loop retries — it extends the flag.

## URL namespaces — do not confuse

- `articulo.mercadolibre.com.ar/MLA-<id>-<slug>-_JM` — individual seller
  listing (one seller, one price).
- `www.mercadolibre.com.ar/p/MLA<id>` — **catalog product page**: aggregates
  many sellers, shows best-offer price. The `MLA######` here is a DIFFERENT
  id namespace than `MLA-######` items — never equate them.
- `www.mercadolibre.com.ar/up/MLAU...` — universal product page (fashion).
- `meli.la/<code>` — share shortener. Resolves to articulo or /p/ URLs.
  Resolving it requires a working session; when blocked, the redirect target
  can still be recovered from `r.jina.ai/https://meli.la/<code>` output
  (look at `Final URL:`) — that reveals the item/catalog id even when the
  page itself won't render.

## Product page extraction

After `goto` an articulo or /p/ URL, extract with eval:

```js
// Price — ML renders fraction + decimals in separate nodes
[...document.querySelectorAll(
  '.andes-money-amount__fraction,.ui-pdp-price__part,.price-tag-fraction'
)].map(e=>e.innerText.trim()).filter(Boolean).slice(0,5)
// Typically returns [listPrice, listPriceNum, salePrice, salePriceNum]
// e.g. ["$\n1.718.210,\n26","1.718.210","$\n916.654,\n64","916.654"]
// The SECOND pair is usually the real offer price.

// Specs — plain table/list rows with label: value text
[...document.querySelectorAll('tr,li')]
  .map(r=>r.innerText.replace(/\s+/g,' ').trim())
  .filter(x=>x&&x.length>10&&x.length<160&&/procesador|memoria|ssd|núcleo|nucleo|sistema operativo|garant/i.test(x))

// Rating + sold count — regex over body.innerText
// /Calificaci/ block, /\+\d+ vendidos/, /\d+ opiniones/
```

Catalog `/p/` pages show "Calificación X de 5. N opiniones." and aggregate
"+N vendidos" across sellers — good reputation signal.

## Public search API (no auth)

`https://api.mercadolibre.com/sites/MLA/search?q=<query>` works without a
token and returns JSON (`results[]` with id, title, price, seller,
shipping). Useful for discovery; item details (`/items/MLA-...`) and
`/products/MLA...` need an OAuth token.

## Notes

- Prices are ARS and volatile — always quote the same-day value.
- Sponsored cards are not always flagged; `?pdp_filters=deal:MLA...` in the
  URL is the reliable paid-placement signal.
- Shipping: "Llega gratis" varies by item and buyer location.
