# Post-mining: employer-voice post search

Recruiters post vacancies as feed posts before/instead of job listings. Post-mining finds them via LinkedIn content search and converts them via the best available channel.

## Why it converts

- Recruiter posts are specific, time-sensitive, and carry a direct contact (email, form, or DM target)
- ~30% DM reply rate vs <1% for cold 1-click applies
- One recruiter post often bundles several vacancies

## Query anatomy (validated)

`/search/results/content/?keywords=<kw>&sortBy=%22date_posted%22`

- **Employer voice (required):** `"we are hiring"`, `"estamos buscando"`, `"busco"`, `"sumamos al equipo"`, `"te estamos buscando"`, `"vacante"`, `"abrimos vacante"`
- **Role signal (required):** developer, engineer, software, programador, frontend, backend, python, javascript, QA, data — without a role word, employer voice surfaces non-tech roles
- **Geo variant (one per query):** argentina, latam, remoto, remote, "desde cualquier país", worldwide
- **Do NOT filter by seniority keyword** — filter by the experience the post itself requires (anything ≤2-3 years or unstated is fair game)

## Skip patterns

- "Comment your email" / "interested" bait, generic theme pages, links to Telegram/WhatsApp channels
- Explicit geo locks ("no international applications", country-only residency)
- Paywalled boards: some aggregators (e.g. beBee-based sites) charge to submit — resolve the employer's original listing or their careers ATS instead

## Apply channel priority

1. `mailto:` in the post → send CV directly
2. Linked form (Google Form / ATS survey) → complete and submit
3. Recruiter DM / connect request → short message with CV
4. Job-board link → verify it's not paywalled before creating an account

## Algorithm training

Copy link (Share → Copy link) on every relevant tech job post — applied or skipped — so the feed converges toward this content. Never copy-link off-target posts; that trains noise.
