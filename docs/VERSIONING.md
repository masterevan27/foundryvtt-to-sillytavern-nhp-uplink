---
type: "Reference"
title: "Versioning"
description: "Release version source, increment rules and automation for this repository."
status: stable
tags:
  - documentation
  - versioning
sources:
  - id: release-workflow
    resource: ../.github/workflows/release.yml
    title: Release workflow that stamps and validates versions
  - id: module-manifest
    resource: ../foundry-module/foundryvtt-to-sillytavern-nhp-uplink/module.json
    title: Foundry module manifest version
  - id: extension-manifest
    resource: ../st-ui-extension/sillytavern-foundryvtt-input/manifest.json
    title: SillyTavern UI extension manifest version
  - id: server-plugin-version
    resource: ../st-server-plugin/sillytavern-foundryvtt-input-server-plugin/index.js
    title: Server plugin PLUGIN_VERSION exception
  - id: changelog
    resource: ../CHANGELOG.md
    title: Player-facing changelog
generated:
  by: codex/unrecorded
  at: 2026-10-09T15:59:41-04:00
stale_after: 2027-01-07T00:00:00Z
---
# Versioning

Release versions remain governed by `.github/workflows/release.yml`; `PLUGIN_VERSION` remains the server-plugin exception.

Every completed change should update the project version once, including changes made directly on the default branch. Use patch/subversion increases for ordinary changes, minor increases for larger compatible changes, and reserve major increases for intentional breaking or owner-approved releases. Use conventional unpadded numeric versions where the existing project format permits it.

Canonical version source: [`release.yml`](../.github/workflows/release.yml). Keep this file as the agent-facing explanation of that source; do not create a competing version field when release automation already owns the version.

The existing source is authoritative for this project. Update it according to the project workflow before reporting a completed change.

