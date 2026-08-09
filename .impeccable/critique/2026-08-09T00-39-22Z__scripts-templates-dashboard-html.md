---
target: scripts/templates/dashboard.html
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-09T00-39-22Z
slug: scripts-templates-dashboard-html
---
# Critique Report: Job Seeker Dashboard

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Pulse + auto-refresh good, but no per-section loading and stale data not surfaced clearly |
| 2 | Match Between System and Real World | 4 | Pipeline stages (Discovered → Hired), time formatting, and status labels are natural |
| 3 | User Control and Freedom | 2 | No filters, no custom view, no cancel auto-refresh; clickable cards have no clear outcome |
| 4 | Consistency and Standards | 4 | Strong VitePress token alignment: color, type, spacing, shadows, theme toggle, localStorage |
| 5 | Error Prevention | 1 | Error banner has no recovery action; no offline or retry handling |
| 6 | Recognition Rather Than Recall | 3 | Stage colors and match tags (Must/Strong/Nice) need legend or first-run cue |
| 7 | Flexibility and Efficiency of Use | 2 | No keyboard shortcuts, no search/filter, no bulk actions, no drag-and-drop |
| 8 | Aesthetic and Minimalist Design | 4 | Clean hierarchy, good whitespace, elegant skeleton loading |
| 9 | Error Recovery | 1 | Error banner shows message but no retry, no cached data, no diagnostic detail |
| 10 | Help and Documentation | 3 | Footer docs link and empty-state hints exist, but no in-context tooltips |
| **Total** | | **27/40** | **Good — above average, but operability and resilience gaps remain** |

## Design Specificity Verdict

**LLM assessment:** The dashboard is clearly grounded in the job-search domain, not a generic analytics template. KPIs (Active, In Interview, Offers, Rejected, Closed), the funnel, and the kanban all map to the real application pipeline. VitePress token use is faithful, giving visual continuity with the docs site. The weakest point is the lack of product narrative: the dashboard reads as a passive monitor rather than an active companion to an AI agent. There is no brand presence, no next-best action, and no reinforcement that the agent is working on the user's behalf.

**Deterministic scan:** The CLI detector found one static finding: `overused-font` (Inter). The live overlay found multiple issues: 128 `undersized-ui-text` instances, 58 `low-contrast` instances, 5 `side-tab` positives, 1 `overused-font`, 1 `ai-color-palette`, and 1 `pulsing-dot`. Most contrast and text-size findings are real: several functional labels are 9–10 px and some text-3 on dark-soft backgrounds is below WCAG AA. The `side-tab` call is likely a false positive because the border-left is on kanban column headers, not cards. `ai-color-palette` and `pulsing-dot` are accepted design choices, not functional defects.

## Overall Impression

The dashboard is technically polished and visually cohesive with the docs. It succeeds as a polished status board but fails as an action surface. The biggest opportunity is to make the dashboard feel like a command center: fewer passive metrics, clearer next steps, and better resilience when things go wrong.

## What's Working

1. **VitePress design system fidelity** — The color tokens, Inter typography, shadows, radius, and transitions match the docs, making the dashboard feel like one product family.
2. **Elegant loading and empty states** — The shimmer skeleton is professional, and empty states include actionable hints rather than just "Nothing here."
3. **Domain-specific data model** — The funnel and kanban are built around the job-search pipeline, not generic dashboard widgets.

## Priority Issues

### [P0] Clickable cards with no outcome
- **What:** Cards have `cursor: pointer` and `tabindex="0"` but do nothing and give no hint what will happen.
- **Why it matters:** Users will click, get no feedback, and lose trust in the interface.
- **Fix:** Remove the pointer affordance until a detail view exists, or add a modal/slide-out with company, role, history, and a "View application" link.
- **Suggested command:** `$impeccable onboard` or `$impeccable clarify`

### [P0] Error banner has no recovery path
- **What:** The error banner displays the message but no retry, no cached view, and no diagnostic guidance.
- **Why it matters:** When the API fails, the user is stuck until they manually refresh the page.
- **Fix:** Add a Retry button to the banner, keep the last successful render cached, and show "Last updated: X minutes ago" when stale.
- **Suggested command:** `$impeccable harden`

### [P1] Redundant funnel and kanban
- **What:** Both sections show the same pipeline data in different forms, increasing cognitive load.
- **Why it matters:** First-time users must reconcile two views before they understand either.
- **Fix:** Make the funnel interactive — clicking a stage filters the kanban — or allow collapsing the funnel.
- **Suggested command:** `$impeccable layout` or `$impeccable distill`

### [P1] No filtering or search
- **What:** Users cannot filter by match, platform, or date, nor search company/role. At 100+ applications the kanban becomes unmanageable.
- **Why it matters:** Power users cannot find the applications they care about quickly.
- **Fix:** Add a filter bar with match (Must/Strong/Nice), platform, date range, and a search input.
- **Suggested command:** `$impeccable harden` or `$impeccable layout`

### [P2] Undersized and low-contrast functional text
- **What:** The overlay flags 128 instances of 9–10 px text and 58 low-contrast combinations (e.g., text-3 on bg-soft).
- **Why it matters:** Some users will struggle to read tags, dates, status badges, and funnel conversion rates.
- **Fix:** Raise functional text to at least 11 px, darken/lighten text-3, and ensure 4.5:1 contrast for all readable text.
- **Suggested command:** `$impeccable typeset` or `$impeccable audit`

## Persona Red Flags

**Alex (Power User)**
- No keyboard shortcuts, no bulk actions, no advanced filters, no column customization. The dashboard forces a one-size-fits-all mouse-driven flow.
- Cannot hide the funnel, collapse empty columns, or pin specific applications.

**Jordan (First-Timer)**
- Five visualizations on one scroll without a clear starting point. The funnel and kanban feel like the same thing twice.
- Empty states say what command to run but don't show how. Error states are alarming and offer no recovery.
- Match tags and funnel colors are not explained inline.

## Minor Observations

1. Theme toggle works well but ignores `prefers-color-scheme`.
2. Footer docs link is easy to miss at the bottom of a long page.
3. The 30-second auto-refresh interval is not configurable.
4. Mobile layout stacks but the kanban still requires horizontal scrolling due to fixed column widths.

## Questions to Consider

1. Should the dashboard be a passive monitor or an action center that tells the user what to do next?
2. Is the funnel adding value or just duplicating the kanban? What if it became a "Next steps" panel?
3. Who is the primary audience: a job seeker glancing at progress, or a power user managing 100+ applications?
