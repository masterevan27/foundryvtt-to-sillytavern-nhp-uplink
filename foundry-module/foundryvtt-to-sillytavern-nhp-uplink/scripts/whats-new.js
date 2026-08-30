/*
 * FoundryVTT to SillyTavern NHP Uplink
 * Copyright (C) 2026 masterevan27
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * "What's new" dialog.
 *
 * Shows the release notes once per client after the module version changes, and
 * a short welcome the first time the module is ever loaded. The last version a
 * user acknowledged lives in a hidden client-scoped setting, so everyone at the
 * table sees it once on their own machine.
 *
 * The notes are NOT maintained here. They are compiled from the repository's
 * CHANGELOG.md into changelog.json at release time and shipped inside
 * module.zip, so cutting a release is the only thing that has to happen for the
 * right notes to appear. Nothing in this file needs editing per version -- the
 * version itself comes from the manifest, which CI stamps.
 *
 * See tools/build-changelog.mjs, and CHANGELOG.md for the section format.
 */

const MOD = "foundryvtt-to-sillytavern-nhp-uplink";

/** Where the compiled notes live inside the installed module. */
const CHANGELOG_PATH = `modules/${MOD}/changelog.json`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function log(...args) {
  console.log(`${MOD} |`, ...args);
}

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * The notes are authored as markdown, but only two inline forms are worth
 * supporting: `code` for commands like /brief, and **bold**. Everything is
 * escaped first, so nothing in the changelog can inject markup.
 */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function currentVersion() {
  return game.modules.get(MOD)?.version ?? "0.0.0";
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Loading the compiled notes                                          */
/* ------------------------------------------------------------------ */

let cached = null;

/**
 * Read changelog.json out of the installed module. A world served under a route
 * prefix needs getRoute() to resolve the path, so use it when the core provides
 * it.
 */
async function loadChangelog() {
  if (cached) return cached;

  const path = foundry.utils.getRoute?.(CHANGELOG_PATH) ?? `/${CHANGELOG_PATH}`;
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    cached = Array.isArray(data?.entries) ? data.entries : [];
  } catch (err) {
    // A hand-copied install, or a zip built before the changelog step existed.
    log("could not read changelog.json", err);
    cached = [];
  }
  return cached;
}

/**
 * A version with no notes still deserves to say something, rather than the
 * silent nothing that made the first version of this dialog useless.
 */
function placeholderEntry(version) {
  const repo = game.modules.get(MOD)?.url;
  return {
    version,
    date: null,
    title: "",
    summary: "This version shipped without release notes.",
    notes: [],
    link: repo
      ? {
          label: "Release notes",
          url: `${repo}/releases`,
          hint: "The full history on GitHub",
        }
      : null,
  };
}

