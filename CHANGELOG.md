# Changelog

Notes here are written for the people playing, not for contributors — the
section for a release is what pops up in Foundry the first time someone loads
it. `tools/build-changelog.mjs` compiles this file into the `changelog.json`
that ships inside `module.zip`, so adding a section is the only step needed to
give a release its in-world notes.

Format for a section:

```markdown
## 0.1.9 - Short title
_2026-09-14_

An optional summary sentence or two.

- A bullet.
- Another bullet.

Link: [Label](https://example.com) - optional hint text
```

Everything after the version number is optional. The date may be left out and
the release workflow will stamp the day it shipped. If a released version has
no section at all, the workflow falls back to the commit subjects since the
previous tag, so the dialog always has something to say.

---

## 0.2.0 - Import GUI
_2026-09-01_

A fourth standalone tool joins the project: a local web GUI for turning
NPCs rolled by the companion generator script into Foundry Actors, without
hand-copying files through the file picker.

- Browse rolled NPCs, preview portrait/token art, and import selected ones
  as Actors — importing now copies the art into your Foundry Data folder
  for you instead of requiring it to already live there.
- Roll brand-new NPCs from a form over the generator's own options, and
  regenerate art on an existing one, right from the browser.
- Delete an NPC's generated files, sort and filter the grid, and see the
  generation date and prompt behind each one.
- Import reference-image trait candidates staged by the companion
  `npc-trait-import` skill straight into the generator's tables.

## 0.1.9 - Example screenshots and release notes tooling
_2026-08-30_

- New example screenshots and a tidied-up examples section in the README.
- The release notes you're reading now are generated straight from this
  changelog file instead of being written by hand at release time.

## 0.1.8 - Mission briefings
_2026-08-30_

The AI GM can now be told what the mission is before the shooting starts, and
the module tells you what changed when it updates.

- Write a mission as a Foundry journal entry, link it to the scene, and
  `/brief` sends it to SillyTavern under its own banner ahead of the table
  feed. `/brief <text>` sends an ad-hoc briefing instead.
- Briefings are hoisted above the table feed in SillyTavern rather than being
  buried between damage rolls.
- Fixed: "only relay during combat" silently swallowed briefings, which are
  sent before a fight starts — exactly when that filter is closed.
- New: this release-notes popup, shown once per person after an update.

Link: [Uplink on GitHub](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink) - Setup notes and the full release history

## 0.1.7 - Lancer system requirement
_2026-08-29_

- The module now declares Lancer 2.0.0 as a system requirement, so Foundry
  warns before installing it into a world it cannot work in.
