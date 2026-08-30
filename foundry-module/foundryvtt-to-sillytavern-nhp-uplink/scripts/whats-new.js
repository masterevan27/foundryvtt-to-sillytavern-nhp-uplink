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
 * To ship notes with a release: add an entry to the top of CHANGELOG whose
 * `version` matches the new module.json version. Everything newer than the
 * user's acknowledged version is shown, so a user who skips a few versions gets
 * every entry they missed.
 */

const MOD = "foundryvtt-to-sillytavern-nhp-uplink";

/* ------------------------------------------------------------------ */
/* Release notes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Newest first. `body` may contain simple HTML. `link` is optional.
 * @type {Array<{version: string, date: string, title: string, body: string,
 *               link?: {label: string, hint: string, url: string}}>}
 */
const CHANGELOG = [
  {
    version: "0.1.7",
    date: "2026-08-30",
    title: "Mission briefings",
    body: "Scene and journal briefings are now pushed to the AI GM feed, so the NHP opens a fight already knowing the situation.",
    link: {
      label: "Uplink on GitHub",
      hint: "Setup notes and the full release history",
      url: "https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink",
    },
  },
];

/** Shown above the entries the very first time the module runs. */
const WELCOME =
  "Thanks for installing the NHP Uplink. Point it at your SillyTavern uplink " +
  "plugin under <strong>Configure Settings &rarr; Module Settings</strong>, " +
  "then start a combat and the AI GM will start narrating.";

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

function currentVersion() {
  return game.modules.get(MOD)?.version ?? "0.0.0";
}

/** Entries strictly newer than `lastSeen`; just the latest on a fresh install. */
function entriesSince(lastSeen) {
  if (!lastSeen) return CHANGELOG.slice(0, 1);
  return CHANGELOG.filter((e) =>
    foundry.utils.isNewerVersion(e.version, lastSeen),
  );
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderEntry(entry) {
  const link = entry.link
    ? `<a class="nhp-whatsnew__link" href="${esc(entry.link.url)}" target="_blank" rel="noopener noreferrer">
         <span class="nhp-whatsnew__link-label">${esc(entry.link.label)}</span>
         <span class="nhp-whatsnew__link-hint">${esc(entry.link.hint)}</span>
         <span class="nhp-whatsnew__link-host">${esc(hostOf(entry.link.url))}</span>
       </a>`
    : "";

  return `<section class="nhp-whatsnew__entry">
      <h3 class="nhp-whatsnew__title">${esc(entry.title)} ${esc(entry.version)}</h3>
      <div class="nhp-whatsnew__date">${esc(entry.date)}</div>
      <div class="nhp-whatsnew__body">${entry.body}</div>
      ${link}
    </section>`;
}

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
    await openDialog(CHANGELOG);
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

  const entries = entriesSince(lastSeen);
  if (!entries.length) {
    await game.settings.set(MOD, "lastSeenVersion", version);
    return false;
  }

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
