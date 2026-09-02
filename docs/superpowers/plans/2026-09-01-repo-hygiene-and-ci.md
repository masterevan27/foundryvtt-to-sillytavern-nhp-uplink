# Repo Hygiene and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make this repo tell the truth about itself — delete the status
document that describes shipped work as unshipped, run the test suite in CI with
a command that actually works, fix the README's architecture section, and clear
the loose files and stale worktrees off the floor.

**Architecture:** No production code changes. This is documentation, CI
configuration, and git housekeeping. Every task is independently revertible, and
the only executable artifact produced is one GitHub Actions workflow
(`.github/workflows/test.yml`) whose correctness is proved by a deliberate
red/green cycle in Task 3.

**Tech Stack:** GitHub Actions, Node's built-in test runner (`node:test`), git
worktrees, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-01-repo-structure-audit-design.md`

## Global Constraints

- **Work on a branch off `main` at `80b457b`.** Create it with
  `git switch -c repo-hygiene-and-ci main`. Do **not** push `main`; it carries
  12 unpushed commits that are the owner's to publish.
- **Never flatten the double-nested component directories.**
  `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/`,
  `st-ui-extension/sillytavern-foundryvtt-input/` and
  `st-server-plugin/sillytavern-foundryvtt-input-server-plugin/` have inner
  names that are install-folder names, and `release.yml` zips from inside them.
- **The only test command that works is `cd import-gui-server && node --test`.**
  It prints `pass 55`. `node --test import-gui-server/test/` from the repo root
  fails with `MODULE_NOT_FOUND` — verified on Node v26.7.0. Never write the
  broken form into a document or a workflow.
- **Repo root is `G:\GIT REPOS\FoundryVTT_to_SillyTavern_NHP_Uplink`.** Paths in
  this plan are relative to it unless stated otherwise.
- **Commit style:** lowercase `type: subject`, imperative, no trailing period —
  matching `git log` (`feat:`, `fix:`, `docs:`, `chore:`).
- **Licence header:** every `.js` file in this repo carries the GPL-3.0-or-later
  block seen at the top of `import-gui-server/server.js`. This plan adds no
  `.js` files, so nothing here needs one.

---

## File Structure

| File | Fate | Responsibility after this plan |
|---|---|---|
| `claude_task_status.md` | **Deleted** (Task 2) | — |
| `CLAUDE.md` | **Created** (Task 2) | The one orientation document a coding session reads first: component map, the load-bearing-nesting warning, the working test command, file-size warnings. |
| `.github/workflows/test.yml` | **Created** (Task 3) | Runs the Import GUI suite on push, PR and manual dispatch, across three Node versions. |
| `.github/workflows/release.yml` | Untouched | Cutting releases. Deliberately left alone — it already validates manifests and is orthogonal to testing. |
| `README.md` | Modified (Tasks 4, 5) | §Architecture gains the fourth component and its own diagram; §4 points at the card's new path. |
| `assets/lancer-ai-gm.card.png` | **Moved** from repo root (Task 5) | The SillyTavern character card, out of the root listing. |
| `CHANGELOG.md` | Modified (Task 6) | Gains the `0.2.1` section covering the 12 unpushed commits. |
| `docs/known-issues.md` | **Created** (Task 1, from `worktree-plan-cleanup`) | Parked technical debt in `import-gui-server/`. |
| `docs/superpowers/plans/2026-09-01-npc-tables-editor-and-presets.md` | **Deleted** (Task 1) | — |
| `docs/superpowers/plans/2026-09-01-tables-and-presets-refinements.md` | **Deleted** (Task 1) | — |
| `.claude_to_do_list.md` | **Relocated** out of the working directory (Task 7) | — (it belongs to a different project and is gitignored) |

---

## Task 1: Land the finished plan-cleanup work

`worktree-plan-cleanup` is 1 commit ahead of `main` and 0 behind. Its commit
`13d9bb6` already does finding #5 from the spec properly: it deletes the two
shipped plan documents (3,978 lines), lifts the six issues they still tracked
into a new `docs/known-issues.md`, and puts a "Superseded in part" banner on the
tables/presets design spec. There is nothing to rewrite — it just needs landing.

**Files:**
- Create: `docs/known-issues.md` (comes in with the merge)
- Delete: `docs/superpowers/plans/2026-09-01-npc-tables-editor-and-presets.md`
- Delete: `docs/superpowers/plans/2026-09-01-tables-and-presets-refinements.md`
- Modify: `docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/known-issues.md` at the repo root of `docs/`. Task 2 links to
  it from `CLAUDE.md`; the extraction plan moves it to the new repo.

- [ ] **Step 1: Create the working branch**

```bash
git switch -c repo-hygiene-and-ci main
git log --oneline -1
```

Expected: `80b457b docs: mark plan complete, restore dropped preview clause in README`

- [ ] **Step 2: Confirm the branch really is a fast-forward before merging**

```bash
git rev-list --count "main..worktree-plan-cleanup"
git rev-list --count "worktree-plan-cleanup..main"
```

Expected: `1` then `0`. If the second number is not `0`, stop — the branch has
fallen behind and the rest of this task's assumptions no longer hold.

- [ ] **Step 3: Merge it**

```bash
git merge --ff-only worktree-plan-cleanup
```

Expected: `Fast-forward`, 4 files changed, 81 insertions, 3979 deletions.

- [ ] **Step 4: Verify the result**

```bash
ls docs/superpowers/plans/
cat docs/known-issues.md | head -5
```

Expected: `plans/` now contains only this plan and the extraction plan (or is
empty if you are running Task 1 before those files exist), and `known-issues.md`
opens with `# Known Issues`.

