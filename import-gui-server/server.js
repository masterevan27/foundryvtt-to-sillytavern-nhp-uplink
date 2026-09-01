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
 * Import GUI server
 *
 * A small standalone Node server (stdlib only, same spirit as
 * ../st-server-plugin) that lets a GM browse dynamically generated content
 * (currently: NPCs rolled by generate-npc.py) and choose which of it gets
 * created as Actors in Foundry.
 *
 * Two faces, same as the SillyTavern relay:
 *
 *   1. GM-facing routes under /api/*, same-origin with the page this server
 *      also serves (public/) - no CORS needed.
 *   2. A Foundry-facing poll queue under /importer/*, which the module's
 *      scripts/importer.js polls the same way uplink.js polls the ST relay's
 *      /outbound. Foundry only ever calls out; this server never reaches
 *      into a running world.
 *
 * Generated content reaches this server by reading generate-npc.py's own
 * `.generated-npcs.json` run log directly off disk - no transport needed for
 * that half. Importing an item that isn't already under `foundryDataRoot`
 * (the normal case - generate-npc.py's own default output root is a ComfyUI
 * review folder, not the Foundry Data tree) copies its files in first and
 * repoints the manifest entry at the copy, so Foundry only ever needs a path
 * relative to Data/ and a later Regenerate keeps writing to the same,
 * already-imported location. See copyIntoFoundry() below.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const tableBullets = require('./lib/tableBullets');
const presets = require('./lib/presets');

const PLUGIN_ID = 'import-gui-server';

const DEFAULT_CONFIG = {
    port: 5089,
    host: '127.0.0.1',
    secret: '',
    npcManifestPath: '',
    foundryDataRoot: '',
    // Regenerating an NPC's art shells out to generate-npc.py, which lives
    // beside npcManifestPath by default (that's where the script's own
    // DEFAULT_MANIFEST points) - only override generateNpcScript if it's
    // been moved elsewhere.
    pythonExecutable: 'python',
    generateNpcScript: '',
    // Where an imported item's files get copied to under foundryDataRoot -
    // see copyIntoFoundry(). Mirrors generate-npc.py's own COMFY_PREFIX so
    // the two output trees read as the same convention.
    foundryNpcSubdir: 'LancerNPCs',
    // npc-generator-tables.md and the npc-trait-import skill's staging
    // directory both default to their normal location next to
    // generate-npc.py; override either for a nonstandard layout.
    npcTablesPath: '',
    stagedImportsDir: '',
    presetsDir: '',
};

function loadConfig() {
    // Overridable so tests can point a real server.js process at a synthetic
    // fixture config without ever touching the real config.json.
    const file = process.env.IMPORT_GUI_CONFIG || path.join(__dirname, 'config.json');
    let fromFile = {};
    try {
        if (fs.existsSync(file)) fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.warn(`[${PLUGIN_ID}] could not read config.json:`, err.message);
    }
    return {
        ...DEFAULT_CONFIG,
        ...fromFile,
        port: Number(process.env.IMPORT_GUI_PORT || fromFile.port || DEFAULT_CONFIG.port),
        host: process.env.IMPORT_GUI_HOST || fromFile.host || DEFAULT_CONFIG.host,
        secret: process.env.IMPORT_GUI_SECRET ?? fromFile.secret ?? DEFAULT_CONFIG.secret,
    };
}

const config = loadConfig();

if (!config.npcManifestPath || !config.foundryDataRoot) {
    console.error(
        `[${PLUGIN_ID}] npcManifestPath and foundryDataRoot must be set in config.json ` +
        `(copy config.example.json and fill in your paths). Refusing to start.`,
    );
    process.exit(1);
}

// generate-npc.py's own DEFAULT_MANIFEST sits right beside it, so that's the
// natural default here too; generateNpcScript in config.json overrides it for
// a nonstandard layout.
const GENERATE_NPC_SCRIPT = config.generateNpcScript
    || path.join(path.dirname(config.npcManifestPath), 'generate-npc.py');

// npc-generator-tables.md sits at <ComfyUI dir>/Art Prompts/npc-generator-tables.md
// - one level up from generate-npc.py's own directory (COMFY_DIR in that
// script), the same layout DEFAULT_TABLES there assumes.
const NPC_TABLES_PATH = config.npcTablesPath
    || path.join(path.dirname(GENERATE_NPC_SCRIPT), '..', 'Art Prompts', 'npc-generator-tables.md');

// staged-imports/ is the npc-trait-import skill's own output directory, a
// sibling of npc-generator-tables.md.
const STAGED_IMPORTS_DIR = config.stagedImportsDir
    || path.join(path.dirname(NPC_TABLES_PATH), 'staged-imports');

// presets/ - saved snapshots of disabled table bullets - defaults to a
// sibling of staged-imports/, both alongside npc-generator-tables.md.
const PRESETS_DIR = config.presetsDir
    || path.join(path.dirname(NPC_TABLES_PATH), 'presets');

/* ------------------------------------------------------------------ */
/* Manifest access                                                     */
/* ------------------------------------------------------------------ */

