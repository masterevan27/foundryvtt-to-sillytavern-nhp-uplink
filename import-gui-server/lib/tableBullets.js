/**
 * Parses and edits npc-generator-tables.md's bullet lists in place.
 *
 * Mirrors generate-npc.py's own parse_tables()/split_flags() conventions
 * closely enough to stay in sync with it: '## Heading' starts a table, a
 * '- ' line is a bullet, a leading 'xN ' on a bullet is its weight. This
 * module adds one convention generate-npc.py doesn't need to know about -
 * a bullet wrapped '<!-- - text -->' is disabled. generate-npc.py's own
 * parser already ignores any line that doesn't start with '-', so a
 * disabled bullet is silently skipped there with no change needed to that
 * script - see the design doc this implements.
 */

const fs = require('node:fs');

const HEADING_RE = /^##\s+(?!#)\s*(.*?)\s*$/;
const ENABLED_BULLET_RE = /^-\s+(.*?)\s*$/;
const DISABLED_BULLET_RE = /^<!--\s*-\s+(.*?)\s*-->\s*$/;
const WEIGHT_RE = /^x(\d+)\s+(.*)$/;

/** One bullet line -> { raw, enabled }, or null if the line isn't a bullet at all. */
function matchBulletLine(line) {
    const disabled = line.match(DISABLED_BULLET_RE);
    if (disabled) return { raw: disabled[1], enabled: false };
    const active = line.match(ENABLED_BULLET_RE);
    if (active) return { raw: active[1], enabled: true };
    return null;
}

/** A bullet's raw text (weight prefix still attached) -> { weight, text }. */
function splitWeight(raw) {
    const m = raw.match(WEIGHT_RE);
    return m ? { weight: Number(m[1]), text: m[2] } : { weight: 1, text: raw };
}

function parseTableFile(fileText) {
    const lines = fileText.split('\n');
    const tables = [];
    let current = null;
    for (const line of lines) {
        const heading = line.match(HEADING_RE);
        if (heading) {
            current = { name: heading[1], bullets: [] };
            tables.push(current);
            continue;
        }
        if (!current) continue;
        const bullet = matchBulletLine(line);
        if (!bullet) continue;
        const { weight, text } = splitWeight(bullet.raw);
        current.bullets.push({ text, weight, enabled: bullet.enabled });
    }
    return tables;
}

function toggleBulletInText(fileText, tableName, bulletText, enabled) {
    const lines = fileText.split('\n');
    let inTarget = false;
    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(HEADING_RE);
        if (heading) {
            inTarget = heading[1] === tableName;
            continue;
        }
        if (!inTarget) continue;
        const bullet = matchBulletLine(lines[i]);
        if (!bullet) continue;
        const { text } = splitWeight(bullet.raw);
        if (text !== bulletText) continue;

        if (bullet.enabled === enabled) return { ok: true, text: fileText }; // already in the requested state

        lines[i] = enabled ? `- ${bullet.raw}` : `<!-- - ${bullet.raw} -->`;
        return { ok: true, text: lines.join('\n') };
    }
    return { ok: false, error: `no bullet matching that text under "## ${tableName}"` };
}

/** The inverse of splitWeight(): weight 1 has no prefix, matching every plain bullet already in the file. */
function formatRaw(weight, text) {
    return weight === 1 ? text : `x${weight} ${text}`;
}

function setBulletWeightInText(fileText, tableName, bulletText, weight) {
    if (!Number.isInteger(weight) || weight < 1) {
        return { ok: false, error: 'weight must be an integer >= 1' };
    }
    const lines = fileText.split('\n');
    let inTarget = false;
    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(HEADING_RE);
        if (heading) {
            inTarget = heading[1] === tableName;
            continue;
        }
        if (!inTarget) continue;
        const bullet = matchBulletLine(lines[i]);
        if (!bullet) continue;
        const { weight: currentWeight, text } = splitWeight(bullet.raw);
        if (text !== bulletText) continue;

        if (currentWeight === weight) return { ok: true, text: fileText }; // already at that weight

        const raw = formatRaw(weight, text);
        lines[i] = bullet.enabled ? `- ${raw}` : `<!-- - ${raw} -->`;
        return { ok: true, text: lines.join('\n') };
    }
    return { ok: false, error: `no bullet matching that text under "## ${tableName}"` };
}

function readTables(filePath) {
    return parseTableFile(fs.readFileSync(filePath, 'utf8'));
}

function toggleBulletOnDisk(filePath, tableName, bulletText, enabled) {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const result = toggleBulletInText(fileText, tableName, bulletText, enabled);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.text);
    return { ok: true };
}

function setBulletWeightOnDisk(filePath, tableName, bulletText, weight) {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const result = setBulletWeightInText(fileText, tableName, bulletText, weight);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.text);
    return { ok: true };
}

module.exports = {
    parseTableFile, toggleBulletInText, readTables, toggleBulletOnDisk,
    setBulletWeightInText, setBulletWeightOnDisk,
};
