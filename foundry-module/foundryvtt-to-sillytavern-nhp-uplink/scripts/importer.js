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
 * Generated-content importer.
 *
 * The companion half of the Lancer NPC Import GUI, which lives in its own repo
 * at https://github.com/masterevan27/lancer-npc-import-gui: a GM picks NPCs
 * (and, eventually, other generated content) to import in that standalone page,
 * and this script is what actually turns a selection into Actors, since
 * Foundry has no external API that could do it from outside the client.
 *
 * Runs on exactly one client - the primary active GM, same rule uplink.js
 * uses - and only ever calls out (poll for pending jobs, report results),
 * never accepts inbound connections, matching this module's "socket: false"
 * stance.
 *
 * Import jobs carry image paths already relative to Foundry's Data/
 * directory (that server resolves it; see its config.foundryDataRoot),
 * so creating the Actor is just Actor.create() with img/token texture set to
 * those paths directly - no file transfer involved.
 *
 * Dedup: every Actor this script creates gets flags.<MOD>.importItemId set to
 * the generator's stable item id. Rather than trust a local cache to stay
 * right, this script reports the full set of those flags back to the server
 * on every poll (reconcile), so deleting an Actor in Foundry makes that item
 * importable again on the next tick, and a fresh machine with no local state
 * still sees the correct picture the first time it connects.
 *
 * The three /importer/* endpoints below are a CROSS-REPO contract now. See
 * docs/foundry-importer-contract.md before changing any of them: the server
 * side ships separately, and a released module.zip cannot be updated in step.
 */

const MOD = "foundryvtt-to-sillytavern-nhp-uplink";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const IMPORTER_SETTINGS = {
  importerEnabled: {
    type: Boolean,
    default: true,
    name: "Enable content importer",
    hint: "Poll the import GUI server for NPCs (and other generated content) the GM has selected, and create them as Actors.",
  },
  importerEndpoint: {
    type: String,
    default: "http://127.0.0.1:5089",
    name: "Import GUI server URL",
    hint: "Base URL of the Lancer NPC Import GUI (github.com/masterevan27/lancer-npc-import-gui).",
  },
  importerSecret: {
    type: String,
    default: "",
    name: "Import GUI shared secret",
    hint: "Must match the secret in the Import GUI's config.json. Leave blank to disable auth.",
  },
  importerPollSeconds: {
    type: Number,
    default: 5,
    name: "Import poll interval (seconds)",
    hint: "How often to check the import GUI server for newly selected content.",
  },
};

function setting(key) {
  return game.settings.get(MOD, key);
}

function log(...args) {
  console.log(`${MOD} | importer |`, ...args);
}

function isUplinkClient() {
  if (!game.user?.isGM) return false;
  const primary = game.users?.activeGM;
  if (primary) return primary.id === game.user.id;
  return true;
}

/* ------------------------------------------------------------------ */
/* Server calls                                                        */
/* ------------------------------------------------------------------ */

function endpoint(path) {
  return `${setting("importerEndpoint").replace(/\/+$/, "")}${path}`;
}

function authHeaders() {
  return { "X-Import-Gui-Key": setting("importerSecret") ?? "" };
}

async function fetchPending() {
  const res = await fetch(endpoint("/importer/pending"), {
    mode: "cors",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  return payload.jobs ?? [];
}

async function reportComplete(result) {
  await fetch(endpoint("/importer/complete"), {
    method: "POST",
    mode: "cors",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}

async function reportReconcile(entries) {
  await fetch(endpoint("/importer/reconcile"), {
    method: "POST",
    mode: "cors",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

async function createActorFor(job) {
  const img = job.portraitPath || job.tokenPath || undefined;
  const tokenImg = job.tokenPath || job.portraitPath || undefined;

  const actor = await Actor.create({
    name: job.name,
    type: "npc",
    img,
    prototypeToken: tokenImg ? { texture: { src: tokenImg } } : undefined,
    flags: {
      [MOD]: {
        importItemId: job.itemId,
        importKind: job.kind,
        importedAt: Date.now(),
      },
    },
  });

  return actor;
}

async function processJob(job) {
  try {
    const actor = await createActorFor(job);
    log(`imported "${job.name}" -> ${actor.uuid}`);
    await reportComplete({
      jobId: job.jobId,
      itemId: job.itemId,
      ok: true,
      actorId: actor.id,
      actorUuid: actor.uuid,
    });
  } catch (err) {
    log(`import failed for "${job.name}":`, err.message);
    await reportComplete({
      jobId: job.jobId,
      itemId: job.itemId,
      ok: false,
      error: err.message,
    });
  }
}

/** Every Actor in this world this script has ever created, by its flag. */
function importedActorEntries() {
  const entries = [];
  for (const actor of game.actors ?? []) {
    const itemId = actor.getFlag(MOD, "importItemId");
    if (itemId) entries.push({ itemId, actorId: actor.id, actorUuid: actor.uuid });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Poll loop                                                           */
/* ------------------------------------------------------------------ */

let pollTimer = null;
let polling = false;

async function pollOnce() {
  if (!setting("importerEnabled") || !isUplinkClient()) return;
  if (polling) return; // a slow previous cycle is still running
  polling = true;
  try {
    const jobs = await fetchPending();
    for (const job of jobs) await processJob(job);
    await reportReconcile(importedActorEntries());
  } catch (err) {
    log("poll failed", err.message);
  } finally {
    polling = false;
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const seconds = Math.max(2, Number(setting("importerPollSeconds")) || 5);
  pollTimer = setInterval(pollOnce, seconds * 1000);
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  for (const [key, cfg] of Object.entries(IMPORTER_SETTINGS)) {
    game.settings.register(MOD, key, {
      name: cfg.name,
      hint: cfg.hint,
      scope: "world",
      config: true,
      type: cfg.type,
      default: cfg.default,
      onChange: () => {
        if (key === "importerPollSeconds") startPolling();
      },
    });
  }
});

Hooks.once("ready", () => {
  if (game.system.id !== "lancer") return;
  if (!isUplinkClient()) {
    log("standing by (another GM client owns the uplink)");
    return;
  }
  startPolling();
  pollOnce().catch((err) => log("initial poll failed", err.message));
});