/**
 * Read generate-npc.py's run log fresh every time it's needed. It's a small
 * JSON file rewritten after every NPC, so re-reading it beats trying to keep
 * this process in sync with a script that runs independently of it.
 */
function loadManifest() {
    let raw;
    try {
        raw = fs.readFileSync(config.npcManifestPath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.warn(`[${PLUGIN_ID}] ${config.npcManifestPath} is not valid JSON:`, err.message);
        return [];
    }
    const items = [];
    for (const [folderPath, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== 'object' || !entry.id) continue;
        items.push({ ...entry, folderPath });
    }
    return items;
}

function findItem(id) {
    return loadManifest().find((item) => item.id === id) || null;
}

/** Path relative to foundryDataRoot, forward-slashed the way Foundry wants it. */
function dataRelative(absolutePath) {
    const rel = path.relative(config.foundryDataRoot, absolutePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
}

function isUnderFoundryRoot(item) {
    return dataRelative(item.folderPath) !== null;
}

/**
 * Whether an item can be imported at all - just that its source files still
 * exist on disk, wherever the manifest currently records them. Importing no
 * longer requires that location to already be under foundryDataRoot;
 * queueImport()'s caller copies it in first via copyIntoFoundry() when it
 * isn't (see /api/import).
 */
function isImportable(item) {
    return fs.existsSync(item.folderPath);
}

/**
 * Deep-sorts object keys, matching generate-art.py's
 * save_manifest(..., sort_keys=True) so a manifest this server rewrites
 * diffs the same way a Python-written one would.
 */
function sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
        return out;
    }
    return value;
}

/**
 * <foundryDataRoot>/<foundryNpcSubdir>/<category>/<name>/ - the same
 * <category>/<name> nesting npc_folder() in generate-npc.py uses, just
 * rooted under Foundry's Data folder instead of wherever the item currently
 * lives (normally a ComfyUI review folder).
 */
function foundryDestFolder(item) {
    const category = path.basename(path.dirname(item.folderPath));
    const name = path.basename(item.folderPath);
    return path.join(config.foundryDataRoot, config.foundryNpcSubdir, category, name);
}

/**
 * Copies an item's files into foundryDataRoot and repoints its manifest
 * entry at the copy, in place. The manifest's own key *is* the folder path
 * (see loadManifest), so "moving" an entry means deleting the old key and
 * re-inserting the same entry under the new one - after which a later
 * Regenerate (which reads this same manifest fresh every time) writes new
 * art straight to the copy, and a by-hand `generate-npc.py --regen-manifest`
 * run would too.
 */
function copyIntoFoundry(item) {
    const dest = foundryDestFolder(item);
    fs.mkdirSync(dest, { recursive: true });
    for (const file of item.files || []) {
        const src = path.join(item.folderPath, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, file));
    }

    const raw = fs.readFileSync(config.npcManifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    const entry = parsed[item.folderPath];
    if (!entry) throw new Error(`manifest entry for ${item.folderPath} vanished mid-import`);
    delete parsed[item.folderPath];
    parsed[dest] = entry;
    fs.writeFileSync(config.npcManifestPath, JSON.stringify(sortKeysDeep(parsed), null, 2));

    return dest;
}

function itemFile(item, which) {
    const name = which === 'portrait' ? item.portrait : item.token;
    return name ? path.join(item.folderPath, name) : null;
}

/**
 * File mtime in ms, or null - used only as a cache-busting version stamp on
 * image URLs (see itemView) so a Regenerate that overwrites a portrait/token
 * in place is reflected immediately in the GUI (grid thumbnails included, not
 * just the detail overlay) instead of however long the browser feels like
 * keeping the old bytes around under the old URL.
 */
function fileVersion(file) {
    try {
        return Math.round(fs.statSync(file).mtimeMs);
    } catch {
        return null;
    }
}

/**
 * Permanently deletes a generated item: its whole folder on disk (portrait,
 * token, and any other files generate-npc.py wrote alongside them) plus its
 * manifest entry. Does *not* touch a Foundry Actor already created from it -
 * if the item was imported, its folder is the copy under foundryDataRoot
 * (see copyIntoFoundry), so this only removes the source art and the GUI's
 * record of it, not the Actor itself.
 */
