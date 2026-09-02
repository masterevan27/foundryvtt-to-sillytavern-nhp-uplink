# Extract the Import GUI Into Its Own Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Complete. All five tasks landed on `worktree-extract-import-gui`
(source commits `00a9525`..`ac41746`; the new repo `lancer-npc-import-gui`
seeded through `3fe23fe`) — the existing worktree branch, not a new
`extract-import-gui-server` branch as Task 1 Step 1 and Task 2 Step 7
specified. The new repo is committed **locally only** and has not been
published: Task 3 Step 7's `gh repo create ... --push` and CI check did not
run (`gh` is not installed here and there is no SSH key), so that step is left
unchecked below and `test.yml` has never executed on GitHub Actions. Task 5
Step 1's push/CI gate was unsatisfiable for the same reason and was replaced
with a content check (see its note). Every other step below is checked off as
actually done; a handful carry a parenthetical note where what happened
differs from what was written.

**Goal:** Move `import-gui-server/` — with its git history, its 55-test suite
and its documentation — into a new standalone repository
`lancer-npc-import-gui`, leaving this repo with only the Foundry half of the
importer, a README pointer, and a written record of the HTTP contract that now
spans the two repos.

**Architecture:** `git subtree split --prefix=import-gui-server` produces a
branch whose history contains only that directory's commits; the new repo is
seeded from it, so `git log` on `server.js` still works afterwards. The Foundry
half (`scripts/importer.js`) stays here because it ships inside `module.zip`,
which makes the three `/importer/*` endpoints a cross-repo interface — this plan
writes that contract down in both repos, and adds a contract test on the server
side so a change to it fails loudly rather than silently.

