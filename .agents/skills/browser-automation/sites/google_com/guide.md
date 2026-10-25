---
domains:
  - google.com
  - www.google.com
---

# google.com / google.com/search — site guide

**Interaction doctrine (semantic-first):** 1) site keyboard shortcuts 2) `find` semantic locators 3) `snapshot -i` @eN refs 4) `eval` as last resort only, with exact aria-label/data-testid selectors (never positional).

## Search (verified 2026-10-24)

- Search box is a combobox labeled `Buscar` (EN: `Search`). Fill it semantically and press Enter:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec find combobox "Buscar" fill "your query"
node .agents/skills/browser-automation/scripts/browser.js exec press Enter
```

- Alternative: `exec snapshot -i` → `exec fill @eN "your query"` → `exec press Enter`.
- SERP: filters appear as links ("News", "Images", "Shopping", "Videos") plus a "Herramientas"/"Tools" button; the combobox persists with the query.
- Result extraction: links inside `main`, under heading "Resultados de búsqueda" / "Search results". Prefer `exec read` or `exec snapshot` over eval.
- `fill` appends: clear the input before re-searching (`press "Control+a"` then fill, or `keyboard type` after select-all).