- [ ] **Step 5: No commit needed**

The fast-forward moved the branch pointer; `13d9bb6` is already a commit. Verify
with:

```bash
git log --oneline -1
```

Expected: `13d9bb6 docs: retire the two shipped plans, keeping what they still tracked`

---

## Task 2: Replace the false status document with a CLAUDE.md

`claude_task_status.md` is 12,660 bytes of orientation written for a future
coding session, and its central claim is wrong: it says the Import GUI is
*"mid-development"*, *"uncommitted, all local, nothing pushed"*. It shipped in
`0.2.0`. It also opens by saying *"don't duplicate [the README] here"* and then
duplicates it.

Deleting it leaves a real gap — a session genuinely does need orientation. So
this task replaces it with a `CLAUDE.md` that is short enough to stay true:
what the components are, which directory layouts must not be touched, the one
test command that works, and which files are too big to read whole.

There is an existing 5-line `CLAUDE.md` on `worktree-add-claude-md-read-guidance`
(`d06e382`). Do **not** merge that branch — it is 12 commits behind `main` and
merging it would revert the unpushed work. Its content is superseded by the file
written below; the branch is retired in Task 7.

**Files:**
- Delete: `claude_task_status.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: `docs/known-issues.md` from Task 1 (linked, not read).
- Produces: `CLAUDE.md` at the repo root. Task 3 keeps its test-command section
  in sync with the workflow; the extraction plan edits its component table.

- [ ] **Step 1: Confirm the document is as wrong as the spec says**

```bash
grep -n "mid-development\|uncommitted, all local\|don't duplicate" claude_task_status.md
```

Expected: three hits, around lines 12, 17 and 14 — the claims quoted above. This
step exists so the deletion is made with the evidence in front of you rather
than on this plan's say-so.

- [ ] **Step 2: Write `CLAUDE.md`**

Create `CLAUDE.md` with exactly this content:

````markdown
# CLAUDE.md

Orientation for a coding session in this repo. Architecture and install steps
live in [README.md](README.md) — this file is only what a session needs *before*
it touches anything.

## The components

Four of them. Three form the narration relay; the fourth is independent.

| Path | What it is | How it ships |
|---|---|---|
| `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/` | Foundry VTT module | `module.zip`, built by `.github/workflows/release.yml` |
| `st-server-plugin/sillytavern-foundryvtt-input-server-plugin/` | SillyTavern server plugin, own HTTP listener on port 5088 | copied in by hand |
| `st-ui-extension/sillytavern-foundryvtt-input/` | SillyTavern UI extension | mirrored to its own repo by the `mirror` job in `release.yml` |
| `import-gui-server/` | Standalone NPC import GUI, port 5089 | run from source |

The Import GUI has no dependency on the narration relay and works whether or not
SillyTavern is installed. Its parked technical debt is in
[docs/known-issues.md](docs/known-issues.md).

## The double-nested directories are load-bearing

`foundry-module/foundryvtt-to-sillytavern-nhp-uplink/` looks like a pointless
nesting. It is not, and neither are the two beside it:

- The **inner** directory name is the install-folder name Foundry and
  SillyTavern require.
- `release.yml` zips from *inside* it (`working-directory: ${{ env.MODULE_DIR }}`)
  so `module.json` lands at the zip root — the only layout Foundry's "Install
  Module" dialog accepts.

Do not flatten them.

## Running the tests

Only `import-gui-server/` has a suite. Run it **from inside that directory**:

```bash
cd import-gui-server && node --test
```

Expect `pass 55`, `fail 0`. (54 real tests plus `test/helpers/testServer.js`,
which Node counts as a test file because it sits under a directory named
`test/`.)

Running it from the repo root as `node --test import-gui-server/test/`
**fails** with `MODULE_NOT_FOUND` — the trailing directory gets resolved as a
module rather than a test path. Verified on Node v26.7.0. There is no
`package.json` anywhere in this repo and no dependencies to install; everything
is Node stdlib.

CI runs the same command in `.github/workflows/test.yml`.

## Reading files

Several files here are large enough that reading them whole is wasteful:

| File | Size |
|---|---|
| `README.md` | ~940 lines |
| `import-gui-server/public/app.js` | ~49KB |
| `import-gui-server/server.js` | ~46KB |

Read the section, route or function you need. `README.md` has a heading every
30-60 lines and `server.js` groups its routes under banner comments, so both
scope cleanly.
````

- [ ] **Step 3: Delete the status document**

```bash
git rm claude_task_status.md
```

Expected: `rm 'claude_task_status.md'`

- [ ] **Step 4: Verify no other file points at the deleted document**

```bash
grep -rn "claude_task_status" --include=*.md --include=*.js --include=*.yml . | grep -v "^./docs/superpowers/"
```

Expected: no output. (Hits under `docs/superpowers/` are this plan and the spec
describing the deletion, which is correct.) If a hit appears in `README.md` or a
workflow, fix that reference before committing.

- [ ] **Step 5: Verify every claim in the new file**

```bash
cd import-gui-server && node --test 2>&1 | tail -6
cd ..
grep -n "MODULE_DIR" .github/workflows/release.yml
```

Expected: `pass 55` / `fail 0` from the first command, and the second shows both
`MODULE_DIR: foundry-module/foundryvtt-to-sillytavern-nhp-uplink` and the
`working-directory: ${{ env.MODULE_DIR }}` line that the zip step uses.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md claude_task_status.md
git commit -m "docs: replace the stale task-status doc with a CLAUDE.md"
```

