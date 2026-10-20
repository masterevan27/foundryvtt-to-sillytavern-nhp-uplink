---
type: Runbook
title: Maintain the documentation bundle
description: Install the pinned OKF tools, validate the bundle and understand documentation coverage.
status: stable
tags:
  - documentation
sources:
  - id: okf-profile
    resource: ../.okf/tools/profile.md
    title: House documentation profile
  - id: okf-lock
    resource: ../.okf/tools/profile.json
    title: Pinned profile and specification revision
  - id: okf-config
    resource: ../.okf.json
    title: Bundle configuration
  - id: okf-external-check
    resource: ../.okf/check-external.mjs
    title: Checker for maintained concepts outside docs/
  - id: okf-external-catalog
    resource: ../.okf/external-docs.json
    title: Catalog of maintained concepts outside docs/
  - id: okf-workflow
    resource: ../.github/workflows/okf.yml
    title: Documentation CI workflow
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/0b87c52c6ef999286c745e19998fdfcd03d5dbee/SPEC.md
    title: Open Knowledge Format v0.2 specification
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-10-20T05:04:11Z
stale_after: 2027-01-18T00:00:00Z
---
# Maintain the documentation bundle

Start at [the bundle index](index.md). This repository pins house profile 1.1.0
and OKF 0.2 in [.okf/tools/profile.json](../.okf/tools/profile.json);
[the profile](../.okf/tools/profile.md) describes metadata and evidence rules.
The project release version remains governed by [VERSIONING.md](VERSIONING.md).
Profile 1.1.0 warns when a concept lacks `generated` or a runbook lacks
`sources` or `stale_after`; warnings keep the check passing, but treat them as
review work.

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

CI uses `actions/checkout@v7`, `actions/setup-node@v7` and Node 24.

## Metadata conventions

Every concept carries `status`, `tags` and `generated`, in addition to the
required keys. Only record what evidence supports.

- `status`: `draft` while a design or plan is still under review, `stable`
  otherwise, `deprecated` once replaced (link the replacement). It never records
  whether the described work shipped; prose `Status:` lines in the body and the
  dashboard carry implementation state.
- `tags`: choose from `api`, `architecture`, `ci`, `documentation`,
  `foundry-module`, `importer`, `repository` and `versioning`. Extend this list
  here before using a new tag.
- `generated`: `by` names the agent that wrote the current content, using
  `codex/unrecorded` or `claude-code/unrecorded` when the producer version was
  not recorded, or `human:masterevan27` for hand-written content. `at` is the
  last meaningful content change; metadata-only edits do not move it.
- `sources`: runbooks and references cite the code, scripts and schemas they
  describe as GitHub URLs pinned to the commit the content was written against.
  When the cited file changes in the same commit as the document, use a relative
  path instead, because that commit does not exist yet. Refresh pins when the
  content is next revised. Historical plans and designs rely on their links
  instead.
- `stale_after`: runbooks, operational references such as the importer contract,
  this guide and VERSIONING use 90 days after `generated.at`. Historical plans
  and designs have none. When the deadline passes, check the content against its
  sources, then revise or verify it before moving the date.
- `verified`: add `{ by: human:masterevan27, at: ... }` only after the owner
  actually reviewed the content, or an agent entry only after an agent checked
  it against its sources. The 2026-10-20 metadata backfill recorded no
  verification.

## Documents retained outside the bundle

- [CHANGELOG.md](../CHANGELOG.md) — Metadata added; retained at its established path.
- [README.md](../README.md) — Repository or component entry point retains its README format.

## Preserved input and instruction formats

- [AGENTS.md](../AGENTS.md) — Agent or skill instructions retain their own format.