**Tech Stack:** git subtree, GitHub Actions, Node's built-in test runner
(`node:test`), `gh` CLI, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-01-repo-structure-audit-design.md`

## Global Constraints

- **Run the hygiene plan first.**
  `docs/superpowers/plans/2026-09-01-repo-hygiene-and-ci.md` must be complete and
  merged into `main`. This plan moves the `test.yml` that plan writes, edits the
  `CLAUDE.md` it creates, and moves the `docs/known-issues.md` it lands.
- **New repo name:** `lancer-npc-import-gui`. **New repo path:**
  `G:\GIT REPOS\lancer-npc-import-gui` — a sibling of this repo, as the owner
  specified.
- **Licence:** GPL-3.0-or-later. The new repo ships this repo's `LICENSE`
  verbatim, and every `.js` file already carries the SPDX header block; do not
  strip or reword it.
- **The test command is `node --test`, run from the repo root in the new repo**
  (it was `cd import-gui-server && node --test` here). Expect `pass 55`,
  `fail 0`.
- **Do not rename, re-namespace, or reformat any moved file in Tasks 1-3.** The
  split must be a pure move so a `git log --follow` still crosses it. Edits to
  moved files come after, in Task 4.
- **Do not push `main` in this repo without the owner's say-so.** Task 5 commits
  locally.
- **The three endpoints are fixed:** `GET /importer/pending`,
  `POST /importer/complete`, `POST /importer/reconcile`, all authenticated with
  the `X-Import-Gui-Key` header. Changing any of them breaks a shipped Foundry
  module and is out of scope.

---

## File Structure

### New repo — `G:\GIT REPOS\lancer-npc-import-gui`

| File | Origin | Responsibility |
|---|---|---|
| `server.js`, `lib/`, `public/`, `test/`, `config.example.json` | subtree split of `import-gui-server/` | Unchanged. The tool. |
| `README.md` | New (Task 3) | Everything §8 of the uplink README said, plus what a repo needs on its own: what it is, install, config, the four tabs, how to run the tests. |
| `LICENSE` | Copied from this repo | GPL-3.0-or-later. |
| `.gitignore` | New (Task 3) | The four entries from this repo's `.gitignore` that were about this tool, plus the Node/OS/editor blocks. |
| `.github/workflows/test.yml` | Moved from this repo (Task 3) | Same job, `working-directory` dropped. |
| `docs/known-issues.md` | Moved (Task 3) | The six parked issues. Already entirely about this tool. |
| `docs/tables-editor-and-presets-design.md` | Moved (Task 3) | The design spec for the Tables/Presets feature. |
| `docs/foundry-importer-contract.md` | New (Task 2) | The three `/importer/*` endpoints, their payloads, and the rule that they cannot change unilaterally. |
| `test/importerContract.test.js` | New (Task 2) | Pins the contract: the three endpoints exist, return the documented response shapes, and 404 rather than falling through. |

### This repo

| File | Change |
|---|---|
| `import-gui-server/` | **Deleted** (Task 5) |
| `README.md` §8 | Cut from ~85 lines to a ~12-line pointer (Task 5) |
| `CLAUDE.md` | Component table drops the fourth row; test section rewritten (Task 5) |
| `docs/known-issues.md` | **Deleted** — moved to the new repo (Task 5) |
| `docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md` | **Deleted** — moved to the new repo (Task 5) |
| `.github/workflows/test.yml` | **Deleted** — no suite is left here (Task 5) |
| `.gitignore` | Drops `import-gui-server/config.json` and `import-gui-server/.imported.json` (Task 5) |
| `docs/foundry-importer-contract.md` | **Created** — the same contract document, from this side (Task 2) |
| `foundry-module/…/scripts/importer.js` | Header comment and two setting hints repointed at the new repo (Task 4) |

---

## Task 1: Split the history and seed the new repo

`git subtree split` rewrites the commits that touched one directory into a
standalone branch whose paths are rooted at that directory. Seeding the new repo
from that branch — rather than copying files — is what keeps `git blame` and
`git log` useful on `server.js`, which is 46KB of code with real history behind
it.

**Files:**
- Create: `G:\GIT REPOS\lancer-npc-import-gui\` (git repo, seeded)
- Modify: nothing in this repo — the split branch is temporary

**Interfaces:**
- Consumes: `main` of this repo, with the hygiene plan merged.
- Produces: a local git repo at `G:\GIT REPOS\lancer-npc-import-gui` whose
  `main` branch has `server.js`, `lib/`, `public/`, `test/` and
  `config.example.json` at its root. Tasks 2 and 3 build on it.

- [x] **Step 1: Confirm the preconditions** *(ran, except `git switch main` —
  skipped, since this work runs in a worktree already checked out at the
  right commit)*

```bash
git switch main
git status --porcelain
ls docs/known-issues.md .github/workflows/test.yml CLAUDE.md
ls "G:/GIT REPOS/lancer-npc-import-gui" 2>/dev/null && echo "TARGET EXISTS -- STOP" || echo "target path is free"
```

Expected: no output from `git status --porcelain`; all three files listed; and
`target path is free`. If the target exists, stop and resolve it with the owner
rather than writing into it.

- [x] **Step 2: Produce the split branch**

```bash
git subtree split --prefix=import-gui-server -b import-gui-split
git log --oneline import-gui-split | wc -l
git ls-tree --name-only import-gui-split
```

Expected: a non-zero commit count, and a tree listing exactly
`config.example.json`, `lib`, `public`, `server.js`, `test` — with **no**
`import-gui-server` prefix. If the tree still shows the prefix, the split did
not run; do not continue.

- [x] **Step 3: Verify the split preserved history, not just files**

```bash
git log --oneline -5 import-gui-split -- server.js
```

Expected: several commits with their original subjects (e.g. the `feat:` commits
that added weights and presets). A single "Initial commit" here means you have a
copy, not a split — redo Step 2.

- [x] **Step 4: Create the new repo from the split branch**

```bash
mkdir -p "G:/GIT REPOS/lancer-npc-import-gui"
cd "G:/GIT REPOS/lancer-npc-import-gui"
git init -b main
git fetch "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink" import-gui-split
git reset --hard FETCH_HEAD
ls
```

Expected: `config.example.json  lib  public  server.js  test`.

- [x] **Step 5: Prove the suite passes in its new home**

```bash
node --test 2>&1 | tail -8
```

Expected: `tests 55`, `pass 55`, `fail 0`. Run from the repo root — the extra
`cd` this project needed is gone, because `test/` is now directly beneath the
working directory.

- [x] **Step 6: Commit (nothing to commit yet — verify instead)**

The reset produced a working tree identical to `FETCH_HEAD`; there is no new
commit to make. Confirm:

```bash
git status --porcelain
git log --oneline -1
```

Expected: no output from the first, and the newest split commit from the second.

- [x] **Step 7: Clean up the temporary branch in the source repo**

```bash
cd "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink"
git branch -D import-gui-split
```

The new repo already has the commits; the branch here has done its job. Do
**not** delete `import-gui-server/` yet — Task 5 does that, after the new repo is
pushed and green.

---

## Task 2: Write down the cross-repo contract, and pin it with a test

Until now, `scripts/importer.js` and `server.js` lived in one repo and one
commit could change both sides together. They no longer do. Three endpoints now
form an interface between two independently-versioned repositories, and a
shipped `module.zip` in someone's Foundry install is the other party.

This task writes the contract in both repos and adds a test on the server side
that fails if any part of it moves.

**Files:**
- Create: `G:\GIT REPOS\lancer-npc-import-gui\docs\foundry-importer-contract.md`
- Create: `G:\GIT REPOS\lancer-npc-import-gui\test\importerContract.test.js`
- Create: `docs/foundry-importer-contract.md` (this repo — same document)

**Interfaces:**
- Consumes: `startTestServer({ tablesText, port })` from
  `test/helpers/testServer.js`, which returns `{ baseUrl, dir, tablesPath, presetsDir, stop() }`
  and **throws** unless given an explicit `port`.
- Produces: `test/importerContract.test.js`, which takes port **5196**. Ports
  5197, 5198 and 5199 are already taken by `helpers.testServer.test.js`,
  `api.presets.test.js` and `api.tableBullets.test.js` respectively; any future
  test file needs another free one.

- [x] **Step 1: Re-read both sides before writing the document down**

```bash
cd "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink"
sed -n '98,132p' foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
cd "G:/GIT REPOS/lancer-npc-import-gui"
sed -n '319,342p;1069,1103p' server.js
```

Expected: the client's `endpoint()`/`authHeaders()`/three `fetch` calls, and the
server's `queueImport()` job shape plus `handleImporter()`. The document below
must match what you see; if it does not, the code is right and this plan is
stale — write down the code.

- [x] **Step 2: Write the failing test**

Create `test/importerContract.test.js` in the new repo:

```javascript
/*
 * The /importer/* routes are a CROSS-REPO interface: the client is
 * scripts/importer.js inside the Foundry module of
 * masterevan27/foundryvtt-to-sillytavern-nhp-uplink, shipped in module.zip and
 * already installed in worlds we cannot update. These tests pin the shape both
 * sides agreed on. A failure here is not a bug in the test -- it means a
 * shipped Foundry module has just been broken.
 *
 * See docs/foundry-importer-contract.md.
 */
