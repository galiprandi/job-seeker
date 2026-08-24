---
name: google_maps
description: Automate Google Maps for distance verification, business search, and phone number extraction.
---

# Google Maps Automation Guide

> **Prerequisite:** Read the parent [SKILL.md](../../SKILL.md) for golden rules, wrapper usage, and session management.

## Setup

```bash
node scripts/browser.js goto "https://www.google.com/maps"
```

No login required for basic search and directions.

## Core flows

### Verify distance between two addresses

Navigate to directions with origin and destination:

```bash
node scripts/browser.js goto "https://www.google.com/maps/dir/<ORIGIN>/<DESTINATION>"
```

URL-encode addresses with `+` for spaces and `%C3%B3` for accented characters.

Example: `https://www.google.com/maps/dir/Cobo+285+Nueva+Atlantis/Hip%C3%B3lito+Yrigoyen+2941+Nueva+Atlantis`

Extract distance from page text:

```javascript
async () => {
  const text = document.body.innerText;
  const distMatch = text.match(/(\d+[.,]?\d*\s*(km|m))/g);
  return JSON.stringify({
    dists: distMatch?.slice(0, 5),
    snippet: text.substring(0, 400)
  });
}
```

The first meaningful distance in the array is typically the walking/driving route distance.

### Search for a business and extract phone number

```bash
node scripts/browser.js goto "https://www.google.com/maps/search/<BUSINESS_NAME>+<LOCATION>"
```

Extract phone from the business card:

```javascript
async () => {
  const text = document.body.innerText;
  // Phone patterns: Argentine landline (0XXX XXX-XXXX), mobile (15-XXXX-XXXX), international
  const phoneMatch = text.match(/(\+?\d[\d\s\-]{8,}\d)/g);
  return JSON.stringify({phones: phoneMatch?.slice(0, 5)});
}
```

### Use exact coordinates for precise distance

When a street address is ambiguous or returns wrong results, use exact coordinates:

```bash
node scripts/browser.js goto "https://www.google.com/maps/dir/-36.7683815,-56.6766244/<DESTINATION>"
```

This avoids the problem of Google Maps resolving a generic street name to the wrong segment.

## Gotchas and anti-patterns

### Generic street queries produce misleading routes

**Problem:** Searching `Lebensohn Nueva Atlantis` may resolve to a different part of the street that is far from the actual location, returning a distance of 2+ km when the real distance is 400m.

**Solution:** Use exact coordinates from the map pin, or a more specific address with a street number.

### "Google Maps no encuentra..." error

**Problem:** Some address formats are not recognized (e.g. `Lebensohn y Cobo Nueva Atlantis` with the `y` intersection format).

**Solution:** Try alternative formats:
- `Cobo 285 Nueva Atlantis` (street + number)
- `-36.7655,-56.6757` (coordinates)
- `Cobo+Nueva+Atlantis` (street name only, less precise)

### Multiple distances in the result

**Problem:** The regex returns multiple distance values (e.g. `1 m`, `2 m`, `170 m`). The first few are UI noise (zoom levels, nearby places), not the route distance.

**Solution:** Look for the distance that appears alongside a time estimate (e.g. `2 min` + `170 m`). That is the actual route. The snippet text usually contains `por <street names>` after the correct distance.

### Directions page shows multiple route options

**Problem:** Google Maps shows 2-3 route alternatives with different distances.

**Solution:** The first distance in the snippet (after the UI noise) is usually the fastest/shortest route. Read the snippet text to identify which is labeled "La ruta más rápida" or "Mejor".

### Business phone numbers in different formats

**Problem:** Argentine phone numbers appear in multiple formats:
- Landline: `02257 66-8376`
- Mobile: `011 15-5057-0897`
- International: `+54 9 11 5057-0897`
- WhatsApp normalized: `+54 9 11 5057-0897` (15 prefix removed, 9 added)

**Solution:** Normalize all numbers to international format for WhatsApp: `+54 9 <area> <number>` (remove leading `15`, add `9` after `54` for mobiles).

### Business search returns results in wrong town

**Problem:** Searching for a business name may return a similarly-named business in a different town.

**Solution:** Always include the location in the search query. Verify the address shown in the business card matches the expected town before extracting data.

## Validation

**Validated:** 2026-08-17 against live Google Maps.

## Anti-patterns

- **Do NOT trust generic street queries** for distance verification. Use exact addresses or coordinates.
- **Do NOT assume the first distance in the regex** is the route distance. Filter out UI noise (1m, 2m, 4m values).
- **Do NOT extract phone numbers without verifying** the business is in the correct location.
- **Do NOT use intersection format** (`StreetA y StreetB`) in directions URLs. Use `StreetA + number` or coordinates instead.
