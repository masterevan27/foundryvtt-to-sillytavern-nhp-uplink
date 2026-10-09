# Project documentation profile 1.0.0

This is the portable house policy carried by project-okf-tools 0.1.0. It targets
[OKF v0.2 at the pinned revision](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/0b87c52c6ef999286c745e19998fdfcd03d5dbee/SPEC.md).
The JSON lock is profile.json. Upstream conformance and house requirements are
distinct: this checker enforces the house requirements as well as basic OKF.

## Bundle and documents

Use docs/ as the bundle by default; .okf.json may select another contained
directory. Preserve existing filenames, including VERSIONING.md. Keep README,
AGENTS, SKILL files, dependencies, vendored docs and generated schemas outside
the bundle. Every non-reserved Markdown file in it is a concept. Binary assets
and code samples may be linked without adding frontmatter.

Require nonempty string type, title and description. Prefer Architecture,
Runbook, Reference, Decision, Design, Plan and Roadmap; other types are valid.
Unknown metadata keys are preserved. Use x- prefixed extensions when needed.
Use real YAML; quote strings containing a colon followed by a space.

```yaml
---
type: Runbook
title: Deploy the service
description: Build, deploy and verify the service on its supported host.
status: draft
tags: [operations]
---
```

Supply status (draft, stable, deprecated) when useful. It describes the document
lifecycle, not completion of the work it describes. Link superseded documents
to their replacements; retain paths while callers still use them.

## Evidence and freshness

Use sources for authoritative code, schemas or external references. Each entry
requires resource; give cited sources a stable id. Prefer commit-pinned repository
URLs for code evidence that must survive export. When citing an individual
claim, use a Markdown footnote whose label matches sources[].id.

generated.by identifies the writer; generated.at records a meaningful content
change. verified records an actual content check, with by and at. Actors use
producer/version, human:id, or process:id. A parser or link checker does not
verify that instructions work. Never invent a human review. After changing
content, reassess earlier verification instead of copying it forward as current.

Use stale_after for time-sensitive facts: an absolute ISO datetime with timezone.
A review deadline is a prompt to inspect the facts, not permission to auto-renew
the date. Suggested review intervals: operations 90 days, architecture 180 days;
historical decisions do not expire just because they are old. Update affected
docs alongside behavior changes rather than waiting for the deadline.

## Navigation and links

Require index.md in each directory containing documentation or child indexes.
Root index frontmatter contains only okf_version: "0.2"; nested indexes have no
frontmatter. Keep headings and list entries with document titles/descriptions.
The index command owns only indexes bearing its generated marker. Maintain
handwritten indexes manually. Do not add type metadata to reserved filenames.

log.md is optional, has no frontmatter and uses real YYYY-MM-DD date headings,
newest first, with list entries. Git already records edit history; avoid a
duplicate log unless it helps readers.

Prefer relative Markdown links for normal repository renderers. A leading /
means the bundle root to OKF, which is different from some GitHub/site renderers.
The checker validates local files and GitHub-style Markdown heading anchors,
including reference links and images, and ignores code fences. It does not
fetch remote links or parse raw HTML navigation. Repository source links may
leave docs/ but must stay within the project. Bundle symlinks are disallowed.

## Migration exceptions

.okf.json uses profile, bundle, legacy and missingLinks. Unknown configuration
keys fail to catch typos. legacy maps exact bundle-relative filenames to reasons;
only absent frontmatter is downgraded to a warning. Malformed existing metadata
still fails. Remove each exception when the document is migrated. A bundle with
legacy exceptions is migrating, not fully OKF-conformant.

missingLinks maps an exact `source.md -> target.md` string to an explanation.
Use it only for intentional future concepts. Broken local links are errors under
this house policy even though OKF consumers must tolerate them. Remove exceptions
when targets exist. Neither exception suppresses unsafe paths.

## Ongoing workflow

At kickoff, read the bundle index and relevant documents. During the docs sweep,
check changed behavior against prose and update metadata only when supported by
evidence. Refresh generated indexes, run the repository's pinned checker and
record document reviews in the dashboard. Treat stale warnings as review work.
Before landing, report errors, remaining legacy documents and unresolved reviews.

Keep one authoritative source for each fact. Dashboard records remain the source
for task state, handoffs, tests and roadmap progress. Send document-review
freshness separately from implementation status. Do not map OKF stable to a
completed task or automatically parse roadmap prose into completed work.

## Tool installation and updates

The documentation tools require Node 20.19 or later. New projects receive
.okf/tools with this profile, parser/CLI sources and an npm
lockfile. Install with `npm ci --prefix .okf/tools --ignore-scripts --no-audit
--no-fund`, then use `node .okf/tools/cli.mjs check .` and `index .`.
CI uses the same committed snapshot; no sibling checkout or Google credentials
are needed. Check returns 1 for validation errors, 0 for warnings-only results,
and 2 for usage/I/O failures. `check` and `inventory` never write project files.

To update tools, review the source release and copy its runtime files and lockfile
as a single reviewed change; reinstall dependencies and rerun checks. Preserve
project config and handwritten indexes. Review upstream specification changes
before changing the pinned revision, profile version, examples and tests. Keep
the previous snapshot available through Git. No automatic network upgrades occur.