const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 5196;
const TABLES = '# Tables\n\n## Role\n\n- Assault\n';

test('/importer/pending returns a jobs array', async () => {
    const srv = await startTestServer({ tablesText: TABLES, port: PORT });
    try {
        const res = await fetch(`${srv.baseUrl}/importer/pending`);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.ok(Array.isArray(body.jobs), 'jobs must be an array');
    } finally {
        await srv.stop();
    }
});

test('/importer/complete rejects an unknown job with 409, not a throw', async () => {
    const srv = await startTestServer({ tablesText: TABLES, port: PORT });
    try {
        const res = await fetch(`${srv.baseUrl}/importer/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: 'nope', itemId: 'nope', ok: true }),
        });
        assert.strictEqual(res.status, 409);
        assert.deepStrictEqual(await res.json(), { ok: false });
    } finally {
        await srv.stop();
    }
});

test('/importer/reconcile accepts an entries array and reports what it tracks', async () => {
    const srv = await startTestServer({ tablesText: TABLES, port: PORT });
    try {
        const res = await fetch(`${srv.baseUrl}/importer/reconcile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: [] }),
        });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.ok, true);
        assert.strictEqual(typeof body.tracked, 'number');
    } finally {
        await srv.stop();
    }
});

test('an unknown /importer/ route 404s rather than falling through to /api', async () => {
    const srv = await startTestServer({ tablesText: TABLES, port: PORT });
    try {
        const res = await fetch(`${srv.baseUrl}/importer/nonsense`);
        assert.strictEqual(res.status, 404);
    } finally {
        await srv.stop();
    }
});
```

- [x] **Step 3: Run it to verify it fails**

Before running, temporarily rename one route in `server.js` — change
`url.pathname === '/importer/pending'` to `'/importer/pendingX'` — then:

```bash
node --test test/importerContract.test.js 2>&1 | tail -8
```

Expected: `fail 1` — the first test gets a 404 instead of 200. This proves the
test is actually watching the route and not passing vacuously.

- [x] **Step 4: Restore the route and verify it passes**

```bash
git checkout -- server.js
node --test test/importerContract.test.js 2>&1 | tail -8
node --test 2>&1 | tail -8
```

Expected: `pass 4` from the first run, then `tests 59`, `pass 59`, `fail 0` from
the whole suite — the previous 55 plus these 4.

- [x] **Step 5: Write the contract document**

Create `docs/foundry-importer-contract.md` in the new repo:

````markdown
# The Foundry importer contract

This server's `/importer/*` routes are consumed by
`scripts/importer.js` inside the Foundry module of
[foundryvtt-to-sillytavern-nhp-uplink](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink),
which ships inside `module.zip`. The two live in different repositories and
version independently, and a released module is already installed in worlds
nobody here can update.

**So these three routes cannot change unilaterally.** `test/importerContract.test.js`
pins them. A failure there means a shipped Foundry module has been broken.

## Direction

Foundry only ever calls *out*. This server never reaches into a running world,
and the module declares `"socket": false`. Exactly one client polls: the primary
active GM.

## Authentication

Every `/importer/*` request carries:

```
X-Import-Gui-Key: <config.secret>
```

An empty `secret` in `config.json` disables the check. A mismatch is
`401 {"error": "bad or missing X-Import-Gui-Key"}`.

Responses set `Access-Control-Allow-Origin`, because these requests are
cross-origin from Foundry's browser page. The `/api/*` routes do not need this —
they are same-origin with the page this server itself serves.

## `GET /importer/pending`

Returns jobs the GM queued and marks each one `sent`.

```json
{ "jobs": [
  {
    "jobId": "<uuid>",
    "itemId": "<generator's stable item id>",
    "kind": "npc",
    "name": "...",
    "callsign": "...",
    "role": "... or null",
    "faction": "... or null",
    "portraitPath": "<path relative to Foundry's Data/>",
    "tokenPath": "<path relative to Foundry's Data/>",
    "status": "sent",
    "queuedAt": 1234567890,
    "sentAt": 1234567890
  }
] }
```

`portraitPath` and `tokenPath` are already relative to Foundry's `Data/`
directory — this server resolves and, if needed, copies the files under
`config.foundryDataRoot` before queueing. The module sets them straight onto the
Actor; no file transfer happens over this connection.

A job left `sent` for more than two minutes (`SENT_STALE_MS`) is re-offered on
the next poll, so a GM who reloaded mid-import is not stuck.

## `POST /importer/complete`

```json
{ "jobId": "...", "itemId": "...", "ok": true, "actorId": "...", "actorUuid": "...", "error": "only when ok is false" }
```

`200 {"ok": true}` when the `jobId` matches the job held for that `itemId`;
`409 {"ok": false}` when it does not. A `409` is not an error condition — it is
how a duplicate or stale report is refused.

## `POST /importer/reconcile`

```json
{ "entries": [ { "itemId": "...", "actorId": "...", "actorUuid": "..." } ] }
```

The **full** set of Actors currently carrying the module's `importItemId` flag,
sent on every poll. This server replaces its index with it, so deleting an Actor
in Foundry makes that item importable again on the next tick and a fresh machine
with no local state still sees the right picture on first connect.

Returns `200 {"ok": true, "tracked": <index size>}`.

## Changing any of this

Land the server change and the module change together, and bump the module. If
the module cannot be updated in step, add a route rather than altering one.
````

- [x] **Step 6: Put the same document in this repo**

The Foundry half needs the contract too, and a reader there should not have to
find another repository to learn what `importer.js` is talking to.

```bash
cd "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink"
mkdir -p docs
cp "G:/GIT REPOS/lancer-npc-import-gui/docs/foundry-importer-contract.md" docs/foundry-importer-contract.md
```

Then edit this repo's copy: in the opening paragraph, swap the two sides around
so it reads from this repo's point of view — `scripts/importer.js` *in this
repo* consumes the `/importer/*` routes served by
[lancer-npc-import-gui](https://github.com/masterevan27/lancer-npc-import-gui) —
and change the `test/importerContract.test.js` reference to name that repo.
Everything from `## Direction` onward is identical and needs no edit.

- [x] **Step 7: Commit, in both repos** *(ran, except `git switch -c
  extract-import-gui-server main` in this repo — the existing worktree branch
  `worktree-extract-import-gui` was used instead)*

```bash
cd "G:/GIT REPOS/lancer-npc-import-gui"
git add test/importerContract.test.js docs/foundry-importer-contract.md
git commit -m "test: pin the cross-repo Foundry importer contract"

cd "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink"
git switch -c extract-import-gui-server main
git add docs/foundry-importer-contract.md
git commit -m "docs: record the importer contract now that the server lives elsewhere"
```

---

## Task 3: Make the new repo a repo — licence, README, ignore rules, CI

Right now `lancer-npc-import-gui` is five paths and a test suite. This task gives
it the things a standalone repository needs, and moves across the two documents
that were only ever about this tool.

**Files:**
- Create: `LICENSE`, `README.md`, `.gitignore`, `.github/workflows/test.yml`
- Create: `docs/known-issues.md`, `docs/tables-editor-and-presets-design.md`
  (both moved from this repo)

**Interfaces:**
- Consumes: this repo's `LICENSE`, `docs/known-issues.md`,
  `docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md`,
  and `.github/workflows/test.yml`.
- Produces: a pushable repo. Task 5 deletes this repo's copies only after this
  task's push is green.

- [x] **Step 1: Copy the licence and the two documents across**

```bash
cd "G:/GIT REPOS/lancer-npc-import-gui"
mkdir -p docs .github/workflows
cp "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink/LICENSE" LICENSE
cp "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink/docs/known-issues.md" docs/known-issues.md
cp "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink/docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md" docs/tables-editor-and-presets-design.md
ls -l LICENSE docs/
```

Expected: a 35,823-byte `LICENSE` and two files in `docs/`.

- [x] **Step 2: Repoint the paths inside the two moved documents**

Both were written from inside the uplink repo and refer to it. Confirm the hits
first:

```bash
grep -n "import-gui-server/\|\.\./\.\./" docs/known-issues.md docs/tables-editor-and-presets-design.md
```

Expected: six hits. Make exactly these edits.

In `docs/known-issues.md`:

| From | To |
|---|---|
| ``Parked technical debt in `import-gui-server/`.`` | `Parked technical debt in this tool.` |

Its other reference — to
`docs/superpowers/plans/2026-09-01-tables-and-presets-refinements.md`, "deleted
once its work shipped … merged to `main` at `eb06a0a`" — is uplink history and
stays, but the sentence now needs to say whose history it is. Change "which was
deleted once its work shipped" to "which was deleted from the
`foundryvtt-to-sillytavern-nhp-uplink` repo once its work shipped".

In `docs/tables-editor-and-presets-design.md`:

| From | To |
|---|---|
| ``**Repo:** `import-gui-server/` (Import GUI), reading/writing`` | `**Repo:** this one (the Import GUI), reading/writing` |
| ``> Read `import-gui-server/lib/presets.js` and its tests`` | ``> Read `lib/presets.js` and its tests`` |
| ``> [`docs/known-issues.md`](../../known-issues.md).`` | ``> [`known-issues.md`](known-issues.md).`` |
| ``## Server (`import-gui-server/server.js`)`` | ``## Server (`server.js`)`` |
| ``## Client (`import-gui-server/public/`)`` | ``## Client (`public/`)`` |

Leave every reference to `Lancer-TTRPG-GM-Hub`, `npc-generator-tables.md`,
`.claude_to_do_list.md` and the uplink repo alone — those all point outside this
repo and are still correct.

- [x] **Step 3: Write `.gitignore`**

```gitignore
# Local configuration -- config.json holds the shared secret that authorises
# Foundry -> import GUI requests, and absolute paths into this machine's
# Foundry install. Ship config.example.json instead.
config.json
.imported.json
config.local.json
*.local.json
.env
.env.*
!.env.example

# Node -- there are no dependencies (stdlib only), but tooling still lands here.
node_modules/
npm-debug.log*
package-lock.json

# Logs and runtime scratch
*.log
*.pid
*.tmp
.cache/
tmp/

# Editors / IDEs
.vscode/
!.vscode/extensions.json
.idea/
*.swp
*.swo
*~

# OS cruft
.DS_Store
._*
Thumbs.db
desktop.ini
```

- [x] **Step 4: Write the workflow**

Create `.github/workflows/test.yml`. It is the uplink repo's file with three
changes, all because `test/` now sits at the repo root: the
`working-directory: import-gui-server` line is gone, the job is renamed from
`import-gui-server` to `test`, and the opening comment drops the paragraph about
why the `cd` was necessary.

```yaml
# Runs the suite. Everything here is Node stdlib (node:test, node:http, global
# fetch), so there is nothing to install and no cache to warm.
#
# The suite spawns real server.js child processes on FIXED ports (see
# test/helpers/testServer.js, which throws unless given an explicit port).
# Matrix jobs get separate runners, so they cannot collide with each other;
# within a job, each test file was given a distinct port.
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
  test:
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

      - run: node --test
```

- [x] **Step 5: Write the README**

Create `README.md`. It carries what §8 of the uplink README said, plus the
framing a standalone repo needs:

````markdown
# Lancer NPC Import GUI

A local web tool for turning NPCs rolled by
[`generate-npc.py`](https://github.com/masterevan27/Lancer-TTRPG-GM-Hub) into
Foundry VTT Actors — and for curating the roll tables that generator draws from
— instead of hand-copying files through Foundry's file picker and hand-editing
markdown.

It is a companion to
[foundryvtt-to-sillytavern-nhp-uplink](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink),
whose Foundry module contains the half that actually creates the Actors. It has
no dependency on that project's SillyTavern narration relay and works whether or
not you use SillyTavern at all.

## What you need

- **Node 20 or newer.** No dependencies — this is Node stdlib only, and there is
  no `package.json`.
- **Python and `generate-npc.py`**, from the
  [Lancer TTRPG GM Hub](https://github.com/masterevan27/Lancer-TTRPG-GM-Hub)
  repo. This tool reads that script's `.generated-npcs.json` run log directly
  off disk, and reads and writes its `npc-generator-tables.md`.
- **The Foundry module**, installed and configured — see
  [Point Foundry at this server](#point-foundry-at-this-server).

## Install

```bash
git clone https://github.com/masterevan27/lancer-npc-import-gui
cd lancer-npc-import-gui
cp config.example.json config.json
```

Edit `config.json`. Only these four matter:

```json
{
  "port": 5089,
  "host": "127.0.0.1",
  "secret": "",
  "npcManifestPath": "<path to generate-npc.py's .generated-npcs.json>",
  "foundryDataRoot": "<path to your Foundry install's Data directory>"
}
```

Everything else in `config.example.json` is optional and derived by default:

- `pythonExecutable` / `generateNpcScript` — how to invoke the generator for
  **Create NPC** and **Regenerate**. Default `python`, and the script bundled
  alongside `npcManifestPath`.
- `foundryNpcSubdir` — the folder imports are nested under inside
  `foundryDataRoot`. Default `LancerNPCs`.
- `npcTablesPath` / `stagedImportsDir` — where the generator's own
  `npc-generator-tables.md` and its `npc-trait-import` skill's staged candidates
  live, for the **Tables** and **Trait Imports** tabs.
- `presetsDir` — where saved table presets are written.

Then:

```bash
node server.js
```

and open <http://127.0.0.1:5089>.

## The four tabs

- **Import Generated Art** — pick a category, click a card to preview its
  portrait and token, check the ones you want, and **Import Selected**.
  Importing copies the files into `foundryDataRoot` for you if they aren't
  there already, so nothing needs pre-staging under your Foundry Data folder by
  hand. Sort and filter the grid, see when each NPC was generated and the prompt
  that produced its art, regenerate art on any of them, and **Delete Selected**
  to remove an NPC's generated files entirely (blocked while an import or regen
  is in flight; never touches an Actor already created in Foundry).
- **Create NPC** — a form over `generate-npc.py`'s roll options (count, seed,
  name, pronouns, per-table trait overrides, portrait/token toggles,
  dry-run-vs-generate) that rolls new NPCs into the same review flow as the CLI.
- **Trait Imports** — lists reference-image trait candidates staged by the
  `npc-trait-import` skill, sortable and dated, and appends the ones you approve
  as new bullets in `npc-generator-tables.md`.
- **Tables** — shows every bullet in every table of `npc-generator-tables.md`.
  Disable ones you don't want rolled without deleting them, set per-bullet roll
  weights, and save the whole selection as a named preset. Download a preset,
  hand it to another GM, and they can import it, preview exactly what it would
  change, and apply it.

Only NPCs exist as generated content today — mechs and spaceships have no
generator yet, so their categories won't appear until something writes manifest
entries in the same shape.

## Point Foundry at this server

In Foundry: **Game Settings → Configure Settings → FoundryVTT to SillyTavern NHP
Uplink**. Set **Import GUI server URL** to this server's address (default
`http://127.0.0.1:5089`), and **Import GUI shared secret** to match
`config.secret` if you set one.

The module's primary GM client polls this server and creates the Actors; a badge
on each card flips to **Imported** once that's done. Deleting the Actor in
Foundry clears the badge again on the next poll, so re-importing later is safe.

The wire format between the two is fixed and documented in
[docs/foundry-importer-contract.md](docs/foundry-importer-contract.md). Read it
before changing any `/importer/*` route — the client ships inside a released
`module.zip`.

## Development

```bash
node --test
```

Expect `pass 59`, `fail 0`. No install step; the suite spawns real `server.js`
child processes against synthetic fixture directories, never your real
`config.json` or tables. Each test file binds a **fixed, distinct** port because
`node --test` runs files concurrently — a new test file needs a port no other
file uses.

Parked technical debt is in [docs/known-issues.md](docs/known-issues.md). The
design behind the Tables and Presets features is in
[docs/tables-editor-and-presets-design.md](docs/tables-editor-and-presets-design.md).

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).

LANCER is a trademark of Massif Press. This is an unofficial community tool with
no affiliation to Massif Press, Foundry Gaming LLC, or the SillyTavern project.
````

- [x] **Step 6: Verify the whole thing before publishing**

```bash
node --test 2>&1 | tail -8
node -e "const fs=require('fs'); for (const f of ['LICENSE','README.md','.gitignore','.github/workflows/test.yml','docs/known-issues.md','docs/tables-editor-and-presets-design.md','docs/foundry-importer-contract.md']) { if (!fs.existsSync(f)) throw new Error('missing ' + f); } console.log('all expected files present')"
grep -c "import-gui-server/" README.md docs/*.md
```

Expected: `pass 59` / `fail 0`; `all expected files present`; and `0` from every
file in the `grep -c` — no document should still describe this tool as living in
a subdirectory. (`grep -c` prints `0` and exits non-zero when there are no
matches; that non-zero exit is the success case here.)

- [ ] **Step 7: Commit and publish** *(PARTIAL — `git add -A` and the commit
  ran; `gh repo create ... --push` and `gh run list` did not: `gh` is not
  installed here and there is no SSH key, so this repo has never been pushed
  and `test.yml` has never run on GitHub Actions)*

```bash
git add -A
git commit -m "chore: make this a standalone repo -- licence, README, ignores, CI"
gh repo create lancer-npc-import-gui --public --source=. --remote=origin --push
gh run list --workflow=test.yml --limit 1
```

Expected: the repo is created and pushed, and the newest `Test` run reaches
`completed success` across all three matrix legs. Use `--private` instead of
`--public` if the owner prefers; nothing else in this plan depends on that
choice.

Do not proceed to Task 5 until this run is green — Task 5 deletes the only other
copy of this code.

---

## Task 4: Repoint the Foundry half at the new repo

`scripts/importer.js` stays here, but three of its strings now name a directory
that is about to stop existing: its header comment says
`../../../import-gui-server`, and two setting hints tell the user to look at
`import-gui-server`'s `config.json`. Those hints are visible in Foundry's
settings UI, so they are user-facing text, not just comments.

**Files:**
- Modify: `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js:23`, `:34`, `:63`, `:69`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read. No behaviour changes — the endpoint,
  header name and default port are untouched.

- [x] **Step 1: Find every reference**

```bash
cd "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink"
grep -n "import-gui-server" foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
```

Expected: four hits, at lines 23, 34, 63 and 69.

- [x] **Step 2: Update the header comment**

Change lines 23-24 from:

```javascript
 * The companion half of ../../../import-gui-server: a GM picks NPCs (and,
 * eventually, other generated content) to import in that standalone page,
```

to:

```javascript
 * The companion half of the Lancer NPC Import GUI, which lives in its own repo
 * at https://github.com/masterevan27/lancer-npc-import-gui: a GM picks NPCs
 * (and, eventually, other generated content) to import in that standalone page,
```

And line 34 from:

```javascript
 * directory (import-gui-server resolves that; see its config.foundryDataRoot),
```

to:

```javascript
 * directory (that server resolves it; see its config.foundryDataRoot),
```

Then add this paragraph immediately after the existing `Dedup:` paragraph that
ends at line 43:

```javascript
 *
 * The three /importer/* endpoints below are a CROSS-REPO contract now. See
 * docs/foundry-importer-contract.md before changing any of them: the server
 * side ships separately, and a released module.zip cannot be updated in step.
```

- [x] **Step 3: Update the two user-facing setting hints**

Line 63, from:

```javascript
    hint: "Base URL of the import-gui-server standalone tool.",
```

to:

```javascript
    hint: "Base URL of the Lancer NPC Import GUI (github.com/masterevan27/lancer-npc-import-gui).",
```

Line 69, from:

```javascript
    hint: "Must match the secret in import-gui-server's config.json. Leave blank to disable auth.",
```

to:

```javascript
    hint: "Must match the secret in the Import GUI's config.json. Leave blank to disable auth.",
```

- [x] **Step 4: Verify nothing behavioural moved**

```bash
node --check foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
grep -n "endpoint(\"/importer\|X-Import-Gui-Key\|127.0.0.1:5089" foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
```

Expected: `node --check` is silent (this is what `release.yml` runs on every
esmodule), and the grep still shows the three endpoints, the auth header and the
default `http://127.0.0.1:5089`, all unchanged.

- [x] **Step 5: Commit**

```bash
git add foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
git commit -m "docs: point the importer at the Import GUI's own repo"
```

---

## Task 5: Remove the server from this repo

Only now, with the new repo pushed and green, does the copy here come out. Along
with the directory go the two documents that moved with it, the workflow that
tested it, the ignore rules that were about its config files, and the 85-line
README section it filled.

**Files:**
- Delete: `import-gui-server/` (15 files)
- Delete: `.github/workflows/test.yml`
- Delete: `docs/known-issues.md`
- Delete: `docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md`
- Modify: `README.md` §8 (lines 380-464), `CLAUDE.md`, `.gitignore`

**Interfaces:**
- Consumes: a green CI run on `lancer-npc-import-gui` (Task 3, Step 7).
- Produces: a repo with three components and no test suite.

- [x] **Step 1: Confirm the new repo really has everything, before deleting**
  *(the gate as written could not be satisfied — nothing to push, no `gh` to
  check CI — so it was replaced with a content check: all 15 files tracked
  under `import-gui-server/` were hashed against their counterparts in the new
  repo; 15 checked, 0 mismatches, 0 missing)*

```bash
cd "G:/GIT REPOS/lancer-npc-import-gui"
git status --porcelain
git log --oneline origin/main..main
gh run list --workflow=test.yml --limit 1
```

Expected: no uncommitted changes, **nothing** unpushed, and a `completed
success` run. Any of those failing means stop — this is the last moment the code
exists in two places.

- [x] **Step 2: Delete the directory and the files that went with it**

```bash
cd "G:/GIT REPOS/FoundryVTT_to_SillyTavern_NHP_Uplink"
git rm -r import-gui-server
git rm .github/workflows/test.yml
git rm docs/known-issues.md
git rm docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md
```

Expected: 15 files removed from `import-gui-server`, plus three more.

- [x] **Step 3: Drop the ignore rules that were about it**

In `.gitignore`, delete these two lines from the "Secrets / local configuration"
block:

```gitignore
import-gui-server/config.json
import-gui-server/.imported.json
```

Leave `st-server-plugin/*/config.json` and the rest of the block alone.

- [x] **Step 4: Replace README §8 with a pointer** *(ran; the plan's line
  numbers were stale — it said section 8 began at line 380, it actually began
  at line 399, because the hygiene plan's earlier edits had moved it)*

Replace everything from `### 8. Import GUI (optional)` (line 380) up to but not
including the `---` that precedes `## Security` with:

