---
name: careers-epam-com
description: EPAM Careers application wizard automation (7-step modal, CV prefill, portal comboboxes, consent trap).
verified: 2026-10-20
domains:
  - careers.epam.com
---

# EPAM Careers (careers.epam.com)

Prerequisite: read parent `SKILL.md` for golden rules and wrapper commands. For the combobox strategy see `references/custom-combobox.md`. All commands via `node .agents/skills/browser-automation/scripts/browser.js exec <cmd>`.

## Setup

No login required to apply. Open the vacancy URL (`careers.epam.com/en/vacancy/<slug>?country=<cc>`), `exec find text "apply" click` — a modal wizard opens.

## Keyboard shortcuts

None validated on this site (checked 2026-10-20 — no published shortcut list, common patterns don't apply). Use `exec press Tab`/`Enter`/`ArrowDown` standard form navigation only.

## Apply wizard (7 steps)

**Step 1 — Upload:** LinkedIn URL textbox + "Upload your CV in English" control. Locate the `input[type=file]` via `exec snapshot -i`, then `exec upload @eN "<cv-path>"`. The CV is parsed server-side ("Analysing your CV", ~10s) and **prefills most of the wizard** — name, skills, experience, location. Wait for parse (`exec wait --text` or `exec wait <ms>`) before advancing.

**Step 2 — Personal & Contact:** Names prefilled. Fill `Phone number*` (digits only; country code is a separate dropdown, usually correct) and `Email*` via `exec find label "<field>" fill "<value>"`.

**Step 3 — Location & Relocation:** `Country*` and `City*` are filter-comboboxes — `exec fill @eN "Argentina"` then `exec press Enter` selects the matching option (verified on playwright; unverified after agent-browser migration). The CV may prefill the WRONG country — always verify the committed chip before Next.

**Step 4 — Background:** Primary/Secondary skills prefilled from CV. `Relevant Experience in Primary skill*` often prefills "0 years" — fix with `exec fill @eN "3"` + `exec press Enter`.

**Step 5 — Employment History:** Update "Most recent employer" + "Job Title" (CV shows a stale employer) + `Expected Monthly Compensation (Gross)*` (currency dropdown defaults to USD).

**Step 6 — Additional Info:** `English level*` is a **portal combobox that resists standard automation** — see below. `Preferred place of work` accepts `fill "Remote"` + `Enter`. Optional `X profile` / `Website URL` textboxes.

**Step 7 — Preview & Consent:** required consent checkbox (see trap) + `exec find text "Submit" click`. Success = thank-you text and the modal closes (URL returns to the vacancy page, form gone).

## Known traps

### English level combobox (Step 6)

Options render in a **transient portal at document root** with no `role=option`/`role=listbox` markup. It defeats `fill`, `press ArrowDown` sent in separate CLI calls, and `[role=option]`/`[role=listbox]` DOM queries. Blind keyboard bursts land on unpredictable options (verified: identical sequences produced both "Elementary (A1)" and "Upper-intermediate (B2)"). Use the atomic open-inspect-pick eval from `references/custom-combobox.md` — or ask the user to pick it (2 clicks) rather than risk a wrong committed value.

### Consent checkbox (Step 7)

The required consent label contains a link to the Privacy Notice. **Clicking the label text navigates to `epam.com/applicant-privacy-notice` and destroys all wizard state** — no draft is saved; verified twice, full wizard lost both times. Click ONLY the checkbox square element (the small `[cursor=pointer]` span to the left of the label text — find its `@eN` ref in `exec snapshot -i`), never the paragraph or link. Browser `back` does not restore the wizard.

### Cookie banner

"Accept All" must be dismissed first or it intercepts clicks on modal elements.

## Anti-patterns

- ❌ Clicking the consent label/paragraph — navigates away, destroys the wizard (irrecoverable).
- ❌ `fill <combo> "<exact option>"` + `Enter` — commits the highlighted option, not the typed text (selected wrong English level silently).
- ❌ Opening a dropdown and inspecting options in a separate call — the portal unmounts on blur between processes.
- ❌ Trusting CV-prefilled country/employer/experience without verification — the parser guesses wrong.

## Validation

Validated 2026-10-20 on a live "Chief JavaScript Full-Stack Engineer" application — full wizard submitted successfully after manual English-level selection. (Steps re-checked against agent-browser command surface during migration; flows not re-run live.)
