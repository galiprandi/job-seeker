# Business search and phone extraction — google.com/maps

**Date:** 2026-08-15
**Type:** shortcut
**Site:** google.com/maps

## What was expected

The guide did not cover Google Maps automation. The obvious approach would be to search Google for business listings, then visit each business website individually to find contact information — slow and unreliable, as many small businesses lack a website or hide their phone number behind contact forms.

## What was found

Google Maps search results expose business names, addresses, phone numbers, ratings, and review counts directly in the search results DOM. A single `eval` call can extract all listings from a results page without clicking into each one.

### Key patterns discovered

1. **Search URL format:** `https://www.google.com/maps/search/<query>/@<lat>,<lng>,<zoom>z` — the `@lat,lng,zoom` suffix centers the map on a specific area, which is critical for location-scoped searches (e.g., "alquiler" near a specific address).

2. **Results extraction:** Each result is in a `[role="article"]` or `.Nv2PK` element. Business name, address, phone, rating, and review count are all in the card's text content. A single `eval` with `textContent` extraction gets everything in one call.

3. **Phone number format:** Phone numbers appear inline in the card text, typically in the format `0XX XXXX-XXXX` or `0XX XX-XXXX` (Argentine format). They are not in a separate attribute — they must be parsed from the text content.

4. **Pagination:** Results load as you scroll. To get more than the initial ~10 results, scroll the results panel and re-extract.

5. **Multiple search terms:** Different query terms return different businesses. Running 3-4 variations (e.g., "cabañas", "alquiler", "departamento", "inmobiliaria" + location) surfaces businesses that a single query misses.

6. **Direct WhatsApp contact:** Phone numbers extracted from Google Maps can be used to start WhatsApp chats via `https://web.whatsapp.com/send/?phone=<international_number>`. The number must include the country code (e.g., `54` for Argentina) without the `15` mobile prefix. If the number is not on WhatsApp, a dialog appears: "El número <number> no está en WhatsApp."

## Reproduction

```bash
# 1. Search Google Maps with location-scoped query
node scripts/browser.js goto "https://www.google.com/maps/search/<query>/@<lat>,<lng>,17z"
# Wait for results to load
node scripts/browser.js exec eval "(async () => {
  for (let i = 0; i < 30; i++) {
    if (document.querySelector('[role=\"article\"], .Nv2PK')) return 'ready';
    await new Promise(r => setTimeout(r, 500));
  }
  return 'timeout';
})()"

# 2. Extract all business listings in one call
node scripts/browser.js exec eval "async () => {
  const results = [];
  document.querySelectorAll('[role=\"article\"], .Nv2PK').forEach(item => {
    const name = item.querySelector('.qBF1Pd, .fontHeadlineSmall, h3')?.textContent?.trim();
    const text = item.textContent?.substring(0, 400);
    if (name) results.push({name, text});
  });
  return JSON.stringify(results.slice(0, 20));
}"

# 3. For more results, scroll the panel and re-extract
node scripts/browser.js exec eval "async () => {
  const panel = document.querySelector('[role=\"feed\"], .m6QErb');
  if (panel) panel.scrollTop = panel.scrollHeight;
  return 'scrolled';
}"
# Wait 2s, then re-run extraction

# 4. Try different query terms to find more businesses
# Repeat steps 1-3 with: "cabañas", "alquiler", "departamento", "inmobiliaria", "hospedaje", etc.

# 5. Contact via WhatsApp using extracted phone numbers
# Parse phone from the text content, convert to international format
node scripts/browser.js goto "https://web.whatsapp.com/send/?phone=<country_code><area_code><number>"
# If dialog "no está en WhatsApp" appears, the number is invalid for WhatsApp
# If composer appears, the number is valid — send message
```

## Suggested guide update

Add a `sites/google_maps_com/guide.md` covering:
- Search URL format with `@lat,lng,zoom` for location-scoped searches
- Results extraction via `eval` (single call for all cards)
- Scroll-to-load pagination pattern
- Multi-query strategy (different terms surface different businesses)
- Phone number parsing from card text content
- Integration with WhatsApp Web `send/?phone=` for direct contact
- Handling invalid WhatsApp numbers (dialog detection)
