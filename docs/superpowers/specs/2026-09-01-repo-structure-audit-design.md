# Repo Structure Audit — Design

**Status:** Split outcome. Findings 1-5 (the hygiene plan) are fixed, landed on
`worktree-repo-hygiene-and-extraction`. Finding 6 — the Import GUI extraction —
is complete, landed on `worktree-extract-import-gui`: `import-gui-server/` is
gone from this repo and the tool lives in a new local repo
`lancer-npc-import-gui` with its full split history, its own
README/LICENSE/CI, and the `/importer/*` contract documented on both sides and
pinned by four tests. It is **not yet published** — no GitHub repository has
been created and nothing has been pushed. See the note at the end of the
Summary.
**Repo:** this one, root-level — every component is in scope
**Source:** the read-only audit run on 2026-09-01 (classified a *spike*: its
output was an answer, not code). This document turns that answer into a spec so
the two implementation plans have something to argue from.

## Summary

The repo has accumulated four kinds of drift since the Import GUI shipped:

1. **A status document that is actively wrong.** `claude_task_status.md` still
   describes the Import GUI as *"mid-development … uncommitted, all local,
   nothing pushed."* It shipped and is committed. Anyone — human or agent —
   who reads it starts with a false model of the repo.
2. **Tests that CI never runs.** `.github/workflows/release.yml` is the only
   workflow. It validates manifests and `node --check`s the module scripts, but
   never touches the 55-test Import GUI suite. Meanwhile the command that was
   documented for running that suite does not work.
3. **A README whose own architecture section is out of date.** It opens with
   *"Three pieces"* and omits the Import GUI entirely, even though §8 of the
   same file documents it at length.
4. **Shipped work with no release notes.** The 12 commits `origin/main` has
   never seen — the Tables tab, presets, per-bullet roll weights — have no
   `CHANGELOG.md` section. `release.yml` compiles that file into the "what's
   new" dialog Foundry shows players, and falls back to raw commit subjects when
   a version has no section. A release cut today would ship developer commit
   subjects to players.
5. **Loose ends on disk.** Four stale worktrees carrying unmerged commits, a
   45KB PNG in the repo root, a gitignored to-do list belonging to a different
   project, and 160KB of completed plan documents that make up 100% of `docs/`.