/** Entries strictly newer than `lastSeen`; just the latest on a fresh install. */
function entriesSince(entries, lastSeen) {
  if (!lastSeen) return entries.slice(0, 1);
  return entries.filter((e) => foundry.utils.isNewerVersion(e.version, lastSeen));
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderEntry(entry) {
  const date = entry.date
    ? `<div class="nhp-whatsnew__date">${esc(entry.date)}</div>`
    : "";

  const summary = entry.summary
    ? `<div class="nhp-whatsnew__body">${inline(entry.summary)}</div>`
    : "";

  const notes = entry.notes?.length
    ? `<ul class="nhp-whatsnew__notes">${entry.notes
        .map((n) => `<li>${inline(n)}</li>`)
        .join("")}</ul>`
    : "";

  const link = entry.link?.url
    ? `<a class="nhp-whatsnew__link" href="${esc(entry.link.url)}" target="_blank" rel="noopener noreferrer">
         <span class="nhp-whatsnew__link-label">${esc(entry.link.label)}</span>
         ${entry.link.hint ? `<span class="nhp-whatsnew__link-hint">${esc(entry.link.hint)}</span>` : ""}
         <span class="nhp-whatsnew__link-host">${esc(hostOf(entry.link.url))}</span>
       </a>`
    : "";

  // A generated entry has no title of its own, so the version carries the
  // heading alone rather than reading "Version 0.1.8 0.1.8".
  const heading = entry.title
    ? `${esc(entry.title)} ${esc(entry.version)}`
    : `Version ${esc(entry.version)}`;

  return `<section class="nhp-whatsnew__entry">
      <h3 class="nhp-whatsnew__title">${heading}</h3>
      ${date}${summary}${notes}${link}
    </section>`;
}

/** Shown above the entries the very first time the module runs. */
const WELCOME =
  "Thanks for installing the NHP Uplink. Point it at your SillyTavern uplink " +
  "plugin under <strong>Configure Settings &rarr; Module Settings</strong>, " +
  "then start a combat and the AI GM will start narrating.";

function renderContent(entries, { welcome = false } = {}) {
  const intro = welcome ? `<p class="nhp-whatsnew__welcome">${WELCOME}</p>` : "";
  return `<div class="nhp-whatsnew">${intro}${entries.map(renderEntry).join("")}</div>`;
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

async function openDialog(entries, { welcome = false } = {}) {
  const content = renderContent(entries, { welcome });
  const title = welcome ? "Welcome" : "What's New";

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    return DialogV2.prompt({
      window: { title, icon: "fas fa-satellite-dish" },
      classes: ["nhp-whatsnew-app"],
      position: { width: 620 },
      content,
      ok: { label: "Got it", icon: "fas fa-check" },
      rejectClose: false,
    });
  }

  // Fallback for cores without the ApplicationV2 dialog.
  return Dialog.prompt({
    title,
    content,
    label: "Got it",
    options: { classes: ["nhp-whatsnew-app"], width: 620 },
    rejectClose: false,
  });
}

/**
 * Show the release notes if this client has not acknowledged the current
 * version yet.
 *
 * @param {object} [options]
 * @param {boolean} [options.force] Always show, and show the full history.
 * @returns {Promise<boolean>} Whether the dialog was shown.
 */
export async function showWhatsNew({ force = false } = {}) {
  const version = currentVersion();
  const lastSeen = game.settings.get(MOD, "lastSeenVersion");
  const firstRun = !lastSeen;

  if (force) {
    const all = await loadChangelog();
    await openDialog(all.length ? all : [placeholderEntry(version)]);
    await game.settings.set(MOD, "lastSeenVersion", version);
    return true;
  }

  // Opted out: quietly keep the marker current, so turning notes back on later
  // does not dump a backlog the user already chose to skip.
  if (!game.settings.get(MOD, "showReleaseNotes")) {
    if (lastSeen !== version) {
      await game.settings.set(MOD, "lastSeenVersion", version);
    }
    return false;
  }

  // Same version, or a downgrade: nothing to say.
  if (!firstRun && !foundry.utils.isNewerVersion(version, lastSeen)) return false;

  const all = await loadChangelog();
  let entries = entriesSince(all, lastSeen);

  // The version moved but the changelog does not cover it. Say so rather than
  // staying silent, which just looks like the update did nothing.
  if (!entries.length) entries = [placeholderEntry(version)];

  await openDialog(entries, { welcome: firstRun });
  await game.settings.set(MOD, "lastSeenVersion", version);
  return true;
}

/* ------------------------------------------------------------------ */
/* Settings menu entry                                                 */
/* ------------------------------------------------------------------ */

/** A button in Module Settings that reopens the notes on demand. */
class ChangelogMenu extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${MOD}-changelog-menu` };

  async render() {
    await showWhatsNew({ force: true });
    return this;
  }

  async close() {
    return this;
  }
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  game.settings.register(MOD, "lastSeenVersion", {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });

  game.settings.register(MOD, "showReleaseNotes", {
    name: "Show release notes",
    hint: "Pop up a summary of what changed the first time you load a new version of the uplink.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.registerMenu(MOD, "changelogMenu", {
    name: "Release notes",
    label: "View release notes",
    hint: "Read the uplink's change history at any time.",
    icon: "fas fa-scroll",
    type: ChangelogMenu,
    restricted: false,
  });
});

Hooks.once("ready", () => {
  showWhatsNew().catch((err) => log("release notes failed", err));

  const mod = game.modules.get(MOD);
  mod.api = Object.assign(mod.api ?? {}, {
    showChangelog: () => showWhatsNew({ force: true }),
  });
});
