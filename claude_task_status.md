# Claude Task Status

_Last updated: 2026-09-01. Written for a future Claude Code session picking
this repo back up — read this before touching `import-gui-server/` or
`scripts/importer.js`._

## Project in one paragraph

This repo streams live LANCER combat from Foundry VTT into SillyTavern so a
character card can act as an AI GM. Three shipped components (Foundry module,
SillyTavern server plugin, SillyTavern UI extension) do that. A fourth,
**Import GUI**, is mid-development in the working tree right now — see below.
Full architecture and install steps are in [README.md](README.md); don't
duplicate that here, just the parts a coding session needs.

## Current progress

Working tree (uncommitted, all local, nothing pushed) has one coherent
feature: **Import GUI**, a standalone tool at `import-gui-server/` (port
5089) that lets a GM browse NPCs rolled by a companion generator script
(`generate-npc.py`, lives in the separate
[Lancer TTRPG GM Hub](https://github.com/masterevan27/Lancer-TTRPG-GM-Hub)
repo, not this one), pick which ones become Foundry Actors, regenerate art,
roll brand-new NPCs, and import reference-image trait candidates staged by
that repo's `npc-trait-import` skill.

Untracked / modified files:
- `import-gui-server/` (new, untracked) — `server.js`,
  `public/{index.html,app.js,style.css}`, `config.example.json`.
  **Implementation reads as complete**, including the 2026-09-01 session's
  additions below.
- `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/importer.js`
  (new, untracked) — the Foundry-side half. Polls `import-gui-server`'s
  `/importer/pending` the same way `uplink.js` polls the ST relay's
  `/outbound`, creates `Actor.create()` entries from queued jobs, reports
  completion, and reconciles its own flagged Actors back to the server every
  poll. Unchanged this session.
- `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/module.json` (modified)
  — `importer.js` added to `esmodules`. Small, mechanical, done.
- `README.md` (modified, +53 lines) — a full "### 8. Import GUI (optional)"
  install section already written. **Not yet updated** for this session's
  additions (Create NPC tab, Trait Imports tab, copy-on-import behavior) —
  do that before release.
- `.gitignore` (modified) — added `import-gui-server/config.json` and
  `import-gui-server/.imported.json` (real secret + generated dedup cache,
  same pattern as the existing `st-server-plugin/*/config.json` rule).
- `.claudeignore` (new, untracked) — keeps Claude's own context free of the
  same secret files plus `node_modules/`, build output, and binary
  screenshots.

### 2026-09-01 session: five fixes/features to the Import GUI

The user filed five issues against the running GUI. All five are implemented
and were verified against synthetic fixtures (see "How this was verified"
below) — not yet against the user's live Foundry world.

1. **Checkboxes disabled / Import Selected permanently greyed out — fixed.**
   Root cause: every NPC in the real manifest lived under
   `generate-npc.py`'s default ComfyUI review root
   (`G:\Documents\ComfyUI\output\LancerNPCs\...`), not under
   `foundryDataRoot`, so the old `isImportable()` (`dataRelative() !== null`)
   was false for 100% of items — confirmed by reading the real
   `.generated-npcs.json` before touching any code. Fix: importability is now
   just "do the source files exist on disk" (`fs.existsSync`); a separate
   `isUnderFoundryRoot()` gates a new copy step. **User chose "copy into
   Foundry on import" over "keep manual-move requirement"** — see
   `copyIntoFoundry()` in `server.js`.
2. **Regenerate button now reads "Regenerating…" while a regen job is
   running**, both on click and on every poll-driven re-render of the detail
   overlay (`renderRegenPanel()` in `app.js`), reverting to "Regenerate" on
   done/error.
3. **Regenerated art now follows the same folder structure as CLI-generated
   art — fixed as a side effect of #1.** `copyIntoFoundry()` doesn't just copy
   files; it rewrites the manifest entry's own key (the manifest is keyed by
   folder path) from the old review-folder path to the new
   `<foundryDataRoot>/<foundryNpcSubdir>/<category>/<name>/` path, deep-sorted
   to match `generate-art.py`'s own `save_manifest(sort_keys=True)` output
   format. Since Regenerate always reads that manifest fresh and writes back
   into whatever folder it currently points at, a later regen on an
   already-imported NPC writes straight to the Foundry-rooted copy.