function deleteItem(item) {
    try {
        fs.rmSync(item.folderPath, { recursive: true, force: true });
    } catch (err) {
        throw new Error(`couldn't delete files: ${err.message}`);
    }

    const raw = fs.readFileSync(config.npcManifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    delete parsed[item.folderPath];
    fs.writeFileSync(config.npcManifestPath, JSON.stringify(sortKeysDeep(parsed), null, 2));

    jobsByItemId.delete(item.id);
    regenJobsByItemId.delete(item.id);
    if (importedIndex.delete(item.id)) saveIndex();
}

/* ------------------------------------------------------------------ */
/* Import job queue + dedup index                                      */
/* ------------------------------------------------------------------ */

/** Jobs the GUI has queued, keyed by item id. One active job per item. */
const jobsByItemId = new Map();

/**
 * itemId -> { actorId, actorUuid, importedAt }. This is a cache for fast
 * lookups without Foundry running, not the source of truth - reconcile()
 * below rebuilds it from the actor flags Foundry actually reports, so a GM
 * deleting an Actor in Foundry is reflected here on the next poll rather
 * than leaving a stale "already imported" mark behind.
 */
const INDEX_FILE = path.join(__dirname, '.imported.json');
let importedIndex = new Map();
try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    for (const [id, rec] of Object.entries(JSON.parse(raw))) importedIndex.set(id, rec);
} catch { /* no cache yet, or unreadable - reconcile will rebuild it */ }

function saveIndex() {
    const obj = Object.fromEntries(importedIndex);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(obj, null, 2));
}

/** How long a job can sit "sent" before a poll re-offers it (a stuck/reloaded client). */
const SENT_STALE_MS = 2 * 60 * 1000;

function queueImport(item, { force = false } = {}) {
    const existing = jobsByItemId.get(item.id);
    if (existing && (existing.status === 'queued' || existing.status === 'sent')) {
        return { queued: true, jobId: existing.jobId };
    }
    if (importedIndex.has(item.id) && !force) {
        return { queued: false, reason: 'already imported' };
    }
    const job = {
        jobId: crypto.randomUUID(),
        itemId: item.id,
        kind: item.kind,
        name: item.name,
        callsign: item.callsign,
        role: item.traits?.Role || null,
        faction: item.traits?.Faction || null,
        portraitPath: dataRelative(itemFile(item, 'portrait')),
        tokenPath: dataRelative(itemFile(item, 'token')),
        status: 'queued',
        queuedAt: Date.now(),
    };
    jobsByItemId.set(item.id, job);
    return { queued: true, jobId: job.jobId };
}

function pendingJobsForFoundry() {
    const now = Date.now();
    const offered = [];
    for (const job of jobsByItemId.values()) {
        if (job.status === 'sent' && now - job.sentAt > SENT_STALE_MS) job.status = 'queued';
        if (job.status !== 'queued') continue;
        job.status = 'sent';
        job.sentAt = now;
        offered.push(job);
    }
    return offered;
}

function completeJob({ jobId, itemId, ok, actorId, actorUuid, error }) {
    const job = jobsByItemId.get(itemId);
    if (!job || job.jobId !== jobId) return false;
    job.doneAt = Date.now();
    if (ok) {
        job.status = 'done';
        importedIndex.set(itemId, { actorId, actorUuid, importedAt: job.doneAt });
        saveIndex();
        jobsByItemId.delete(itemId);
    } else {
        job.status = 'error';
        job.error = error || 'unknown error';
    }
    return true;
}

/** entries: [{ itemId, actorId, actorUuid }] currently flagged in the world. */
function reconcile(entries) {
    const seen = new Set();
    for (const { itemId, actorId, actorUuid } of entries) {
        if (!itemId) continue;
        seen.add(itemId);
        const prior = importedIndex.get(itemId);
        importedIndex.set(itemId, {
            actorId,
            actorUuid,
            importedAt: prior?.importedAt ?? Date.now(),
        });
    }
    for (const itemId of [...importedIndex.keys()]) {
        if (!seen.has(itemId)) importedIndex.delete(itemId);
    }
    saveIndex();
}

/* ------------------------------------------------------------------ */
/* Regenerate art                                                      */
/* ------------------------------------------------------------------ */

/**
 * Regen jobs, keyed by item id. Unlike an import job this server runs the
 * work itself (spawning generate-npc.py, which talks to ComfyUI directly) -
 * there's no Foundry-side poll queue for it. One entry lingers per item after
 * it finishes so a client that was mid-poll still sees the final status; a
 * new regen request for the same item just overwrites it.
 */
