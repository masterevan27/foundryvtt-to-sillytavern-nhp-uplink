# CLAUDE.md

Orientation for a coding session in this repo. Architecture and install steps
live in [README.md](README.md) — this file is only what a session needs *before*
it touches anything.

## The components

Three of them, forming the narration relay.

| Path | What it is | How it ships |
|---|---|---|
| `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/` | Foundry VTT module | `module.zip`, built by `.github/workflows/release.yml` |
| `st-server-plugin/sillytavern-foundryvtt-input-server-plugin/` | SillyTavern server plugin, own HTTP listener on port 5088 | copied in by hand |
| `st-ui-extension/sillytavern-foundryvtt-input/` | SillyTavern UI extension | mirrored to its own repo by the `mirror` job in `release.yml` |

The Foundry half of the **Lancer NPC Import GUI** also ships in this module
(`scripts/importer.js`). The server half lives at
<https://github.com/masterevan27/lancer-npc-import-gui>; the contract between
them is in [docs/foundry-importer-contract.md](docs/foundry-importer-contract.md)
and cannot change unilaterally.

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

## Reading files

Several files here are large enough that reading them whole is wasteful:

| File | Size |
|---|---|
| `README.md` | ~890 lines |

Read the section, route or function you need. `README.md` has a heading every
30-60 lines, so it scopes cleanly.
