# Plan 001: Scrub committed personal data from tracked scripts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8dfd5ce..HEAD -- scripts/process-captcha-forms.js scripts/gmail-batch-send.js`
> If these files changed since this plan was written, compare the
> "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

Two tracked scripts contain the repo owner's real personal data (full name, email, phone, LinkedIn URL, CV path, employer names). This violates Gold Rule 9 (repo must be candidate-agnostic) and leaks PII publicly on GitHub — the repo is pushed to `github.com:galiprandi/job-seeker`. Deleting the literals stops further exposure; git history scrubbing is a separate, optional decision noted below.

## Current state

`scripts/process-captcha-forms.js` — one-shot owner script that opens ATS forms blocked by captchas and fills them with hardcoded personal data:

```js
// scripts/process-captcha-forms.js:9
const CV_PATH = '/home/galiprandi/Documents/Germán Aliprandi.pdf';
// :20-23 — fills "Germán Aliprandi", "galiprandi@gmail.com", "+5493816187329", linkedin URL
// :27-28 — cover letter text with personal site URL and employer claims
// :70-78 — first/last name, age, email, country, work history
```

`scripts/gmail-batch-send.js` — batch outreach sender with the owner's cover letter hardcoded:

```js
// scripts/gmail-batch-send.js:77-93 — template literal containing real name,
// employers (Cencosud S.A., Egg Live), OSS project handles, and github/linkedin/site URLs.
```

Both files are already dead code (unreferenced by any skill/doc — see plans/006). The correct fix is **deletion**, not parameterization.

Convention to honor: candidate data lives in `users.data.*` DB keys and is read at runtime (see `lib/browser-helpers.js` `dbQuery` pattern). Repo files use `<placeholder>` syntax for examples.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Confirm files tracked | `git ls-files scripts/process-captcha-forms.js scripts/gmail-batch-send.js` | lists both |
| Find references | `grep -rn "process-captcha-forms\|gmail-batch-send" . --include="*.md" --exclude-dir=node_modules` | no references in skills/docs (verify yourself) |
| Commit | `git commit -m "..."` | see style below |

## Scope

**In scope:**
- `scripts/process-captcha-forms.js` (delete)
- `scripts/gmail-batch-send.js` (delete)

**Out of scope:**
- Git history rewriting (`git filter-repo`) — flag to the operator as a follow-up decision; do NOT run it (destructive, requires force-push).
- Any other script — dead-code cleanup is a separate plan (006).

## Git workflow

- Commit directly on the working branch; message style from `git log`: short imperative summary, e.g. `Remove owner PII from tracked scripts (dead code)`

## Steps

### Step 1: Confirm both files are dead and tracked

```bash
grep -rn "process-captcha-forms\|gmail-batch-send" .agents/ docs/ README.md DATA.md CONTRIBUTING.md package.json scripts/ 2>/dev/null | grep -v "^scripts/process-captcha-forms.js\|^scripts/gmail-batch-send.js"
git ls-files scripts/process-captcha-forms.js scripts/gmail-batch-send.js
```

**Verify**: first command prints nothing (or only comments already noting removal); second prints both paths.

### Step 2: Delete both files

```bash
rm scripts/process-captcha-forms.js scripts/gmail-batch-send.js
```

### Step 3: Verify no personal-data patterns remain in the diff

```bash
git diff --cached | grep -inE "galiprandi|german|gmail\.com|\+54|cencosud|linkedin\.com/in/|\.github\.io/me"
```

**Verify**: exit 1 (no matches) — deletions show as removed lines only; any `+` line matching is a problem.

### Step 4: Commit and flag history exposure to the operator

Commit the deletions. In the final report, note: the PII still exists in git history and on any forks — recommend the operator decide whether to run `git filter-repo` + force-push (destructive; their call).

## Test plan

- No new tests needed (deletion of dead files).
- Sanity: `node --check` is not applicable to deleted files; ensure `git status` shows only the two deletions.

## Done criteria

- [ ] `git ls-files scripts/process-captcha-forms.js scripts/gmail-batch-send.js` returns nothing after commit
- [ ] `grep -rn "galiprandi\|Germán\|3816187329" scripts/` returns no matches
- [ ] No files outside scope modified
- [ ] Operator report mentions git-history exposure
- [ ] `plans/README.md` status row updated

## STOP conditions

- Either file is referenced by a live skill, doc, or package.json script → STOP, report the reference.
- `git log` shows the files were never committed (untracked) → deletion still fine, but note history-exposure concern is void.

## Maintenance notes

- Pair with the PII-lint plan (deferred finding DIR-04) so this can't regress.
- If history scrubbing is done later, it requires a force-push and re-clone coordination.
