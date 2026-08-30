#!/usr/bin/env node
/*
 * FoundryVTT to SillyTavern NHP Uplink
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Compiles CHANGELOG.md into the changelog.json that ships inside module.zip
 * and feeds the in-world "what's new" dialog.
 *
 * CHANGELOG.md is the source of truth because release notes are prose for
 * players, and no generator writes that. What is automated is everything
 * around it: which version is current, what date it shipped, and getting the
 * notes into the package. When a release has no section written for it, the
 * commit subjects since the previous tag are used instead -- a thin changelog
 * beats a dialog that silently shows nothing, which is exactly how this failed
 * before.
 *
 * Usage:
 *   node tools/build-changelog.mjs --out <path> [--version X.Y.Z] [--from-git]
 *
 *   --out        Where to write changelog.json.
 *   --version    The version being released. If CHANGELOG.md has no section
 *                for it, --from-git synthesises one.
 *   --from-git   Enable the commit-subject fallback described above.
 *   --changelog  Source markdown (default: CHANGELOG.md next to this repo root).
 *   --repo-url   Used to build the "full release notes" link.
 *   --quiet      Suppress the summary printed to stderr.
 *
 * Run it by hand to preview what a release would show:
 *   node tools/build-changelog.mjs --out /tmp/changelog.json --version 0.1.9 --from-git
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { fromGit: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--out") args.out = next();
    else if (arg === "--version") args.version = next();
    else if (arg === "--changelog") args.changelog = next();
    else if (arg === "--repo-url") args.repoUrl = next();
    else if (arg === "--from-git") args.fromGit = true;
    else if (arg === "--quiet") args.quiet = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.out) throw new Error("--out is required");
  args.changelog ??= resolve(REPO_ROOT, "CHANGELOG.md");
  args.repoUrl ??=
    "https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink";
  return args;
}

/* ------------------------------------------------------------------ */
/* CHANGELOG.md parsing                                                */
/* ------------------------------------------------------------------ */

/**
 * Sections look like:
 *
 *   ## 0.1.8 - Mission briefings
 *   _2026-08-30_
 *
 *   An optional summary paragraph.
 *
 *   - A bullet.
 *   - Another bullet.
 *
 *   Link: [Label](https://example.com) - optional hint
 *
 * Everything after the version is optional, so a section can be one heading
 * and one bullet and still render.
 */
function parseChangelog(markdown) {
  const entries = [];
  // Drop fenced blocks first: the file documents its own format with an
  // example section, and that example must not parse as a real release.
  const body = markdown.replace(/^```[\s\S]*?^```/gm, "");
  const sections = body.split(/^## +/m).slice(1);

  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const heading = lines.shift() ?? "";

    const match = heading.match(/^v?(\d+\.\d+\.\d+[^\s]*)\s*(?:[-–—]\s*(.*))?$/);
    if (!match) continue; // Not a version section (e.g. "Unreleased" notes).

    const [, version, title] = match;
    const entry = {
      version,
      date: null,
      title: (title ?? "").trim(),
      summary: "",
      notes: [],
      link: null,
    };

    // Markdown wraps prose across lines, so a bullet or paragraph continues
    // until a blank line. Without tracking which block is open, the second
    // line of every wrapped bullet lands somewhere it does not belong.
    const summaryLines = [];
    let open = null; // "bullet" | "summary" | null

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        open = null;
        continue;
      }

      const date = line.match(/^_?(\d{4}-\d{2}-\d{2})_?$/);
      if (date) {
        entry.date = date[1];
        open = null;
        continue;
      }

      const link = line.match(
        /^Link:\s*\[([^\]]+)\]\(([^)]+)\)\s*(?:[-–—]\s*(.*))?$/i,
      );
      if (link) {
        entry.link = {
          label: link[1].trim(),
          url: link[2].trim(),
          hint: (link[3] ?? "").trim(),
        };
        open = null;
        continue;
      }

      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        entry.notes.push(bullet[1].trim());
        open = "bullet";
        continue;
      }

      if (open === "bullet") {
        entry.notes[entry.notes.length - 1] += ` ${line}`;
        continue;
      }

      summaryLines.push(line);
      open = "summary";
    }

    entry.summary = summaryLines.join(" ");
    entries.push(entry);
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/* Git fallback                                                        */
/* ------------------------------------------------------------------ */

function git(...args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** The most recent tag that is not the release being cut. */
function previousTag(version) {
  let tags = [];
  try {
    tags = git("tag", "--list", "v*", "--sort=-v:refname").split(/\r?\n/);
  } catch {
    return null;
  }
  return tags.filter(Boolean).find((t) => t !== `v${version}`) ?? null;
}

/**
 * Commit subjects since the previous tag, minus the noise nobody wants in
 * release notes: merges, and the release commit this workflow makes itself.
 */
function notesFromGit(version) {
  const since = previousTag(version);
  const range = since ? `${since}..HEAD` : "HEAD";

  let subjects = [];
  try {
    subjects = git("log", range, "--no-merges", "--pretty=format:%s").split(
      /\r?\n/,
    );
  } catch {
    return [];
  }

  return subjects
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^release:/i.test(s))
    .filter((s) => !/^Merge (branch|pull request|remote)/i.test(s))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

function compareVersions(a, b) {
  const parse = (v) => v.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? +p : p));
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    return typeof x === typeof y ? (x > y ? -1 : 1) : typeof x === "number" ? -1 : 1;
  }
  return 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let markdown = "";
  try {
    markdown = readFileSync(args.changelog, "utf8");
  } catch {
    if (!args.quiet) {
      console.error(`build-changelog: no ${args.changelog}; relying on git`);
    }
  }

  const entries = parseChangelog(markdown);
  let source = "CHANGELOG.md";

  if (args.version) {
    const existing = entries.find((e) => e.version === args.version);

    if (existing) {
      // A section can be written before its ship date is known.
      existing.date ??= today();
    } else if (args.fromGit) {
      const notes = notesFromGit(args.version);
      entries.push({
        version: args.version,
        date: today(),
        title: "",
        summary: notes.length
          ? "Changes in this release:"
          : "See the full release notes on GitHub.",
        notes,
        link: {
          label: "Release notes",
          url: `${args.repoUrl}/releases/tag/v${args.version}`,
          hint: "The complete history on GitHub",
        },
      });
      source = "git log";
      console.error(
        `::warning::CHANGELOG.md has no section for ${args.version}; ` +
          `generated ${notes.length} note(s) from commit subjects instead.`,
      );
    } else {
      throw new Error(
        `CHANGELOG.md has no section for ${args.version} and --from-git was not passed`,
      );
    }
  }

  entries.sort((a, b) => compareVersions(a.version, b.version));

  const payload = {
    generated: new Date().toISOString(),
    source,
    entries,
  };

  writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`);

  if (!args.quiet) {
    const newest = entries[0];
    console.error(
      `build-changelog: wrote ${entries.length} entries to ${args.out}` +
        (newest ? ` (newest ${newest.version}, from ${source})` : ""),
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`::error::build-changelog: ${err.message}`);
  process.exit(1);
}
