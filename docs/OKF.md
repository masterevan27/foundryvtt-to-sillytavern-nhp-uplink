---
type: Runbook
title: Maintain the documentation bundle
description: Install the pinned OKF tools, validate the bundle and understand documentation coverage.
---
# Maintain the documentation bundle

Start at [the bundle index](index.md). This repository pins house profile 1.0.0
and OKF 0.2 in [.okf/tools/profile.json](../.okf/tools/profile.json);
[the profile](../.okf/tools/profile.md) describes metadata and evidence rules.
The project release version remains governed by [VERSIONING.md](VERSIONING.md).

From the repository root, with Node 20.19 or newer:

```sh
npm ci --prefix .okf/tools --ignore-scripts --no-audit --no-fund
node .okf/tools/cli.mjs index .
node .okf/tools/cli.mjs check .
node .okf/check-external.mjs
```

The dedicated documentation workflow installs the locked dependencies and runs
the same checker. Refresh generated indexes after changing metadata; preserve
handwritten navigation. Tool upgrades are deliberate reviewed snapshots.

The checker covers Markdown inside docs/, its required indexes and local links.
The catalog below retains first-party documents at their existing paths; added
metadata and links outside docs/ are checked by the supplemental command and
CI, using the explicit .okf/external-docs.json catalog. README and AGENTS entry
points retain their own format. Skill files,
generated content, third-party material and application input formats are outside
this bundle. No legacy-document or missing-link exceptions are configured.

Metadata and link validation do not constitute factual or human review. Existing
status prose, dates, acceptance gaps and historical plans are preserved. Dashboard
task state and roadmap progress remain authoritative; no roadmap delivery is
claimed by this conversion.

## Documents retained outside the bundle

- [CHANGELOG.md](../CHANGELOG.md) — Metadata added; retained at its established path.
- [README.md](../README.md) — Repository or component entry point retains its README format.

## Preserved input and instruction formats

- [AGENTS.md](../AGENTS.md) — Agent or skill instructions retain their own format.