const regenJobsByItemId = new Map();

const REGEN_LOG_LIMIT = 4000; // chars of stdout+stderr kept for an error message

function startRegenJob(item, { which, seedMode, seed }) {
    const existing = regenJobsByItemId.get(item.id);
    if (existing?.status === 'running') return { ok: false, reason: 'already regenerating' };
    if (item.kind !== 'npc') {
        return { ok: false, reason: `regenerating art isn't supported for kind "${item.kind}" yet` };
    }
    if (!fs.existsSync(GENERATE_NPC_SCRIPT)) {
        return { ok: false, reason: `generate-npc.py not found at ${GENERATE_NPC_SCRIPT}` };
    }

    const newSeed = seedMode === 'specific' ? seed
        : seedMode === 'random' ? crypto.randomInt(0, 2 ** 32 - 1)
        : item.seed; // 'same' - exact reproduction

    const args = [
        GENERATE_NPC_SCRIPT,
        '--regen-manifest', config.npcManifestPath,
        '--regen-id', item.id,
        '--new-seed', String(newSeed),
    ];
    if (which === 'portrait') args.push('--no-token');
    if (which === 'token') args.push('--no-portrait');

    const job = { status: 'running', which, seedMode, seed: newSeed, startedAt: Date.now(), log: '' };
    regenJobsByItemId.set(item.id, job);

    let child;
    try {
        child = spawn(config.pythonExecutable, args, { cwd: path.dirname(GENERATE_NPC_SCRIPT) });
    } catch (err) {
        job.status = 'error';
        job.error = err.message;
        return { ok: true, seed: newSeed }; // job was recorded; poll will surface the failure
    }

    const collect = (chunk) => {
        job.log = (job.log + chunk.toString()).slice(-REGEN_LOG_LIMIT);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (err) => {
        job.status = 'error';
        job.error = err.message;
    });
    child.on('close', (code) => {
        if (job.status === 'error') return; // already failed via the 'error' event above
        job.doneAt = Date.now();
        if (code === 0) {
            job.status = 'done';
        } else {
            job.status = 'error';
            job.error = job.log.trim() || `generate-npc.py exited with code ${code}`;
        }
    });

    return { ok: true, seed: newSeed };
}

/* ------------------------------------------------------------------ */
/* Create NPC                                                          */
/* ------------------------------------------------------------------ */

/**
 * Jobs spawned from the "Create NPC" panel, keyed by a fresh id - unlike a
 * regen job these aren't tied to an existing manifest entry (there isn't one
 * until the script finishes and writes it), so the GUI polls by jobId
 * instead and just refreshes the NPC list once a non-dry-run job finishes.
 */
const createJobs = new Map();
const CREATE_LOG_LIMIT = 20000;

// Mirrors generate-npc.py's REQUIRED_TABLES, minus Pronouns (which gets its
// own field in the GUI, same as --pronouns on the CLI). Kept as a plain
// constant rather than parsed out of npc-generator-tables.md: the table
// *headings* required by the prompt templates are fixed by the script, while
// the file's per-gender variant headings are what's actually free to grow.
const OVERRIDE_TABLES = [
    'Given names', 'Family names', 'Callsigns', 'Age', 'Build', 'Skin', 'Hair',
    'Eyes', 'Feature', 'Demeanor', 'Role', 'Faction', 'Outfit', 'Headgear',
    'Gear', 'Accent', 'Backdrop', 'Weather', 'Stance',
];

function startCreateJob(opts) {
    if (!fs.existsSync(GENERATE_NPC_SCRIPT)) {
        return { ok: false, reason: `generate-npc.py not found at ${GENERATE_NPC_SCRIPT}` };
    }

    const args = [GENERATE_NPC_SCRIPT, '--count', String(opts.count)];
    if (opts.seed !== null) args.push('--seed', String(opts.seed));
    if (opts.name) args.push('--name', opts.name);
    if (opts.pronouns) args.push('--pronouns', opts.pronouns);
    for (const { table, value } of opts.overrides) args.push('--set-trait', `${table}=${value}`);
    if (opts.noPortrait) args.push('--no-portrait');
    if (opts.noToken) args.push('--no-token');
    if (opts.keepRawToken) args.push('--keep-raw-token');
    if (opts.server) args.push('--server', opts.server);
    if (opts.dryRun) args.push('--dry-run');

    const jobId = crypto.randomUUID();
    const job = { status: 'running', dryRun: !!opts.dryRun, startedAt: Date.now(), log: '' };
    createJobs.set(jobId, job);

    let child;
    try {
        child = spawn(config.pythonExecutable, args, { cwd: path.dirname(GENERATE_NPC_SCRIPT) });
    } catch (err) {
        job.status = 'error';
        job.error = err.message;
        return { ok: true, jobId };
    }

    const collect = (chunk) => { job.log = (job.log + chunk.toString()).slice(-CREATE_LOG_LIMIT); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (err) => { job.status = 'error'; job.error = err.message; });
    child.on('close', (code) => {
        if (job.status === 'error') return; // already failed via the 'error' event above
        job.doneAt = Date.now();
        job.status = code === 0 ? 'done' : 'error';
        if (code !== 0) job.error = job.log.trim() || `generate-npc.py exited with code ${code}`;
    });

    return { ok: true, jobId };
}

