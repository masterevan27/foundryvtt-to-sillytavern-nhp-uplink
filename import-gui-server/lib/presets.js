/**
 * Preset save/export/import logic for the Tables tab. A preset is a full
 * snapshot, at the moment it's saved, of every table that existed in
 * npc-generator-tables.md and every bullet that was enabled in each one:
 * { name, created, selected: { [table]: Array<{ text, weight }> } }.
 * Every table gets a key, even one with an empty array (every bullet
 * disabled at save time) - that's what "covers" it.
 *
 * Applying a preset treats it as the definitive configuration for every
 * table it covers: bullets it lists get enabled at their listed weight,
 * and any other bullet currently enabled in that same table gets
 * disabled. A table that didn't exist yet when the preset was saved has
 * no key in `selected` and is left completely untouched by apply - this
 * is what keeps an old preset safe to apply after you've added whole new
 * tables later.
 */

const fs = require('node:fs');
const path = require('node:path');

function slugify(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function snapshotSelected(parsedTables) {
    const out = {};
    for (const table of parsedTables) {
        out[table.name] = table.bullets
            .filter((b) => b.enabled)
            .map((b) => ({ text: b.text, weight: b.weight }));
    }
    return out;
}

function diffPresetAgainstTables(presetSelected, parsedTables) {
    const byTable = new Map(parsedTables.map((t) => [t.name, t.bullets]));
    const willEnable = [];
    const willDisable = [];
    const willReweight = [];
    const alreadyMatching = [];
    const notFound = [];

    for (const [table, entries] of Object.entries(presetSelected || {})) {
        const bullets = byTable.get(table);
        if (!bullets) {
            for (const { text } of entries) notFound.push({ table, text });
            continue;
        }
        const selected = new Map(entries.map((e) => [e.text, e.weight]));
        for (const { text } of entries) {
            if (!bullets.some((b) => b.text === text)) notFound.push({ table, text });
        }
        for (const bullet of bullets) {
            const wantWeight = selected.get(bullet.text);
            if (wantWeight === undefined) {
                if (bullet.enabled) willDisable.push({ table, text: bullet.text });
                else alreadyMatching.push({ table, text: bullet.text });
            } else if (!bullet.enabled) {
                willEnable.push({ table, text: bullet.text, weight: wantWeight });
            } else if (bullet.weight !== wantWeight) {
                willReweight.push({ table, text: bullet.text, weight: wantWeight });
            } else {
                alreadyMatching.push({ table, text: bullet.text });
            }
        }
    }
    return { willEnable, willDisable, willReweight, alreadyMatching, notFound };
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
        const count = Object.values(data.selected || {}).reduce((n, arr) => n + arr.length, 0);
        return { name: data.name, slug, created: data.created, count };
    });
    out.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
    return out;
}

module.exports = {
    slugify, snapshotSelected, diffPresetAgainstTables,
    listPresets, presetExists, readPreset, writePreset, deletePreset,
};
