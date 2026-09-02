# Known Issues

Parked technical debt in `import-gui-server/`. None of these block anything
today; they are recorded because this repo has no ticket system and they would
otherwise only exist in the head of whoever last touched the code.

These were carried over from
`docs/superpowers/plans/2026-09-01-tables-and-presets-refinements.md`, which was
deleted once its work shipped (branch `tables-presets-refinements`, merged to
`main` at `eb06a0a`). Read that commit and its parents for the surrounding
context if any of these become worth fixing.

## Tables & Presets (Import GUI)

1. **`/api/presets/apply` swallows failed writes.** The route's write loops
   discard the `{ok:false}` returned by `toggleBulletOnDisk` /
   `setBulletWeightOnDisk`, so a rejected write — the
   `Number.isInteger(weight) && weight >= 1` guard in `lib/tableBullets.js`
   tripping, say — never reaches the response. The caller is told the apply
   succeeded.

2. **Duplicate bullet text within one table makes the diff lie.**
   `toggleBulletInText` has always operated on the *first* matching line under a
   heading, while `diffPresetAgainstTables` counts every match. Pre-existing
   behavior, but the preset whitelist semantics newly surface it: the preview
   can promise more changes than the apply performs.

3. **Apply is O(n) full-file rewrites.** Every changed bullet triggers its own
   read + parse + write of `npc-generator-tables.md`, so an apply is neither
   atomic nor cheap. Fine for a local single-user tool; it would not survive
   concurrent use.

4. **No test covers the preset format break.** The refinements plan promised
   that an old `{ disabled: {...} }` preset would get a `400` ("missing
   \"selected\"") from `/api/presets/import` and `/api/presets/apply`, and that
   `listPresets` would report `count: 0` for one rather than erroring. That
   behavior is implemented but unverified by the suite.

5. **The preset row's `(N)` count changed meaning without changing its label.**
   It used to be the number of *disabled* bullets and is now the number of
   *selected* ones. Nothing in the UI says which.

6. **The weight input fires a `POST` per spinner click.** The Tables tab sends
   one `/api/table-bullets/set-weight` request per arrow press rather than
   debouncing or committing on blur, so holding an arrow key floods the server.

## Resolved

- ~~The design spec documented the superseded `disabled`-only preset format with
  nothing marking it superseded.~~ Fixed: the spec now carries a "Superseded in
  part" banner describing the full selected-set format that replaced it.
