# NPC Tables Editor & Trait Import Presets — Design

**Status:** Shipped — but the preset format below is **superseded**. See the banner.
**Repo:** `import-gui-server/` (Import GUI), reading/writing `npc-generator-tables.md` in the separate `Lancer-TTRPG-GM-Hub` repo
**Covers:** items 13, 14, 15 from `.claude_to_do_list.md`

> ## ⚠️ Superseded in part
>
> Everything here shipped, but the **preset file format and apply semantics
> described below are no longer what the code does.** A follow-up round of
> refinements (merged to `main` at `eb06a0a`) replaced them:
>
> - A preset no longer stores a `disabled` delta. It stores `selected` — one key
>   for **every table** that existed in `npc-generator-tables.md` when the preset
>   was saved, mapping to that table's full enabled set (with per-bullet roll
>   weights). A table that had zero enabled bullets still gets an empty-array key.
> - Applying a preset is a **whitelist**, not a one-way disable. Every table the
>   preset *covers* is made to match it exactly — bullets it lists are enabled and
>   re-weighted, and anything else currently enabled in that same table is
>   disabled. A table with no key at all (it didn't exist when the preset was
>   saved) is left completely untouched, which is what keeps an old preset safe
>   to apply after new tables get added.
> - This means the spec's rule that "a preset only ever *disables* bullets it
>   names; applying one never re-enables anything it doesn't mention" is **no
>   longer true**, and neither is the `{ "disabled": {...} }` JSON shape shown in
>   the preset-file and `/api/presets/import` sections.
> - There is no migration. An old-format file is rejected with `400` ("missing
>   `selected`") by import and apply, and reported as `count: 0` by `listPresets`.
> - Bullet **roll weights** (`- xN text`) are editable from the Tables tab, which
>   this spec does not describe at all.
>
> Read `import-gui-server/lib/presets.js` and its tests for the format that is
> actually implemented. Remaining parked issues live in
> [`docs/known-issues.md`](../../known-issues.md).

## Summary

The Import GUI's existing "Trait Imports" tab reviews AI-suggested trait
*candidates* staged by the `npc-trait-import` skill — it has nothing to do
with the NPC generator's actual tables file. This work adds three things:

1. A sort control and a date column on the existing Trait Imports tab
   (items 13, 14).
2. A new **Tables** tab that shows every bullet in every table of
   `npc-generator-tables.md` and lets the user enable/disable individual
   bullets without deleting them (item 15, part one).
3. A **presets** system: save the current set of disabled bullets as a
   named, downloadable file; import someone else's preset file, preview
   what it would change, and apply it (item 15, part two).

## Non-goals

- Editing bullet *text*, adding new bullets, or adding new table headings.
  This is purely an enable/disable toggle over what already exists.
- Any network-hosted preset sharing (a preset registry, a paste service).
  "Share" means: download a `.json` file and hand it to someone however you
  already would (chat, email, a USB stick); they upload it back into their
  own Import GUI.
- Changes to `generate-npc.py`'s parser. Disabled bullets are represented as
  HTML comments, which the parser already ignores (see
  `npc-generator-tables.md`'s own docs: "HTML comments, blank lines, and any
  prose paragraph that isn't a bullet are ignored").

## Disabled-bullet format

An enabled bullet:

```
- a graffiti-tagged cropped t-shirt and cut-off shorts, midriff and legs bare || civ
```

A disabled one — the exact same line, wrapped:

```
<!-- - a graffiti-tagged cropped t-shirt and cut-off shorts, midriff and legs bare || civ -->
```

`generate-npc.py`'s `parse_tables()` matches bullets with
`^-\s+(.*?)\s*$` against each raw line; a line starting `<!--` never
matches, so a disabled bullet is silently skipped with **no change to that
script**. Toggling re-enables by stripping the `<!-- ` prefix and ` -->`
suffix, recovering the original line byte-for-byte (including its `xN`
weight prefix and any `||` flags).

Matching a bullet from the API (table + text) against a line in the file is
done the same way the file is already parsed: strip an optional `xN `
weight prefix and an optional `<!-- -->` wrapper, then compare the
remaining text verbatim. Weight and flags are part of "the text" for
matching purposes — toggling never changes them.

## Server (`import-gui-server/server.js`)

### Table listing

`GET /api/tables` — re-reads `npc-generator-tables.md` fresh (same
no-cache convention as the rest of this server) and returns:

```json
{
  "tables": [
    {
      "name": "Outfit",
      "bullets": [
        { "text": "a heavy work jacket over a stained undersuit, sleeves shoved to the elbow || civ", "weight": 1, "enabled": true },
        { "text": "nondescript grey work coveralls", "weight": 4, "enabled": true },
        { "text": "a graffiti-tagged cropped t-shirt and cut-off shorts, midriff and legs bare || civ", "weight": 1, "enabled": false }
      ]
    }
  ]
}
```

Every `## heading` in the file is included, not just the ones
`generate-npc.py`'s `REQUIRED_TABLES` names — `Given names`, `Callsigns`,
etc. are just as prunable. Headings are returned in file order, which
already groups a table with its `(she)`/`(he)`/`+` variants next to it.

### Toggling one bullet

`POST /api/tables/toggle` — body `{ "table": "Outfit", "text": "...", "enabled": false }`.

Finds the line under the exact `## <table>` heading whose weight-and-wrapper-stripped
text matches exactly, rewrites just that line (comment it out, or strip the
comment), and writes the file back. If no line matches — the file changed
underneath the GUI, by hand or via the existing trait-import-append endpoint
— responds `400` with an error naming the table and text, the same
"refuse rather than guess" convention `insertBulletIntoTables` already
uses for a missing heading. The client reloads `/api/tables` on a 400 so
its view can't silently drift from disk. If more than one line under that
heading has identical stripped text (a pre-existing content duplicate —
none exist in the file today), the first one in file order is toggled;
this is a deterministic tie-break, not a case worth rejecting outright.

### Presets

Config gains `presetsDir` (optional, default: `presets/` next to
`stagedImportsDir`, same derivation pattern every other path in this config
already follows).

A preset file (`presets/<slug>.json`) is a snapshot of every bullet that is
disabled *anywhere in the tables file* at the moment it's saved:

```json
{
  "name": "Grittier Frontier",
  "created": "2026-09-01T20:14:00Z",
  "disabled": {
    "Outfit": [
      "a graffiti-tagged cropped t-shirt and cut-off shorts, midriff and legs bare"
    ],
    "Gear": [
      "nothing at all, hands loose and empty"
    ]
  }
}
```

(Text stored without weight prefix or wrapper — matching is against the
same stripped form `/api/tables` already returns, so a preset saved today
still matches after an unrelated weight change to that bullet.)

- `POST /api/presets` — body `{ "name": "..." }`. Slugifies the name
  (lowercase, spaces to hyphens, strip anything not `[a-z0-9-]`) for the
  filename; 409s if that slug already exists (no silent overwrite — rename
  or delete the old one first, same "refuse rather than guess" pattern).
  Walks the current tables file and writes the snapshot above.
- `GET /api/presets` — lists `{ name, slug, created, count }` for every
  file in `presetsDir`, sorted newest first.
- `GET /api/presets/:slug/export` — serves the raw JSON with
  `Content-Disposition: attachment; filename="<slug>.json"` so the browser
  downloads it. This *is* the sharing mechanism — the user hands that file
  to someone else however they like, and that person uploads it into their
  own Import GUI.
- `POST /api/presets/import` — body is the uploaded preset JSON itself
  (parsed client-side from the file, sent as the request body — no file is
  written yet). Validates it has the `disabled` shape, then returns a
  preview against the *local* tables file:

  ```json
  {
    "willDisable": [{ "table": "Outfit", "text": "..." }],
    "alreadyDisabled": [{ "table": "Gear", "text": "..." }],
    "notFound": [{ "table": "Headgear", "text": "..." }]
  }
  ```

  Nothing is written by this endpoint — it's read-only, matching the
  preview-before-mutate pattern the rest of this design leans on.
- `POST /api/presets/apply` — body is the same preset JSON plus the
  confirmed preview. Disables every bullet in `willDisable` (re-checked
  against the file at apply time, not trusted from the earlier preview, in
  case something changed in between); never touches a bullet the preset
  doesn't mention. Returns the same three buckets so the client can show
  what actually happened.

## Client (`import-gui-server/public/`)

### Tables tab

New `data-tab="tables"` button and `tab-panel`, following the existing
three-tab pattern in `index.html`/`app.js`.

Two-pane layout:
- Left: every table heading with a count badge, e.g. `Outfit (42, 3
  disabled)`. Click selects it.
- Right: the selected table's bullets, one row each — a checkbox (checked =
  enabled), the weight as a small badge when `> 1`, the bullet text.
  Toggling a checkbox calls `/api/tables/toggle` immediately (optimistic:
  flip the checkbox now, revert it and show the error if the request
  fails) — no separate save step, matching how every other mutation in this
  GUI already behaves.

A Presets panel below the table list:
- Saved presets as rows: name, created date, bullet count, a **Download**
  link (`/api/presets/:slug/export`) and a **Delete** button.
- **Save current as preset…** — prompts for a name, `POST`s it, reloads the
  list.
- **Import preset…** — a file `<input type="file" accept=".json">`. On
  pick: read the file client-side, `POST /api/presets/import`, render the
  three-bucket preview (counts plus an expandable list per bucket), with an
  **Apply** button that only appears once a preview has been shown and
  calls `/api/presets/apply` with that same parsed preset.

### Trait Imports tab (items 13, 14)

- A `<select>` "Sort by" control next to the existing search/table filter:
  **Newest first** (default, by `generatedAt` descending), **Oldest
  first**, **Table** (alphabetical by `c.table`, then `generatedAt`
  descending within a table). Sorting happens on `traitState.visible` right
  before the render loop in `renderTraits()`.
- Each row gains a small date badge: `c.generatedAt` formatted as a plain
  date, always shown; `c.importedAt` shown as a second badge only when
  `c.imported` is true. Both fields already exist in the
  `/api/trait-candidates` response (`allTraitCandidates()` in server.js
  already computes them) — this is a render-only change, no server work.

## Error handling

- `/api/tables/toggle` 400s on a text mismatch (see above); the client
  surfaces the message and reloads the table.
- `/api/presets` 409s on a duplicate slug.
- `/api/presets/import` 400s on malformed JSON or a missing `disabled` key.
- `/api/presets/apply` re-validates against the live file rather than
  trusting the client-supplied preview, so a preset applied a while after
  its preview was shown (file edited in between) can't silently disable
  something the user never actually confirmed.
- The tables file is never cached in memory across requests — every
  endpoint re-reads it, consistent with how `server.js` already treats
  `npc-generator-tables.md` and `.generated-npcs.json` as the on-disk
  source of truth.

## Testing

Same approach the 2026-09-01 Import GUI session used (see
`claude_task_status.md`): synthetic fixtures (a small tables.md with a
couple of tables/bullets, a scratch `presetsDir`), exercised via `curl`
against a server instance pointed at the fixtures, covering:

- `/api/tables` returns disabled bullets correctly for a hand-written
  `<!-- - ... -->` line, including one with a weight prefix.
- Toggle disable then re-enable round-trips the file back to its original
  bytes.
- Toggle against a text that doesn't exist under that heading returns 400
  and writes nothing.
- Save preset, then hand-edit the fixture to remove one of the
  now-disabled bullets, then export and re-import that preset against the
  edited fixture — confirms the `notFound` bucket populates correctly
  rather than crashing.
- Apply only touches bullets in `willDisable`; a bullet the preset doesn't
  mention is untouched byte-for-byte.
- A duplicate preset name returns 409 and doesn't overwrite the existing
  file.

The real tables file and real `presetsDir` are never touched by anything
that writes during testing, following the same discipline documented in
`claude_task_status.md` for the rest of this server.
