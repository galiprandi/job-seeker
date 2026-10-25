> **Note (agent-browser migration, 2026):** playwright-cli has been replaced by agent-browser behind the same `browser.js` wrapper. Where this plan references `playwright-cli`, `.playwright-cli/`, `ref=eN`, `attach`/`detach`/`ensure`, or Page-object APIs, read them as their agent-browser equivalents (`exec` passthrough, `@eN` refs, implicit `--session`, eval-based helpers).
# Plan 006: Delete the dead script family (~16 unreferenced files, ~3k lines)

> **Executor instructions**: Follow step by step, verify each command.
> On STOP conditions, report — do not improvise. Update `plans/README.md`.
>
> **Drift check**: `git diff --stat 8dfd5ce..HEAD -- scripts/`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (all targets verified unreferenced — re-verify each before deleting)
- **Depends on**: plans/001 (overlapping files), 002 (fixes files that may instead be deleted here — run 002's live-file fixes first, or delete first and skip 002's dead sites; either order works)
- **Category**: tech-debt
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

`scripts/` contains ~16 unreferenced scripts — an entire dead family of owner-specific outreach tooling (YouTube/X scrapers, DM senders, alternate Easy Apply implementations) plus broken utilities. `browser-automation/SKILL.md` tells agents to "run `ls scripts/` and prefer existing scripts," so dead scripts *will* be discovered and run by agents in consuming repos — and two of them ship silently-broken code (blank form answers, "yes to everything" checkboxes, placeholder URLs in real DMs). Deleting removes the bugs AND the confusion.

## Current state

**Verified dead** (zero references in `.agents/skills/`, `docs/`, top-level `.md`, `package.json`, or live scripts — executor must re-run this check per file):

| File | Why dead | Additional defect |
|---|---|---|
| `scripts/li-dm.js`, `li-dm-fast.js`, `li-outreach.js`, `li-search-and-dm.js` | owner outreach; `li-dm-fast` marks messages sent without verification | — |
| `scripts/yt-*.js` (5 files: outreach, comment, extract-emails, history-scan, history-scan2, trending-seed) | YouTube marketing tooling | numbered duplicate pair |
| `scripts/x-reply.js`, `x-thread.js` | Twitter outreach | — |
| `scripts/outreach-seed.js`, `outreach-posts-seed.js` | seed `outreach_contacts`/`outreach_posts` — tables not in DATA.md | direct `pg` Pool, re-implements .env parsing |
| `scripts/scan-companies.js` | reads gitignored `data/argentina-it-companies.json` → ENOENT on clone | — |
| `scripts/process-captcha-forms.js` | one-shot owner script with PII (plan 001 deletes it) | — |
| `scripts/gmail-batch-send.js` | dead + PII (plan 001 deletes it) | hardcoded letter |
| `scripts/easy-apply-one.js`, `batch-easy-apply.js`, `search-apply.js` | superseded by `linkedin-easy-apply.js` (the one referenced by `apply` skill) | blank-answer bug + yes-to-all answers |
| `scripts/upload-file.js` | wrapper supports `exec upload`; requires undeclared `playwright`, races profile lock | off-by-one input index |
| `scripts/lib/playwright-helpers.js` | Page-object model, incompatible with the CLI-eval model | — |
| `scripts/linkedin/{openConversation,sendMessage,connectWithNote,savedJobs}.js` | Page-object modules, nothing imports them | — |
| `scripts/gmail-actions/{listInbox,trashByQuery}.js`, `scripts/teamtailor/apply.js` | same dead module family | — |

**Keep (verified live)**: `db.js`, `pipeline.js`, `dashboard.js`, `social.js` (dashboard imports it — fix by plan 002), `linkedin-easy-apply.js`, `linkedin-search.js`, `linkedin-warm-sourcing.js`, `linkedin-invite.js`, `linkedin-send.js`, `linkedin-inbox.js`, `linkedin-upload.js`, `generate-cv.js`, `send-email.js`, `gmail-send.js` (documented browser fallback), `lib/browser-helpers.js`, `scripts/lib/ea-form.js` (only if `easy-apply-one.js` is kept — decide: if easy-apply-one is deleted, check if anything else imports ea-form.js; if nothing does, delete it too).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Reference check per file | `grep -rn "<basename>" .agents/ docs/ *.md package.json scripts/ lib/ tests/ \| grep -v "scripts/<basename>"` | no live references |
| Deletion | `git rm <file>` | staged |
| Sanity | `find scripts lib -name "*.js" -exec node --check {} +` | exit 0 on survivors |

## Scope

**In scope:** the files listed in the table; `scripts/lib/ea-form.js` only if orphaned by the deletions.

**Out of scope:** `tests/` (plan 004); `.md` docs that merely mention a deleted file name historically (report them); `data/` (gitignored).

## Steps

### Step 1: Re-verify each candidate is unreferenced

Run the reference check for every file in the table. For each file WITH a live reference, move it to a "keep" list and note why — do not delete referenced files.

**Verify**: produce the delete list explicitly in your report before deleting.

### Step 2: Delete

```bash
git rm <each dead file>
```

### Step 3: Check orphans

After deletion, re-grep for imports of `scripts/lib/ea-form.js` and `lib/browser-helpers.js` consumers. If `ea-form.js` is orphaned → `git rm` it. `browser-helpers.js` stays (it has live consumers).

### Step 4: Sanity + commit

`node --check` all remaining `scripts/**/*.js`, `lib/**/*.js`. Commit style: `Remove dead script family (unreferenced owner-specific tooling)`.

## Test plan

- No new tests. The `node --check` sweep is the gate. Plan 004's syntax-sweep test will protect survivors going forward.

## Done criteria

- [ ] Every deleted file had zero live references at deletion time
- [ ] `node --check` clean on all remaining scripts
- [ ] `npm test` / `npm run docs:build` unaffected
- [ ] `plans/README.md` updated

## STOP conditions

- Any target file turns out to be referenced by a live skill/doc/script → exclude it, note in report.
- `social.js` appears dead → do NOT delete; it's imported by `dashboard.js` (verify: `grep -n "social" scripts/dashboard.js`).

## Maintenance notes

- This plan also resolves findings: BUG-02 (sleep unit bugs live in deleted files), BUG-04 (yes-to-all answers), DEP-01 (undeclared playwright), DEP-03 (direct-pg seeds), DX-03 partially (yt duplicate).
- Report files kept-but-suspicious for the next audit round.