````markdown
### 8. Import GUI (optional)

The **Lancer NPC Import GUI** lets a GM browse NPCs rolled by a companion
generator script, pick which ones become Foundry Actors, roll brand-new ones,
and curate the generator's own roll tables — instead of hand-copying files
through Foundry's file picker and hand-editing table markdown.

It lives in its own repository, with its own install and configuration
instructions:

**<https://github.com/masterevan27/lancer-npc-import-gui>**

Only the Foundry half ships here, in this module. Once that server is running,
set **Import GUI server URL** (and **Import GUI shared secret**, if you set one)
under **Game Settings → Configure Settings → FoundryVTT to SillyTavern NHP
Uplink**.

It has no dependency on the narration relay above and works whether or not you
use SillyTavern at all. The wire format between the two is documented in
[docs/foundry-importer-contract.md](docs/foundry-importer-contract.md).
````

- [x] **Step 5: Update `CLAUDE.md`**

Three edits:

1. Change "Four of them. Three form the narration relay; the fourth is
   independent." to "Three of them, forming the narration relay."
2. Delete the `import-gui-server/` row from the component table, and the
   paragraph beneath it that begins "The Import GUI has no dependency…".
   Replace that paragraph with:

   ```markdown
   The Foundry half of the **Lancer NPC Import GUI** also ships in this module
   (`scripts/importer.js`). The server half lives at
   <https://github.com/masterevan27/lancer-npc-import-gui>; the contract between
   them is in [docs/foundry-importer-contract.md](docs/foundry-importer-contract.md)
   and cannot change unilaterally.
   ```

