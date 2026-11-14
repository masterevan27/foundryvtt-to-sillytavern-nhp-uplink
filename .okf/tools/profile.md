# Project documentation profile 1.2.0

This is the portable house policy carried by project-okf-tools 0.2.5. It targets
[OKF v0.2 at the pinned revision](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/0b87c52c6ef999286c745e19998fdfcd03d5dbee/SPEC.md).
The JSON lock is profile.json. Upstream conformance and house requirements are
distinct: the checker enforces structural rules; editorial requirements also
need review.

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

Profile 1.1.0 adds advisory warnings, never errors, for concepts that are not
deprecated: provenance when generated is absent, and for Runbooks evidence when
sources is absent and freshness when stale_after is absent. Resolve them with
real provenance, citations and deadlines; never satisfy them with invented
metadata. Backfill generated from commit history or the known author only.

## Documentation media

These are house editorial requirements, reviewed during docs-sweep. They add no
upstream OKF metadata or image-count heuristic. The structural checker cannot
establish whether media is representative, sanitized, legible or current; its
passing result does not establish media compliance.

Every maintained first-party project README must show its principal deliverable
near the introduction. For a UI application or game, use a representative real
screenshot. For a non-UI project, use a real output example or useful diagram
that shows the project's outcome; the owner accepts these alternatives. Logos,
badges and decorative imagery alone do not qualify. Exclude vendored,
automatically generated and archived documentation from this requirement.

Other maintained documentation uses the smallest useful set of media when it
helps explain a complex concept, procedure, state or result. Choose a diagram
for relationships, a screenshot for visible state, or a short capture for a
sequence whose motion matters. Simple instructions and facts need no decorative
media. Keep text explanations and executable instructions usable without images.

Use genuine captures for claims about actual behavior. Crop to the useful area,
keep important details legible, supply meaningful alt text and a caption saying
what the reader should notice. Use durable repository-relative asset links,
normally in docs/assets, rather than temporary URLs or machine paths. Keep file
sizes proportionate and use the project's normal renderer-supported formats.

Sanitize secrets, credentials, personal data and sensitive infrastructure details
before any asset is tracked; inspect the final rendered asset, including visible
terminal output and embedded metadata. Use safe sample data where appropriate
and disclose substitutions. Do not commit an unsafe original alongside a redacted
copy. Record source/provenance, capture date, project revision/version and capture
method in a caption, nearby text or linked evidence. Mark unknown details honestly;
a file timestamp or inferred model identity is not capture provenance. Label
mockups and illustrative diagrams clearly; they are not execution evidence.

When UI, workflows, output or behavior changes, review related media during
docs-sweep. Refresh or remove misleading assets, or explicitly mark outdated
material and record the limitation. Preserve historical evidence as history.
Do not infer freshness from unchanged filenames, a link check or old captures.

If a required capture is unavailable, record unfinished work with an HTML comment
beginning `doc-media TODO` at its intended location. Include purpose, the capture
acceptance criteria and the concrete blocker. The comment is not a substitute
for the required media. For example:

```html
<!-- doc-media TODO
Purpose: Show the application's completed import result near the README intro.
Capture acceptance: Real running UI with a completed sample import, legible counts,
safe sample data, alt text, caption, capture date, revision and method.
Blocker: The required local service cannot start on this device.
-->
```

Do not create a broken image link as a placeholder or add a missingLinks
exception for absent media. Record the blocker in the handoff and resolve the
comment when a suitable asset is available. Review visual suitability and the
recorded evidence separately from the structural checker result.

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

Ignored node_modules directories do not travel to fresh clones or worktrees.
Install the locked dependencies in that checkout before running its checker:
use the command above for a project snapshot, or substitute `tools/okf` for
the canonical source package. Version 0.2.3 reports a missing direct parser
dependency with one install command pointing at the running tool directory,
even when the current directory is elsewhere. Prefer this local installation.
Borrow another checkout's tools only after confirming all runtime sources,
package files and profile files match the project's pinned snapshot exactly;
a matching profile version alone is insufficient.

To update a project's tools, run the upgrade command described in the adoption guide;
it copies the runtime files and lockfile, reinstalls dependencies and reruns checks,
and preserves project config and handwritten indexes. Review upstream specification changes
before changing the pinned revision, profile version, examples and tests. Keep
the previous snapshot available through Git. No automatic network upgrades occur;
a project takes a new snapshot with `node tools/okf/cli.mjs upgrade PROJECT` when
it is next touched (see the adoption guide).
