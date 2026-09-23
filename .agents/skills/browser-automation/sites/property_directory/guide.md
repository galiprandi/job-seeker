---
name: property-directory
description: Scrape property rental directories for owner contacts, addresses, and WhatsApp links.
verified: 2026-09-02
---

# Property Directory Scraping Guide

## Use case

Directory sites (e.g. `alquileresnuevaatlantis.com.ar`) list property owners with:
- Owner name
- Property address
- WhatsApp link (`wa.me/<phone>`)
- Social media links
- "Ver Detalle" link to property page

## Core flows

### Extract all listings with WhatsApp links

```javascript
async () => {
  const cards = document.querySelectorAll('a[href*="wa.me"]');
  const results = [];
  const seen = new Set();
  cards.forEach(a => {
    const card = a.closest('article, div[class*="card"], div[class*="property"]')
      || a.parentElement?.parentElement?.parentElement;
    if (!card) return;
    const text = card.textContent || '';
    const name = text.split(/(?:Ver en|WhatsApp|Llamar|Ver Detalle)/)[0]?.trim().substring(0, 40) || '';
    const addr = text.match(/(?:Lebensohn|Hipolito|Cobo|Roldan)\s*\d+/i)?.[0] || '';
    const phone = a.href.match(/wa\.me\/(\d+)/)?.[1] || '';
    const key = phone || addr;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({name, addr, phone});
  });
  return JSON.stringify(results);
}
```

### Filter by address proximity

Define target streets (parallel to the reference point) and filter:

```javascript
const TARGET_STREETS = ['Lebensohn', 'Lebenshon', 'Hipolito Yrigoyen', 'Hipólito Yrigoyen', 'Cobo', 'Roldán', 'Roldan'];
```

Each match is approximately one block (~100m) from the reference point.

### Extract phone numbers for WhatsApp messaging

The `wa.me/<phone>` URL format uses international format without `+` or spaces. Convert to `send?phone=` URL:

```
wa.me/541158519822  →  web.whatsapp.com/send?phone=541158519822
```

### Bulk contact pattern

1. Scrape all listings from the directory page
2. Filter by target streets
3. Cross-reference against existing contacts (avoid duplicates)
4. For each new contact, open WhatsApp and send a templated message
5. Log each contact in a tracking file

```bash
for phone in <PHONE1> <PHONE2> <PHONE3>; do
  node .agents/skills/browser-automation/scripts/browser.js goto "https://web.whatsapp.com/send?phone=$phone"
  sleep 5
  # Fill compose box and send
  # See whatsapp_com/guide.md for message sending flow
done
```

## Gotchas

### Duplicate cards

**Problem:** The same listing may appear multiple times in the DOM (e.g. in both list and map views).

**Solution:** Use a `Set` to deduplicate by phone number or address before returning results.

### Name extraction is fragile

**Problem:** The owner name is mixed with button labels ("Ver en la red social", "WhatsApp", "Llamar", "Ver Detalle de la Propiedad").

**Solution:** Split on these known labels and take the first segment as the name. Truncate to 40 chars to avoid garbage.

### Address format varies

**Problem:** Addresses may use different spellings: "Lebensohn" vs "Lebenshon", "Hipolito Yrigoyen" vs "Hipólito Yrigoyen".

**Solution:** Use case-insensitive regex with alternate spellings when matching addresses.

## Validation

**Validated:** 2026-08-21 against `alquileresnuevaatlantis.com.ar` (74 listings extracted).