3. Replace the whole `## Running the tests` section with:

   ````markdown
   ## Running the tests

   There is no automated suite in this repo. The only one this project has
   belongs to the Import GUI and moved out with it to
   <https://github.com/masterevan27/lancer-npc-import-gui>.

   What CI does check here, in `.github/workflows/release.yml` at release time:
   both manifests parse and declare the version being cut, every file they
   reference exists, and every `esmodule` passes `node --check`. You can run
   that last check yourself:

   ```bash
   node --check foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/uplink.js
   node --check foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js
   node --check foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/whats-new.js
   ```
   ````

   Also drop `import-gui-server/public/app.js` and `import-gui-server/server.js`
   from the "Reading files" table — `README.md` is the only large file left.

- [x] **Step 6: Verify nothing still points at the deleted directory** *(ran,
  and caught two dangling references the plan did not anticipate: a README
  ASCII-diagram box label naming `import-gui-server`, and two dead `Read()`
  deny entries in `.claude/settings.json`. Both fixed as pure removals.)*

```bash
grep -rn "import-gui-server" --include=*.md --include=*.js --include=*.json --include=*.yml . | grep -v "^./docs/superpowers/"
```

Expected: no output. Hits under `docs/superpowers/` are this plan and the audit
spec, which describe the move and are correct. A hit anywhere else is a
dangling reference — fix it before committing.