Separately, the audit asked whether `import-gui-server/` belongs in this repo at
all. It does not — see [The Import GUI's home](#the-import-guis-home).

**Update (this branch, `worktree-repo-hygiene-and-extraction`):** findings 1-5
above are fixed by the hygiene plan
(`docs/superpowers/plans/2026-09-01-repo-hygiene-and-ci.md`, now marked
complete) — the false status doc is gone, the suite runs in CI, the README's
architecture section covers all four components, the changelog has its
`0.2.1` section, and the loose worktrees/PNG are cleared. The extraction below
is untouched: `import-gui-server/` still lives in this repo, and everything
about `lancer-npc-import-gui` and "The Import GUI's home" remains outstanding
work for `docs/superpowers/plans/2026-09-01-extract-import-gui-server.md`.

**Update (this branch, `worktree-extract-import-gui`):** the extraction
described below is now complete —
`docs/superpowers/plans/2026-09-01-extract-import-gui-server.md` is marked
complete. `import-gui-server/` has been removed from this repo and the tool
lives in a new local repo `lancer-npc-import-gui` with its full split
history, its own README/LICENSE/CI, and the `/importer/*` contract
documented on both sides and pinned by four tests. It is **not yet
published**: the GitHub repository has not been created and nothing has been
pushed (`gh` is not installed here and there is no SSH key), so the CI
workflow has never run on GitHub Actions.

## Verified facts

Everything below was measured on 2026-09-01 against `main` at `80b457b`, on
Node v26.7.0.

| Claim | Evidence |
|---|---|
| The documented test command is broken | `node --test import-gui-server/test/` → `Error: Cannot find module '…/import-gui-server/test'`, `code: 'MODULE_NOT_FOUND'`. The trailing directory is resolved as a module, not a test path. |
| The suite itself is healthy | `cd import-gui-server && node --test` → `pass 55`, `fail 0`. |
| 55 is 54 real tests plus one empty file | Node treats *every* `.js` file under a directory named `test/` as a test file, so `test/helpers/testServer.js` — a helper that registers no tests — is counted as one passing test. Running the seven `*.test.js` files explicitly gives `pass 54`. |
| CI never runs it | `.github/workflows/` contains only `release.yml`; it has no `node --test` step. |
| `main` has unpushed work | `git rev-list --count origin/main..main` → `12`. `origin/main` is `abf03b9`; local `main` is `80b457b`. |
| That work has no changelog section | `CHANGELOG.md`'s newest section is `## 0.2.0 - Import GUI`. A `0.2.1` section for it was already drafted on `worktree-docs-catchup` (`012ff87`, `63d3217`) and compiles: `node tools/build-changelog.mjs --version 0.2.1` → `wrote 5 entries … (newest 0.2.1, from CHANGELOG.md)`. |
| Four worktrees are stale | `worktree-plan-cleanup` 1 ahead / 0 behind; `worktree-docs-catchup` 2 ahead / 1 behind; `worktree-add-claude-md-read-guidance` and `worktree-claudeignore-to-deny-rules` 1 ahead / **12 behind** each (both branched from `origin/main`, so a naive merge would revert the 12 unpushed commits). |
| The Import GUI has no runtime tie to the relay | `import-gui-server/server.js` requires only `node:` builtins plus its own `lib/`. Nothing in it mentions SillyTavern. |
| Its only tie to this repo is an HTTP contract | `foundry-module/…/scripts/importer.js` calls exactly three endpoints — `GET /importer/pending`, `POST /importer/complete`, `POST /importer/reconcile` — authenticated with an `X-Import-Gui-Key` header. |
| Every data dependency lives elsewhere | `npcManifestPath`, `npcTablesPath`, `stagedImportsDir`, `generateNpcScript` all point into the separate `Lancer-TTRPG-GM-Hub` repo. The GUI does not just read `npc-generator-tables.md`; it **writes** it. |
| The double-nested component dirs are load-bearing | `release.yml` sets `MODULE_DIR: foundry-module/foundryvtt-to-sillytavern-nhp-uplink` and zips with `working-directory: ${{ env.MODULE_DIR }}`, so `module.json` lands at the zip root — the only layout Foundry's installer accepts. The inner name is also the install-folder name. |

## The Import GUI's home

**Decision: extract `import-gui-server/` into its own new repository**, created
at `G:\GIT REPOS\` alongside this one.

The audit recommended folding it into `Lancer-TTRPG-GM-Hub` instead, on the
grounds that every file the GUI reads and writes lives there. The repo owner
chose a new standalone repo. That trade is recorded here rather than
re-litigated:

- **What the new repo buys:** the tool gets its own release cadence, its own
  CI, and a README that is about the tool rather than a §8 inside a 940-line
  document about something else. This repo stops shipping a component that
  shares none of its subject matter.
- **What it costs:** the GUI still reads and writes files owned by
  `Lancer-TTRPG-GM-Hub` across a path in `config.json`, so that coupling is
  unchanged and now spans three repos instead of two. The Foundry half
  (`scripts/importer.js`) must stay here, because it ships inside `module.zip`,
  so the `/importer/*` contract now spans a repo boundary and has to be
  documented on both sides rather than being implicitly correct.

**Name:** `lancer-npc-import-gui`. It is the one part of this project that is
about LANCER NPCs rather than about the Foundry↔SillyTavern bridge, and the
name should not inherit either application's name.

**What moves:** `import-gui-server/` (with its git history, via
`git subtree split`), `docs/known-issues.md` (entirely about the GUI), and
`docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md`
(likewise).

**What stays:** `foundry-module/…/scripts/importer.js`, the four
`importer*` module settings, and a short §8 in the README pointing at the new
repo.

## Scope split

This spec covers two independent subsystems, so it produces two plans. Each one
leaves the repo in a working, testable state on its own.

| Plan | Covers | Depends on |
|---|---|---|
| `2026-09-01-repo-hygiene-and-ci.md` | Findings 1–5 above: the false status doc, CI, the broken test command, the README architecture section, the missing changelog section, the loose files and stale worktrees. | Nothing. |
| `2026-09-01-extract-import-gui-server.md` | The extraction decided above. | The hygiene plan, because the test workflow it writes is the workflow the new repo inherits, and because splitting history off a `main` with four stale worktrees hanging on it is avoidable pain. |

## Non-goals

- **Flattening the nested component directories.** They are load-bearing; the
  hygiene plan writes that down so nobody "fixes" them later.
- **Restructuring the README beyond its architecture section.** It is 940 lines
  and that is a real cost, but splitting it is a separate decision and the
  extraction removes ~85 of those lines anyway.
- **Fixing anything in `docs/known-issues.md`.** Those six parked issues are
  recorded debt, not this work. They travel to the new repo unchanged.
- **Pushing `main`.** The 12 unpushed commits are the owner's to push. Both
  plans stop at a local commit.

## Success criteria

1. `docs/` contains documents written for humans, and no document in the repo
   describes shipped work as unshipped.
2. A push or PR runs the Import GUI suite in CI, and the command a contributor
   is told to run locally is the command that works.
3. The README's architecture section accounts for every component the README
   documents.
4. Every shipped change has a changelog section, so a release cut at any moment
   shows players prose rather than commit subjects.
5. `git worktree list` shows only worktrees in active use.
6. `import-gui-server/` lives in `lancer-npc-import-gui` with its history, its
   own green CI, and a README of its own; this repo keeps only the Foundry half
   and a pointer; the `/importer/*` contract is written down in both repos.
