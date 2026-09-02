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
| `README.md` | ~960 lines |
| `import-gui-server/public/app.js` | ~49KB |
| `import-gui-server/server.js` | ~46KB |

Read the section, route or function you need. `README.md` has a heading every
30-60 lines and `server.js` groups its routes under banner comments, so both
scope cleanly.