4. **New "Create NPC" tab** — a GUI form over `generate-npc.py`'s roll
   options (count, seed, name, pronouns, per-table `--set-trait` overrides,
   portrait/token toggles, keep-raw-token, ComfyUI server override,
   dry-run-vs-generate), backed by `POST /api/create-npc` +
   `GET /api/create-status?jobId=`. **User chose "same ComfyUI review folder
   the CLI uses"** as the default output location (no `--out` passed) over
   writing straight into Foundry's Data root, so GUI-created NPCs go through
   the same review-then-import flow as everything else, using the fix from
   #1 to import them.
5. **New "Trait Imports" tab** — reads every `*.json` file under the
   `npc-trait-import` skill's `staged-imports/` directory (path derived from
   `generateNpcScript`'s location the same way `generate-npc.py` derives its
   own `DEFAULT_TABLES`; overridable via `npcTablesPath`/`stagedImportsDir` in
   config.json), lists each candidate with its target table/category, and on
   import appends the bullet as the last line of that table's `## <table>`
   section in `npc-generator-tables.md` (refusing rather than inventing a
   heading that doesn't exist), then marks the candidate `imported` in its
   staged JSON file so it can't be double-imported. `GET /api/trait-candidates`
   + `POST /api/trait-candidates/import`.

New config.json keys (all optional, default-derived): `foundryNpcSubdir`
(default `"LancerNPCs"` — the folder copy-on-import nests everything under,
inside `foundryDataRoot`), `npcTablesPath`, `stagedImportsDir`.

### How this was verified (2026-09-01)

No project skill exists yet for running this app (checked — none found), and
`chromium-cli` isn't installed in this Windows/git-bash environment, so
Playwright was installed ad hoc (`npx playwright install chromium
--with-deps`) to drive a real headless browser against the running server.

Critically, **testing did not run against the user's real
`.generated-npcs.json` / real Foundry Data root** for anything that writes
(the copy-on-import and trait-import-into-tables-file endpoints are real
file-mutation operations, and mutating the user's actual campaign data as a
side effect of a test run would have been a mistake). Instead:
- Synthetic fixtures were built in the session's scratchpad directory: a fake
  one-NPC manifest + review folder, a fake `foundryDataRoot`, a fake
  `npc-generator-tables.md` (two tables, a couple bullets each), and two fake
  `staged-imports/*.json` files.
- The repo's real `import-gui-server/config.json` was backed up, temporarily
  swapped for one pointing at the synthetic fixtures, exercised via `curl`
  (copy-on-import, manifest-key rewrite, trait-candidate import into the fake
  tables file, both success and "no such heading" failure paths, an
  already-imported re-import rejection) and via a Playwright script (all
  three tabs load with zero console errors; the previously-disabled checkbox
  is now clickable and enables Import Selected), then restored byte-for-byte
  from the backup.
- One exception: `POST /api/create-npc` with `dryRun:true` **was** run
  against the real `generate-npc.py` and the real `npc-generator-tables.md`,
  because a dry run provably writes nothing (confirmed by reading
  `regenerate_one`/`main` in `generate-npc.py` — the dry-run branch returns
  before any file or manifest write). It round-tripped correctly: rolled one
  NPC, applied `--name`/`--pronouns`/`--set-trait Role=`, returned the
  prompt-preview log.
- After testing, the real `config.json` was confirmed restored exactly and
  the real server was restarted; `GET /api/items?category=npc` against the
  real manifest was re-checked afterward and now shows
  `importable: true` for all 5 real NPCs (previously `false` for all 5),
  confirming the root-cause diagnosis and fix against real data — this read
  is safe, nothing was written.
- **Not yet done:** an actual click of "Import Selected" against the real
  manifest/Foundry root, and a real (non-dry-run) "Create NPC" generation
  against a live ComfyUI. Both are safe to try now but weren't run this
  session to avoid mutating real data/spending real GPU time without the
  user watching.

## Architectural decisions worth knowing

- **Import GUI is a fourth standalone component, not folded into the
  existing server plugin.** It runs its own Node process, own port (5089,
  vs. the ST relay's 5088), own config.json/secret, deliberately mirroring
  the existing `st-server-plugin` shape rather than introducing a new
  pattern.
- **Two faces on one process**, same split as the ST relay: GM-facing
  `/api/*` routes (same-origin with the page it also serves out of
  `public/`, so no CORS needed there) vs. a Foundry-facing poll queue under
  `/importer/*` (Foundry only ever calls out, never accepts inbound).
- **Importing now copies files in, rather than requiring them to already be
  under `foundryDataRoot`.** (Changed 2026-09-01, superseding the prior
  "images are never uploaded/transferred" design — see item 1/3 above and
  `copyIntoFoundry()`'s doc comment in `server.js` for the full rationale.)
- **Dedup is server-authoritative but Foundry-verified.** `.imported.json` is
  a fast local cache, explicitly documented as *not* the source of truth —
  `reconcile()` rebuilds it every poll from the actual `flags.<MOD>.importItemId`
  values Foundry reports. Deleting an Actor in Foundry un-marks it as
  imported on the next poll, so re-importing later is safe.
- **Art regeneration and NPC creation both run synchronously in this server,
  not via the Foundry poll queue** — they shell out to `generate-npc.py`
  directly (talks to ComfyUI itself) since there's no Foundry-side action
  involved. One job lingers per item/jobId after completion so a client
  mid-poll still sees the final status.
- **Only NPCs exist as generated content today.** Mechs/spaceships have no
  generator, so `itemView()`'s `roleCategory` logic and the regen/create
  gates (`item.kind !== 'npc'`) are the places that would need extending if
  that ever changes.
- The `npc-trait-import` skill (lives in the GM Hub repo, at
  `.claude/skills/npc-trait-import/SKILL.md`) deliberately never edits
  `npc-generator-tables.md` itself — it stages candidates for "a webpage
  built for this purpose" to review/import. The Trait Imports tab is that
  webpage; keep the two in sync if either's staged-JSON shape or the
  bullet/table grammar changes.
- Unrelated prior work in the GM Hub repo: `npc-generator-tables.md` and
  `generate-npc.py` got a `mil`/`civ` flag system so military Roles roll
  military uniforms + are biased toward armed Gear. Already complete and
  verified there; mentioned here only because this GUI's regen/create paths
  call into that same script.

## Next steps

1. **Exercise the four new/changed flows against real data, with the user
   present:** click Import Selected on a real NPC and confirm the files show
   up correctly nested under `foundryDataRoot\LancerNPCs\<category>\<name>\`
   and the manifest updates; regenerate art on an already-imported NPC and
   confirm it writes to that same copied location; run a real (non-dry-run)
   Create NPC generation; import a real trait candidate from the actual
   `staged-imports/` directory and check the resulting diff to
   `npc-generator-tables.md` by hand before trusting it further.
2. **Update the README's Import GUI section** for the Create NPC and Trait
   Imports tabs and the new config.json keys, and reconsider whether the
   "images are never uploaded" line still belongs.
3. **Write the CHANGELOG.md section** for this feature once it's verified,
   following the existing format (see `## 0.1.8` for the template).
4. **Decide the next version number** (likely `0.1.9`) and cut a release per
   the "Releasing" section in README.md.
5. **Commit the working tree** once verified — nothing here has been staged
   or committed yet.