- [x] **Step 7: Verify the module still checks out**

```bash
for f in $(node -e "console.log(require('./foundry-module/foundryvtt-to-sillytavern-nhp-uplink/module.json').esmodules.join(' '))"); do
  node --check "foundry-module/foundryvtt-to-sillytavern-nhp-uplink/$f" && echo "ok $f"
done
```

Expected: `ok scripts/uplink.js`, `ok scripts/importer.js`,
`ok scripts/whats-new.js`. This is the same loop `release.yml` runs, so a pass
here means a release would still build.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: move the Import GUI server out to its own repo"
git log --oneline -1
```

- [x] **Step 9: Record it in the changelog**

Add this section directly beneath the `---` separator in `CHANGELOG.md`, above
`## 0.2.1`:

```markdown
## 0.3.0 - The Import GUI moves out

The Import GUI is now its own project. Nothing about the module changes — the
half that creates your Actors still ships here, and your existing settings keep
working — but the server you run alongside it now installs from its own
repository.

- The Import GUI server has moved to
  <https://github.com/masterevan27/lancer-npc-import-gui>. If you already have
  it running from a clone of this repo, clone the new one and copy your
  `config.json` across; nothing inside it needs to change.

Link: [Lancer NPC Import GUI](https://github.com/masterevan27/lancer-npc-import-gui) - The Import GUI's new home
```