---

## Task 3: Run the Import GUI suite in CI

`release.yml` is the only workflow and it never runs a test. The suite is 55
tests over 7 files, stdlib-only, with no install step — there is no reason for
it not to run on every push.

The suite spawns real `server.js` child processes on **fixed ports** (see
`import-gui-server/test/helpers/testServer.js`, which throws unless given an
explicit port, precisely because `node --test` runs test files concurrently).
That is safe across matrix jobs, which get separate runners, and safe within a
job, because each test file was given a distinct port.

**Files:**
- Create: `.github/workflows/test.yml`
- Test: the workflow's own red/green cycle in Steps 2-5, then the Actions run

**Interfaces:**
- Consumes: the test command documented in `CLAUDE.md` (Task 2). The two must
  stay identical.
- Produces: a workflow named `Test` with one job, `import-gui-server`. The
  extraction plan moves this file, near-verbatim, into the new repo.

- [ ] **Step 1: Prove the suite is green before changing anything**

```bash
cd import-gui-server && node --test 2>&1 | tail -8
cd ..
```

Expected: `tests 55`, `pass 55`, `fail 0`.

- [ ] **Step 2: Write the failing test — break one assertion deliberately**

The thing under test here is the workflow, and what it must do is *fail when the
suite fails*. Create a known-bad state first.

