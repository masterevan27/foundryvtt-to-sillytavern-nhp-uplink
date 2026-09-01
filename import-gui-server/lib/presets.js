/**
 * Preset save/export/import logic for the Tables tab. A preset is a
 * snapshot of every bullet disabled anywhere in npc-generator-tables.md at
 * the moment it's saved: { name, created, disabled: { [table]: text[] } }.
 * Applying one only ever disables bullets it names - it never re-enables
 * anything it doesn't mention, so importing someone else's preset can't
 * silently undo unrelated customizations of your own. See the design doc
 * this implements.
 */

const fs = require('node:fs');
const path = require('node:path');

function slugify(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function snapshotDisabled(parsedTables) {
    const out = {};
    for (const table of parsedTables) {
        const disabledTexts = table.bullets.filter((b) => !b.enabled).map((b) => b.text);
        if (disabledTexts.length) out[table.name] = disabledTexts;
    }
    return out;
}

function diffPresetAgainstTables(presetDisabled, parsedTables) {
    const byTable = new Map(parsedTables.map((t) => [t.name, t.bullets]));
    const willDisable = [];
    const alreadyDisabled = [];
    const notFound = [];
    for (const [table, texts] of Object.entries(presetDisabled || {})) {
        const bullets = byTable.get(table) || [];
        for (const text of texts) {
            const bullet = bullets.find((b) => b.text === text);
            if (!bullet) notFound.push({ table, text });
            else if (bullet.enabled) willDisable.push({ table, text });
            else alreadyDisabled.push({ table, text });
        }
    }
    return { willDisable, alreadyDisabled, notFound };
}

function presetFile(dir, slug) {
    return path.join(dir, `${slug}.json`);
}

function presetExists(dir, slug) {
    return fs.existsSync(presetFile(dir, slug));
}

function readPreset(dir, slug) {
    const file = presetFile(dir, slug);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writePreset(dir, slug, presetObject) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(presetFile(dir, slug), JSON.stringify(presetObject, null, 2));
}

function deletePreset(dir, slug) {
    const file = presetFile(dir, slug);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
}

function listPresets(dir) {
    let files;
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    const out = files.map((f) => {
        const slug = f.slice(0, -'.json'.length);
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const count = Object.values(data.disabled || {}).reduce((n, arr) => n + arr.length, 0);
        return { name: data.name, slug, created: data.created, count };
    });
    out.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
    return out;
}

module.exports = {
    slugify, snapshotDisabled, diffPresetAgainstTables,
    listPresets, presetExists, readPreset, writePreset, deletePreset,
};