Then verify it compiles:

```bash
node tools/build-changelog.mjs --out /tmp/cl.json --version 0.3.0 --repo-url https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink
node -e "const j=require('/tmp/cl.json'); console.log(j.entries[0].version, '|', j.entries[0].title, '|', j.entries[0].link)"
```

Expected: `0.3.0 | The Import GUI moves out | { … }` with a non-null link
object. On Windows, substitute `$env:TEMP\cl.json`.

```bash
git add CHANGELOG.md
git commit -m "docs: add the 0.3.0 changelog section for the Import GUI move"
```

---

## Done

- `lancer-npc-import-gui` exists as a **local** git repository at
  `G:\GIT REPOS\lancer-npc-import-gui`, with the tool's full split history, a
  README of its own, `pass 59` when the suite is run locally across the two
  documents that were only ever about it. It is **not** on GitHub yet: no
  repository has been created there and nothing has been pushed (`gh` is not
  installed here and there is no SSH key), so `test.yml` has never run in CI
  and the "three Node versions" claim is configured but unverified.
- This repo has three components, an `importer.js` that names where its
  counterpart lives, and no dangling references.
- The `/importer/*` contract is written down on both sides and pinned by four
  tests on the server side.

All five tasks landed on `worktree-extract-import-gui` (this worktree's own
branch), not a separate `extract-import-gui-server` branch as the plan's Task
2 Step 7 specified. That branch is committed but not merged into `main`, and
`main` itself is unpushed. Publishing the new repo, merging this branch, and
pushing `main` are all the repo owner's call.