`import-gui-server/test/tableBullets.test.js` is the right file to break: it
tests pure functions, so it needs no server and fails in milliseconds. Change
line 23 from:

```javascript
    assert.equal(tables.length, 2);
```

to:

```javascript
    assert.equal(tables.length, 999);
```

Do not commit this.

- [ ] **Step 3: Run it to make sure it fails**

```bash
cd import-gui-server && node --test 2>&1 | tail -8
cd ..
```

Expected: `fail 1`, `pass 54`, and a non-zero exit code, with the failure named
as `parseTableFile reads enabled, weighted, and disabled bullets`. If this still
reports `fail 0`, you edited a line that is not executed — pick a different
assertion and repeat.

- [ ] **Step 4: Write the workflow**

Create `.github/workflows/test.yml` with exactly this content:

```yaml
# Runs the only automated suite in this repo -- import-gui-server's.
#
# It must run from INSIDE import-gui-server/. `node --test <dir>` resolves the
# trailing path as a module and dies with MODULE_NOT_FOUND, and there is no
# package.json anywhere in this repo to hang an `npm test` script off. The
# suite is stdlib-only (node:test, node:http, global fetch), so there is
# nothing to install and no cache to warm.
#
# The suite spawns real server.js child processes on FIXED ports (see
# test/helpers/testServer.js). Matrix jobs get separate runners, so they cannot
# collide with each other; within a job, each test file was already given a
# distinct port.
#
# Node 20 is the floor: the tests use global fetch (18+) and node:test's
# directory discovery (20+). Action versions are pinned deliberately -- bump
# them on purpose, not by drift.
name: Test

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  import-gui-server:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['20.x', '22.x', '24.x']
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}

      - name: Run the Import GUI suite
        working-directory: import-gui-server
        run: node --test
```

- [ ] **Step 5: Revert the deliberate breakage and confirm green**

```bash
git checkout -- import-gui-server/test/tableBullets.test.js
cd import-gui-server && node --test 2>&1 | tail -8
cd ..
```