/* ------------------------------------------------------------------ */
/* Trait candidates (npc-trait-import skill staging)                   */
/* ------------------------------------------------------------------ */

function listStagedFiles() {
    try {
        return fs.readdirSync(STAGED_IMPORTS_DIR).filter((f) => f.endsWith('.json')).sort();
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

function loadStagedFile(file) {
    return JSON.parse(fs.readFileSync(path.join(STAGED_IMPORTS_DIR, file), 'utf8'));
}

function saveStagedFile(file, data) {
    fs.writeFileSync(path.join(STAGED_IMPORTS_DIR, file), JSON.stringify(data, null, 2));
}

/** Every candidate across every staged-imports file, flattened for the GUI. */
function allTraitCandidates() {
    const out = [];
    for (const file of listStagedFiles()) {
        let data;
        try {
            data = loadStagedFile(file);
        } catch (err) {
            console.warn(`[${PLUGIN_ID}] ${file} is not valid JSON:`, err.message);
            continue;
        }
        for (const entry of data.entries || []) {
            out.push({
                file,
                id: entry.id,
                table: entry.table,
                bullet: entry.bullet,
                sourceImage: entry.source_image,
                placementHint: entry.placement_hint,
                bookkeepingNote: entry.bookkeeping_note,
                notes: entry.notes,
                imported: !!entry.imported,
                importedAt: entry.imported_at || null,
                generatedAt: data.generated_at || null,
            });
        }
    }
    return out;
}

/**
 * Appends one bullet to npc-generator-tables.md under its exact '## <table>'
 * heading, right before the next heading (or EOF) - i.e. as the new last
 * bullet in that section. A heading that doesn't exist yet is refused rather
 * than invented; deciding where a brand-new table belongs in the file is a
 * judgment call this shouldn't make silently.
 */
function insertBulletIntoTables(table, bullet) {
    const lines = fs.readFileSync(NPC_TABLES_PATH, 'utf8').split('\n');
    const headingRe = /^##\s+(?!#)\s*(.*?)\s*$/;

    let sectionStart = -1;
    let sectionEnd = lines.length;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(headingRe);
        if (!m) continue;
        if (sectionStart === -1) {
            if (m[1] === table) sectionStart = i;
            continue;
        }
        sectionEnd = i;
        break;
    }
    if (sectionStart === -1) {
        throw new Error(`no "## ${table}" heading in ${path.basename(NPC_TABLES_PATH)} - add the heading by hand first`);
    }

    // Walk sectionEnd back past trailing blank lines, so the new bullet lands
    // directly after the section's last bullet rather than after a gap.
    let insertAt = sectionEnd;
    while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;

    lines.splice(insertAt, 0, `- ${bullet}`);
    fs.writeFileSync(NPC_TABLES_PATH, lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Import-Gui-Key',
    'Access-Control-Max-Age': '86400',
};

function sendJson(res, status, body, extraHeaders = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        ...extraHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

function readBody(req, limitBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function authorised(req, url) {
    if (!config.secret) return true;
    const provided = req.headers['x-import-gui-key'] ?? url.searchParams.get('key');
    return provided === config.secret;
}

/* ---- item view for the GUI ---- */

function itemView(item) {
    const job = jobsByItemId.get(item.id);
    const regenJob = regenJobsByItemId.get(item.id);
    const imported = importedIndex.get(item.id) || null;
    const portraitFile = itemFile(item, 'portrait');
    const tokenFile = itemFile(item, 'token');
    return {
        id: item.id,
        kind: item.kind,
        name: item.name,
        callsign: item.callsign,
        traits: item.traits || {},
        // Only populated for kinds generate-npc.py's manifest records a seed
        // for - the GUI uses its presence to decide whether to offer Regenerate.
        seed: typeof item.seed === 'number' ? item.seed : null,
        // generate-npc.py sorts each NPC into <root>/<Role category>/<Name>/ based on
        // its rolled Role (see ROLE_CATEGORIES there) - the category itself isn't
        // duplicated into traits, so recover it from the folder it landed in.
        roleCategory: item.kind === 'npc' && item.folderPath
            ? path.basename(path.dirname(item.folderPath))
            : null,
        when: item.when,
        importable: isImportable(item),
        imported: !!imported,
        importedActorUuid: imported?.actorUuid ?? null,
        importedAt: imported?.importedAt ?? null,
        jobStatus: job ? job.status : null,
        jobError: job?.error ?? null,
        regenStatus: regenJob ? regenJob.status : null,
        regenError: regenJob?.status === 'error' ? regenJob.error : null,
        portraitUrl: item.portrait
            ? `/api/image?id=${encodeURIComponent(item.id)}&which=portrait&v=${fileVersion(portraitFile)}`
            : null,
        tokenUrl: item.token
            ? `/api/image?id=${encodeURIComponent(item.id)}&which=token&v=${fileVersion(tokenFile)}`
            : null,
        // Full assembled prompt text, saved alongside the individual rolled traits -
        // only present for entries written by a generate-npc.py new enough to record it.
        portraitPrompt: item.portraitPrompt || null,
        tokenPrompt: item.tokenPrompt || null,
    };
}

/* ---- routing ---- */

const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    // No '..' segments - this only ever serves the fixed files this repo ships.
    if (rel.includes('..')) return sendJson(res, 400, { error: 'bad path' });
    const file = path.join(PUBLIC_DIR, rel);
    const type = STATIC_TYPES[path.extname(file)];
    if (!type || !fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, url) {
    if (url.pathname === '/api/categories' && req.method === 'GET') {
        const byKind = new Map();
        for (const item of loadManifest()) {
            byKind.set(item.kind, (byKind.get(item.kind) || 0) + 1);
        }
        const categories = [...byKind.entries()].map(([id, count]) => ({ id, count }));
        return sendJson(res, 200, { categories });
    }

    if (url.pathname === '/api/items' && req.method === 'GET') {
        const category = url.searchParams.get('category');
        if (!category) return sendJson(res, 400, { error: 'category is required' });
        const items = loadManifest()
            .filter((item) => item.kind === category)
            .map(itemView)
            .sort((a, b) => a.name.localeCompare(b.name));
        return sendJson(res, 200, { items });
    }

    if (url.pathname === '/api/image' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        const which = url.searchParams.get('which');
        const item = id && findItem(id);
        if (!item) return sendJson(res, 404, { error: 'unknown item' });
        const file = itemFile(item, which);
        if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: 'no such image' });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
        return;
    }

    if (url.pathname === '/api/import' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const force = !!body.force;
        const results = ids.map((id) => {
            let item = findItem(id);
            if (!item) return { id, queued: false, reason: 'unknown item' };
            if (!isImportable(item)) return { id, queued: false, reason: 'source files missing on disk' };
            if (!isUnderFoundryRoot(item)) {
                const regenJob = regenJobsByItemId.get(item.id);
                if (regenJob?.status === 'running') {
                    return { id, queued: false, reason: 'art is regenerating - try again once it finishes' };
                }
                try {
                    copyIntoFoundry(item);
                } catch (err) {
                    return { id, queued: false, reason: `couldn't copy into Foundry: ${err.message}` };
                }
                item = findItem(id); // re-read: copyIntoFoundry() moved its manifest entry
            }
            return { id, ...queueImport(item, { force }) };
        });
        return sendJson(res, 200, { results });
    }

    if (url.pathname === '/api/delete' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const results = ids.map((id) => {
            const item = findItem(id);
            if (!item) return { id, deleted: false, reason: 'unknown item' };
            const job = jobsByItemId.get(id);
            if (job && (job.status === 'queued' || job.status === 'sent')) {
                return { id, deleted: false, reason: 'import is in progress - wait for it to finish or fail first' };
            }
            const regenJob = regenJobsByItemId.get(id);
            if (regenJob?.status === 'running') {
                return { id, deleted: false, reason: 'art is regenerating - try again once it finishes' };
            }
            try {
                deleteItem(item);
            } catch (err) {
                return { id, deleted: false, reason: err.message };
            }
            return { id, deleted: true };
        });
        return sendJson(res, 200, { results });
    }

    if (url.pathname === '/api/regenerate' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const item = body.id && findItem(body.id);
        if (!item) return sendJson(res, 404, { error: 'unknown item' });

        const which = ['portrait', 'token', 'both'].includes(body.which) ? body.which : 'both';
        const seedMode = ['same', 'specific', 'random'].includes(body.seedMode) ? body.seedMode : 'same';
        let seed;
        if (seedMode === 'specific') {
            seed = Number(body.seed);
            if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 32 - 1) {
                return sendJson(res, 400, { error: 'seed must be an integer between 0 and 4294967295' });
            }
        }

        const result = startRegenJob(item, { which, seedMode, seed });
        return sendJson(res, result.ok ? 202 : 409, result);
    }

    if (url.pathname === '/api/npc-tables' && req.method === 'GET') {
        return sendJson(res, 200, { tables: OVERRIDE_TABLES });
    }

    if (url.pathname === '/api/table-bullets' && req.method === 'GET') {
        return sendJson(res, 200, { tables: tableBullets.readTables(NPC_TABLES_PATH) });
    }

    if (url.pathname === '/api/table-bullets/toggle' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const { table, text, enabled } = body;
        if (typeof table !== 'string' || !table || typeof text !== 'string' || typeof enabled !== 'boolean') {
            return sendJson(res, 400, { error: 'table (string), text (string), and enabled (boolean) are required' });
        }
        const result = tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, enabled);
        if (!result.ok) return sendJson(res, 400, { error: result.error });
        return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/table-bullets/set-weight' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const { table, text, weight } = body;
        if (typeof table !== 'string' || !table || typeof text !== 'string'
            || !Number.isInteger(weight) || weight < 1) {
            return sendJson(res, 400, { error: 'table (string), text (string), and weight (integer >= 1) are required' });
        }
        const result = tableBullets.setBulletWeightOnDisk(NPC_TABLES_PATH, table, text, weight);
        if (!result.ok) return sendJson(res, 400, { error: result.error });
        return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/presets' && req.method === 'GET') {
        return sendJson(res, 200, { presets: presets.listPresets(PRESETS_DIR) });
    }

    if (url.pathname === '/api/presets' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return sendJson(res, 400, { error: 'name is required' });
        const slug = presets.slugify(name);
        if (!slug) return sendJson(res, 400, { error: 'name must contain at least one letter or digit' });
        if (presets.presetExists(PRESETS_DIR, slug)) {
            return sendJson(res, 409, { error: `a preset named "${name}" already exists` });
        }
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const preset = { name, created: new Date().toISOString(), disabled: presets.snapshotDisabled(parsed) };
        presets.writePreset(PRESETS_DIR, slug, preset);
        return sendJson(res, 200, { ok: true, slug });
    }

    if (url.pathname === '/api/presets/delete' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        const ok = slug && presets.deletePreset(PRESETS_DIR, slug);
        return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'unknown preset' });
    }

    if (url.pathname === '/api/presets/export' && req.method === 'GET') {
        const slug = url.searchParams.get('slug') || '';
        const preset = slug && presets.readPreset(PRESETS_DIR, slug);
        if (!preset) return sendJson(res, 404, { error: 'unknown preset' });
        const payload = JSON.stringify(preset, null, 2);
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${slug}.json"`,
            'Content-Length': Buffer.byteLength(payload),
        });
        return res.end(payload);
    }

    if (url.pathname === '/api/presets/import' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        if (!body || typeof body.disabled !== 'object' || body.disabled === null) {
            return sendJson(res, 400, { error: 'not a valid preset file - missing "disabled"' });
        }
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        return sendJson(res, 200, presets.diffPresetAgainstTables(body.disabled, parsed));
    }

    if (url.pathname === '/api/presets/apply' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        if (!body || typeof body.disabled !== 'object' || body.disabled === null) {
            return sendJson(res, 400, { error: 'not a valid preset file - missing "disabled"' });
        }
        // Re-diff against the live file rather than trusting a preview the
        // client may have shown a while ago - the file could have changed.
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const diff = presets.diffPresetAgainstTables(body.disabled, parsed);
        for (const { table, text } of diff.willDisable) {
            tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, false);
        }
        return sendJson(res, 200, diff);
    }

    if (url.pathname === '/api/create-npc' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }

        const count = Number.isInteger(body.count) && body.count > 0 ? body.count : 1;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name && count !== 1) {
            return sendJson(res, 400, { error: '--name only makes sense with a single NPC' });
        }
        let seed = null;
        if (body.seed !== null && body.seed !== undefined && body.seed !== '') {
            seed = Number(body.seed);
            if (!Number.isInteger(seed) || seed < 0) {
                return sendJson(res, 400, { error: 'seed must be a non-negative integer' });
            }
        }
        const overrides = (Array.isArray(body.overrides) ? body.overrides : [])
            .filter((o) => o && o.table && String(o.value ?? '').trim())
            .map((o) => ({ table: String(o.table), value: String(o.value).trim() }));
        const unknown = overrides.find((o) => !OVERRIDE_TABLES.includes(o.table));
        if (unknown) return sendJson(res, 400, { error: `unknown table "${unknown.table}"` });
        if (body.noPortrait && body.noToken) {
            return sendJson(res, 400, { error: '--no-portrait and --no-token together leave nothing to generate' });
        }

        const result = startCreateJob({
            count,
            seed,
            name: name || null,
            pronouns: typeof body.pronouns === 'string' && body.pronouns ? body.pronouns : null,
            overrides,
            noPortrait: !!body.noPortrait,
            noToken: !!body.noToken,
            keepRawToken: !!body.keepRawToken,
            server: typeof body.server === 'string' && body.server ? body.server : null,
            dryRun: !!body.dryRun,
        });
        return sendJson(res, result.ok ? 202 : 409, result);
    }

    if (url.pathname === '/api/create-status' && req.method === 'GET') {
        const jobId = url.searchParams.get('jobId');
        const job = jobId && createJobs.get(jobId);
        if (!job) return sendJson(res, 404, { error: 'unknown job' });
        return sendJson(res, 200, { status: job.status, dryRun: job.dryRun, log: job.log, error: job.error ?? null });
    }

    if (url.pathname === '/api/trait-candidates' && req.method === 'GET') {
        return sendJson(res, 200, { candidates: allTraitCandidates() });
    }

    if (url.pathname === '/api/trait-candidates/import' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const items = Array.isArray(body.items) ? body.items : [];

        const results = items.map(({ file, id }) => {
            let data;
            try {
                data = loadStagedFile(file);
            } catch (err) {
                return { file, id, imported: false, reason: `couldn't read ${file}: ${err.message}` };
            }
            const entry = (data.entries || []).find((e) => e.id === id);
            if (!entry) return { file, id, imported: false, reason: 'no such candidate' };
            if (entry.imported) return { file, id, imported: false, reason: 'already imported' };
            try {
                insertBulletIntoTables(entry.table, entry.bullet);
            } catch (err) {
                return { file, id, imported: false, reason: err.message };
            }
            entry.imported = true;
            entry.imported_at = new Date().toISOString();
            saveStagedFile(file, data);
            return { file, id, imported: true };
        });
        return sendJson(res, 200, { results });
    }

    sendJson(res, 404, { error: `no route ${req.method} ${url.pathname}` });
}

