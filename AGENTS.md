# AGENTS.md

## Dashboard

Dashboard project ID: foundryvtt-to-sillytavern-nhp-uplink

Use the scoped dashboard check-in endpoint GET http://127.0.0.1:5080/api/checkin?project=foundryvtt-to-sillytavern-nhp-uplink for project context and POST http://127.0.0.1:5080/api/checkin/foundryvtt-to-sillytavern-nhp-uplink/events for project-scoped updates.

## Before starting project work

Before starting work in this project, check the dashboard for project-scoped human notes, active work, blockers, and additional instructions. After work, record completed, blocked, planned, test, and documentation findings through the dashboard API or CLI. Never edit materialized state files directly.

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

## Do not hand-edit the manifest versions

`module.json` and `manifest.json` declare the **last released** version, and
`release.yml` is what changes them: it stamps the version typed into **Run
workflow** into both, commits them as `release: vX.Y.Z`, and tags that commit.
A number edited by hand is overwritten on that path. On a hand-pushed tag CI
can only verify, and only `manifest.json` is verified: a mismatch there fails
the build, while `module.json` is silently re-stamped on the runner and never
compared against the tag. Write the notes for unreleased work
in `CHANGELOG.md` instead — a section above the newest one, below the
`---` rule, never inside the fenced `Format for a section` example, which
`tools/build-changelog.mjs` strips before parsing.

`PLUGIN_VERSION` in the server plugin's `index.js` is the exception. Nothing
in CI touches it, so bump it by hand alongside the work it describes.

## Running the tests

The transport suite runs with `node --test tests/*.test.mjs tests/*.test.cjs`
and uses isolated ephemeral listeners, never production port 5088. Its provenance,
state-view, event-format and real HTTP/SSE route checks do not require Foundry or
SillyTavern. The Import GUI suite remains in its separate repository at
<https://github.com/masterevan27/lancer-npc-import-gui>.

What CI does check here, in `.github/workflows/release.yml` at release time:
both manifests parse, the extension's `manifest.json` declares the version
being cut (`module.json` is stamped with it rather than checked), every file
they reference exists, `changelog.json` has an entry for the version, and every
`esmodule` passes `node --check`. No tests run in CI. You can run
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
| `README.md` | ~910 lines |

Read the section, route or function you need. `README.md` has a heading every
30-60 lines, so it scopes cleanly.

## AI agent dashboard updates

When work in this repository is completed, blocked, planned, tested, or found to have stale documentation, update the local AI agent dashboard at `G:\GIT-REPOS\ai-agent-dashboard`. Start it with `node G:\GIT-REPOS\ai-agent-dashboard\server.js` if needed, then use the dashboard API or CLI, for example:

```powershell
node G:\GIT-REPOS\ai-agent-dashboard\dashboard-cli.js add-note --project PROJECT_ID --note "Describe the change and remaining work"
```

Use a unique event id for retries. Never edit `ai-agent-dashboard\data\state.json` or `events.jsonl` directly. Record completed, blocked, planned, and documentation work, along with test evidence and source paths. The canonical protocol is in `G:\GIT-REPOS\ai-agent-dashboard\data\README.md`.
