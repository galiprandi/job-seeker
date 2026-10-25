> **Note (agent-browser migration, 2026):** playwright-cli has been replaced by agent-browser behind the same `browser.js` wrapper. Where this plan references `playwright-cli`, `.playwright-cli/`, `ref=eN`, `attach`/`detach`/`ensure`, or Page-object APIs, read them as their agent-browser equivalents (`exec` passthrough, `@eN` refs, implicit `--session`, eval-based helpers).
# Plan 003: Repoint ~79 stale `scripts/browser.js` references to the real wrapper path

> **Executor instructions**: Follow step by step. Run every verification and
> confirm expected output. On STOP conditions, report — do not improvise.
> Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 8dfd5ce..HEAD -- .agents/ docs/ README.md DATA.md CONTRIBUTING.md scripts/`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (run before plan 004; test-file paths are fixed there)
- **Category**: docs / dx
- **Planned at**: commit `8dfd5ce`, 2026-10-09

## Why this matters

The browser wrapper lives at `.agents/skills/browser-automation/scripts/browser.js`, but ~79 doc/code references still point at the deleted `scripts/browser.js`. Every flow's pre-flight checklist (`apply`, `daily`, `news`, `targets`, `radar`, `referrals`, `onboarding`, `polish`) literally instructs the agent to run a nonexistent command — Gold Rule 14 says agents must read these skills first, so they hit `Cannot find module` on step one. For a template repo, this reads as broken on first use.

## Current state

Real path (exists): `.agents/skills/browser-automation/scripts/browser.js`

Confirmed stale sites (counted by `grep -n "scripts/browser.js" <file> | grep -v "browser-automation/scripts/browser.js"`):

| File | Stale hits |
|---|---|
| `.agents/skills/browser-automation/sites/teams_com/guide.md` | 22 |
| `.agents/skills/polish/SKILL.md` | 15 |
| `.agents/skills/news/SKILL.md` | 15 |
| `.agents/skills/targets/SKILL.md` | 4 |
| `.agents/skills/radar/SKILL.md` | 4 |
| `.agents/skills/apply/SKILL.md` | 4 |
| `scripts/lib/playwright-helpers.js` | 3 (docstrings) |
| `tests/browser/01-syntax-config.test.mjs` | 2 (handled by plan 004, skip here) |
| `.agents/skills/daily/SKILL.md` | 2 |
| `.agents/skills/referrals/SKILL.md` | 1 |
| `.agents/skills/onboarding/SKILL.md` | 1 |
| `.agents/skills/browser-automation/SKILL.md` | 1 (a migration note — verify context before changing) |
| `DATA.md` ~197, `README.md` structure block ~170 | few |
| `scripts/linkedin-send.js:39` | `BROWSER_JS = path.join(__dirname,'browser.js')` — MODULE_NOT_FOUND, silently swallowed |
| `lib/browser-helpers.js:24-26` | probes old path first — update/remove fallback |

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Count stale refs | `grep -rn "scripts/browser\.js" . --include="*.md" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git \| grep -v "browser-automation/scripts/browser\.js" \| wc -l` | decreases to ~2 (only legit "old path was deleted" migration notes) |
| Recount | same command | ~0-2 after edit |

## Scope

**In scope:** all files in the table above EXCEPT `tests/` (plan 004 owns it).

**Out of scope:** `tests/**`; rewriting doc content beyond path fixes; plan 006's deletions.

## Steps

### Step 1: Global doc retarget

For each `.md` file in scope, replace `scripts/browser.js` (when NOT already part of `browser-automation/scripts/browser.js`) with `.agents/skills/browser-automation/scripts/browser.js`. A safe transform:

```bash
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./tests/*" -print0 | xargs -0 sed -i 's|node scripts/browser\.js|node .agents/skills/browser-automation/scripts/browser.js|g; s|scripts/browser\.js`|.agents/skills/browser-automation/scripts/browser.js`|g; s|`scripts/browser\.js`|`.agents/skills/browser-automation/scripts/browser.js`|g'
```

Then eyeball each file's diff — `git diff` — for leftover bare mentions (e.g. prose like "scripts/browser.js was deleted" should stay).

**Verify**: stale-ref count command → ≤2.

### Step 2: Fix `scripts/linkedin-send.js` BROWSER_JS

```js
// :39 currently:
const BROWSER_JS = path.join(__dirname,'browser.js');
// →
const BROWSER_JS = path.join(__dirname,'..','.agents','skills','browser-automation','scripts','browser.js');
```

**Verify**: `node --check scripts/linkedin-send.js` → exit 0.

### Step 3: Update `lib/browser-helpers.js` fallback

At `:24-26`, remove the dead-path probe or point it at the real wrapper. Read the surrounding function first — keep it minimal.

**Verify**: `node --check lib/browser-helpers.js` → exit 0.

### Step 4: Fix structural docs

- `README.md` structure block (~:170): `scripts/browser.js` → remove or show real path
- `DATA.md:197`: update tool description path

**Verify**: `grep -n "scripts/browser.js" README.md DATA.md | grep -v browser-automation` → none.

## Test plan

- No tests; the grep count is the gate. Plan 004 fixes the test suite itself.

## Done criteria

- [ ] Stale-ref count ≤2 in non-test files
- [ ] `node --check` clean on `linkedin-send.js` and `lib/browser-helpers.js`
- [ ] Only in-scope files modified
- [ ] `plans/README.md` updated

## STOP conditions

- A doc intentionally documents the OLD path as history/migration note → keep it, count it in the allowed ≤2.
- The real wrapper file is missing at `.agents/skills/browser-automation/scripts/browser.js` → STOP, repo state is inconsistent.

## Maintenance notes

- Consider a CI grep gate (one line in ci.yml) preventing `node .agents/skills/browser-automation/scripts/browser.js` from regressing — mention as a follow-up, don't implement here.