async function handleImporter(req, res, url) {
    res.setHeader('Access-Control-Allow-Origin', CORS_HEADERS['Access-Control-Allow-Origin']);

    if (!authorised(req, url)) return sendJson(res, 401, { error: 'bad or missing X-Import-Gui-Key' });

    if (url.pathname === '/importer/pending' && req.method === 'GET') {
        return sendJson(res, 200, { jobs: pendingJobsForFoundry() });
    }

    if (url.pathname === '/importer/complete' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const ok = completeJob(body);
        return sendJson(res, ok ? 200 : 409, { ok });
    }

    if (url.pathname === '/importer/reconcile' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        reconcile(Array.isArray(body.entries) ? body.entries : []);
        return sendJson(res, 200, { ok: true, tracked: importedIndex.size });
    }

    sendJson(res, 404, { error: `no route ${req.method} ${url.pathname}` });
}

async function handle(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
        return sendJson(res, 200, {
            ok: true,
            plugin: PLUGIN_ID,
            manifestItems: loadManifest().length,
            trackedImports: importedIndex.size,
            pendingJobs: [...jobsByItemId.values()].filter((j) => j.status !== 'done').length,
        });
    }

    if (url.pathname.startsWith('/importer/')) return handleImporter(req, res, url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
}

const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
        console.error(`[${PLUGIN_ID}] request failed:`, err);
        try {
            sendJson(res, 500, { error: 'internal error' });
        } catch { /* response already sent */ }
    });
});

server.listen(config.port, config.host, () => {
    console.log(`[${PLUGIN_ID}] listening on http://${config.host}:${config.port} (auth: ${config.secret ? 'on' : 'OFF'})`);
    console.log(`[${PLUGIN_ID}] manifest: ${config.npcManifestPath}`);
    console.log(`[${PLUGIN_ID}] Foundry Data root: ${config.foundryDataRoot}`);
});