Expected: `pass 55`, `fail 0`. The workflow runs this exact command, so a green
local run and a green CI run now mean the same thing.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run the import-gui-server suite on push and pull request"
```

- [ ] **Step 7: Push the branch and confirm the run is green**

```bash
git push -u origin repo-hygiene-and-ci
gh run list --workflow=test.yml --limit 1
```

Expected: one run, `completed  success`. Watch it with
`gh run watch` if it is still in progress. All three matrix legs must pass; if
`20.x` fails on test discovery, that is a real finding — drop `20.x` from the
matrix and change the "Node 20 is the floor" comment to name the version that
does pass.

---

## Task 4: Make the README's architecture section describe four components

`README.md:160` opens the Architecture section with *"Three pieces, because
neither application can talk to the other directly."* The README documents four
components — §8 is 85 lines about the Import GUI — so its own mental model is
missing a quarter of the project.

The fix is not to jam a fourth box into the relay diagram: the Import GUI is on
a different track and shares no endpoint with it. It gets its own diagram.

**Files:**
- Modify: `README.md:158-173`

**Interfaces:**
- Consumes: the `/importer/*` endpoint names, taken from
  `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js:98-132`
  and `import-gui-server/server.js:1069-1103`.
- Produces: nothing other tasks read.

- [ ] **Step 1: Confirm the endpoints before drawing them**

```bash
grep -n "endpoint(\"/importer" foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
grep -n "url.pathname === '/importer" import-gui-server/server.js
```

Expected: three endpoints on each side, matching exactly —
`/importer/pending` (GET), `/importer/complete` (POST),
`/importer/reconcile` (POST).

- [ ] **Step 2: Replace lines 158-173**

Replace everything from `## Architecture` through the closing fence of the
existing diagram with:

````markdown
## Architecture

Three pieces carry the narration relay, because neither application can talk to
the other directly:

```
Foundry VTT (GM's browser)
    |  POST /event          (combat events + board state)
    |  GET  /outbound       (poll for AI narration)
    v
foundryvtt-to-sillytavern-nhp-uplink   <- SillyTavern server plugin, port 5088
    ^
    |  SSE  /stream         (events pushed to the UI)
    |  POST /narration      (AI reply headed back to Foundry)
    |
SillyTavern UI extension (browser) -> character card -> LLM
```

A fourth piece, the **Import GUI**, is optional and runs on its own track. It
shares no endpoint with the relay above and does not need SillyTavern at all —
see [§8](#8-import-gui-optional):

```
Foundry VTT (GM's browser)
    |  GET  /importer/pending     (poll for NPCs the GM queued)
    |  POST /importer/complete    (report the Actor it created)
    |  POST /importer/reconcile   (report which imports still exist)
    v
import-gui-server   <- standalone local tool, port 5089
    ^
    |  same-origin /api/*
    |
the Import GUI page, served by that same process
```
````

Leave the `<details>` block about the separate listener and the **Do not point
Foundry at SillyTavern's web UI port** warning exactly as they are — they follow
the diagram and are still correct.

- [ ] **Step 3: Verify the anchor link resolves**

```bash
grep -n "^### 8. Import GUI" README.md
```

Expected: one hit. GitHub renders that heading with the anchor
`#8-import-gui-optional`, which is what the new text links to.

- [ ] **Step 4: Verify no stale count survives**

```bash
grep -n "Three pieces\|three pieces\|Three shipped\|three components" README.md
```

Expected: exactly one hit — the new `Three pieces carry the narration relay`
line. Any other hit is a leftover claim that also needs updating.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: account for the Import GUI in the architecture section"
```

---

## Task 5: Move the character card out of the repo root

`lancer-ai-gm.card.png` is a 45,774-byte asset sitting in the repo root next to
`README.md` and `LICENSE`. It is referenced from exactly one place —
`README.md:304` — and from nothing in `release.yml`, so moving it is a
two-line change.

**Files:**
- Move: `lancer-ai-gm.card.png` → `assets/lancer-ai-gm.card.png`
- Modify: `README.md:304`

**Interfaces:**
- Consumes: nothing.
- Produces: the `assets/` directory. Nothing else in this plan uses it.

- [ ] **Step 1: Confirm it has exactly one reference**

```bash
grep -rn "lancer-ai-gm.card.png" --include=*.md --include=*.js --include=*.json --include=*.yml . | grep -v "^./docs/superpowers/"
```

Expected: exactly one hit, `README.md:304`. If `release.yml` or `module.json`
turns up, stop — the file is a build input and moving it needs those updated
too.

- [ ] **Step 2: Move it**

```bash
mkdir -p assets
git mv lancer-ai-gm.card.png assets/lancer-ai-gm.card.png
```

- [ ] **Step 3: Update the reference**

In `README.md`, change line 304 from:

```markdown
Import `lancer-ai-gm.card.png` through SillyTavern's character panel and start
```

to:

```markdown
Import [`assets/lancer-ai-gm.card.png`](assets/lancer-ai-gm.card.png) through
SillyTavern's character panel and start
```

- [ ] **Step 4: Verify the file is where the README now says**

```bash
ls -l assets/lancer-ai-gm.card.png
grep -n "assets/lancer-ai-gm.card.png" README.md
```

Expected: a 45774-byte file, and one README hit at the line you just edited.

- [ ] **Step 5: Commit**

```bash
git add README.md assets/lancer-ai-gm.card.png
git commit -m "docs: move the AI GM character card into assets/"
```

---

## Task 6: Record the unreleased Tables and Presets work in the changelog

The 12 commits on `main` that `origin/main` has never seen — the Tables tab, the
preset save/export/import/apply cycle, per-bullet roll weights — have no
changelog section. `CHANGELOG.md`'s newest entry is still `0.2.0 - Import GUI`.
If a release were cut today, `release.yml` would fall back to raw commit
subjects for the in-Foundry "what's new" dialog.

A section for this already exists, written and refined across two commits on
`worktree-docs-catchup` (`012ff87` and `63d3217`). Take the file; do not merge
the branch — its other two files (`claude_task_status.md`, which Task 2 deletes,
and a plan document Task 1 deletes) would conflict for no benefit.

**Files:**
- Modify: `CHANGELOG.md` (+22 lines)

**Interfaces:**
- Consumes: `worktree-docs-catchup`'s version of `CHANGELOG.md`.
- Produces: a `0.2.1` section that `tools/build-changelog.mjs` can compile.

- [ ] **Step 1: Confirm `CHANGELOG.md` is the only file you need from that branch**

```bash
git diff --stat "main..worktree-docs-catchup"
```

Expected: 4 files changed — `CHANGELOG.md`, `claude_task_status.md`, the
refinements plan, and (from `main`'s side) nothing else. Only `CHANGELOG.md` is
wanted.

- [ ] **Step 2: Take just that file**

```bash
git checkout worktree-docs-catchup -- CHANGELOG.md
git diff --stat HEAD -- CHANGELOG.md
```

Expected: `1 file changed, 22 insertions(+)`.

- [ ] **Step 3: Verify it compiles into the shipped changelog format**

```bash
node tools/build-changelog.mjs --out /tmp/cl.json --version 0.2.1 --repo-url https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink
node -e "const j=require('/tmp/cl.json'); console.log(j.entries[0].version, '|', j.entries[0].title, '|', j.entries[0].notes.length, 'notes')"
```

Expected:

```
build-changelog: wrote 5 entries to /tmp/cl.json (newest 0.2.1, from CHANGELOG.md)
0.2.1 | Curating the generator's tables | 5 notes
```

The section carries no `_date_` line on purpose — `release.yml` stamps the day
it ships. The build script fills in today's date when run outside a release.

On Windows, substitute `$env:TEMP\cl.json` for `/tmp/cl.json` in both commands.

- [ ] **Step 4: Verify the section separator survived**

```bash
grep -n -B2 "^## 0.2.0 - Import GUI" CHANGELOG.md
```

Expected: a blank line immediately above `## 0.2.0`. That blank line is the
whole content of commit `63d3217`; without it the two sections run together in
the rendered dialog.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add the 0.2.1 changelog section for the tables and presets work"
```

---

## Task 7: Retire the stale worktrees and relocate the misfiled to-do list

Four worktrees are parked under `.claude/worktrees/`, three of them locked so
nothing will reclaim them automatically. After Tasks 1 and 6 their commits are
either landed or superseded:

| Worktree / branch | State | Disposition |
|---|---|---|
| `plan-cleanup` | 1 ahead, 0 behind | **Landed** in Task 1. Remove. |
| `docs-catchup` | 2 ahead, 1 behind | Its `CHANGELOG.md` was taken in Task 6; its other two files target documents Tasks 1 and 2 delete. **Superseded.** Remove. |
| `add-claude-md-read-guidance` | 1 ahead, **12 behind** | Its 5-line `CLAUDE.md` is superseded by the fuller one from Task 2. **Superseded.** Remove. |
| `claudeignore-to-deny-rules` | 1 ahead, **12 behind** | Adds 38 lines of deny rules to `.claude/settings.json` and drops `.claudeignore` from `.gitignore`. **Not superseded** — decide explicitly (Step 3). |

Both 12-behind branches were cut from `origin/main` before the unpushed work.
Merging either directly would revert 12 commits. Nothing in this task merges
them; the one that survives gets cherry-picked.

Separately, `.claude_to_do_list.md` is present in the working directory and
gitignored. Its contents are ComfyUI image-generation prompts, NPC height tables
and backdrop fixes — `generate-npc.py` work belonging to the
`Lancer-TTRPG-GM-Hub` project, not to this repo.

**Files:**
- Modify (possibly): `.claude/settings.json`
- Remove: four directories under `.claude/worktrees/`
- Relocate: `.claude_to_do_list.md` (untracked, gitignored — no git change)

**Interfaces:**
- Consumes: Task 1's merge and Task 6's file-level checkout, both of which must
  be committed before any branch here is deleted.
- Produces: nothing later tasks read.

- [ ] **Step 1: Re-measure every branch before deleting anything**

```bash
for b in worktree-plan-cleanup worktree-docs-catchup worktree-add-claude-md-read-guidance worktree-claudeignore-to-deny-rules; do
  echo "$b ahead=$(git rev-list --count "main..$b") behind=$(git rev-list --count "$b..main")"
done
```

Expected, at this point in the plan: `plan-cleanup` has been merged into your
branch (not into `main`), so it still reads `ahead=1 behind=0` against `main`.
The other three read as in the table above. Deleting a branch is not reversible
from the reflog forever — if any number differs from the table, investigate
before continuing.

- [ ] **Step 2: Save the two 12-behind branches' unique work as patches**

```bash
mkdir -p "$HOME/uplink-retired-branches"
git format-patch -1 d06e382 -o "$HOME/uplink-retired-branches"
git format-patch -1 5ab7445 -o "$HOME/uplink-retired-branches"
ls "$HOME/uplink-retired-branches"
```

Expected: two `.patch` files. This is cheap insurance — the next step throws the
branches away.

- [ ] **Step 3: Decide the `.claude/settings.json` deny rules, then act**

`5ab7445` is the only commit here whose content is not superseded. Read it:

```bash
git show 5ab7445 -- .claude/settings.json | head -50
```

Then pick one:

**(a) Keep it** — cherry-pick just the settings file, leaving behind the same
commit's edits to `claude_task_status.md` (deleted in Task 2) and to
`.gitignore`:

```bash
git checkout 5ab7445 -- .claude/settings.json
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('settings.json parses')"
git add .claude/settings.json
git commit -m "chore: enforce the ignore list through deny rules"
```

Expected from the `node -e` line: `settings.json parses`. A malformed
`settings.json` silently disables every hook in it, so this check is not
optional.

**(b) Drop it** — take no action; the patch saved in Step 2 is the record.

- [ ] **Step 4: Remove the worktrees**

```bash
git worktree remove --force .claude/worktrees/plan-cleanup
git worktree unlock .claude/worktrees/docs-catchup && git worktree remove --force .claude/worktrees/docs-catchup
git worktree unlock .claude/worktrees/add-claude-md-read-guidance && git worktree remove --force .claude/worktrees/add-claude-md-read-guidance
git worktree unlock .claude/worktrees/claudeignore-to-deny-rules && git worktree remove --force .claude/worktrees/claudeignore-to-deny-rules
git worktree list
```

Expected: `git worktree list` shows the main checkout and whichever worktree
this plan is being executed from — nothing else.

- [ ] **Step 5: Delete the branches**

```bash
git branch -D worktree-plan-cleanup worktree-docs-catchup worktree-add-claude-md-read-guidance worktree-claudeignore-to-deny-rules
git branch
```

Expected: `main`, your `repo-hygiene-and-ci` branch, and nothing beginning
`worktree-` except the one you are standing in.

- [ ] **Step 6: Relocate the misfiled to-do list**

This file is a to-do list someone wrote. Move it; do not delete it.

```bash
ls -l .claude_to_do_list.md
head -20 .claude_to_do_list.md
```

Confirm from that output that the contents are generator/ComfyUI work rather
than uplink work, then move it beside the project it belongs to:

```bash
mv .claude_to_do_list.md "G:/GIT REPOS/lancer-todo-list.md"
```

If `Lancer-TTRPG-GM-Hub` has been cloned locally by the time you run this, move
it into that repo's root instead. Either way it stays gitignored here and needs
no commit.

- [ ] **Step 7: Verify the working tree is clean**

```bash
git status --porcelain
git status --porcelain --ignored | head
```

Expected: the first command prints nothing. The second no longer lists
`.claude_to_do_list.md`.

- [ ] **Step 8: Push**

```bash
git push
gh run list --workflow=test.yml --limit 1
```

Expected: the push succeeds and the newest `Test` run is `completed success`.

---

## Done

At this point:

- `docs/` holds `known-issues.md` and the specs — documents written for people,
  not 160KB of finished plans.
- `CLAUDE.md` replaces a status document that described shipped work as
  unshipped, and carries the nesting warning and the working test command.
- Every push and PR runs `pass 55` across Node 20, 22 and 24.
- The README's architecture section describes four components.
- The repo root holds no loose assets, and `git worktree list` is clean.

`main` still holds 12 unpushed commits plus this branch. Merging
`repo-hygiene-and-ci` and pushing `main` is the repo owner's call.

**Next:** `docs/superpowers/plans/2026-09-01-extract-import-gui-server.md`.
