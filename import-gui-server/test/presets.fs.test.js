const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listPresets, presetExists, readPreset, writePreset, deletePreset } = require('../lib/presets');

function withTempPresetsDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presets-fs-test-'));
    try {
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('listPresets returns an empty array when the directory does not exist yet', () => {
    withTempPresetsDir((dir) => {
        assert.deepEqual(listPresets(path.join(dir, 'does-not-exist')), []);
    });
});

test('writePreset then readPreset round-trips the same data', () => {
    withTempPresetsDir((dir) => {
        const preset = { name: 'Grittier Frontier', created: '2026-09-01T00:00:00.000Z', disabled: { Outfit: ['a graffiti tee'] } };
        writePreset(dir, 'grittier-frontier', preset);
        assert.deepEqual(readPreset(dir, 'grittier-frontier'), preset);
    });
});

test('presetExists is false before writing and true after', () => {
    withTempPresetsDir((dir) => {
        assert.equal(presetExists(dir, 'x'), false);
        writePreset(dir, 'x', { name: 'x', created: 'now', disabled: {} });
        assert.equal(presetExists(dir, 'x'), true);
    });
});

test('listPresets sorts newest-created first and reports bullet counts', () => {
    withTempPresetsDir((dir) => {
        writePreset(dir, 'older', { name: 'Older', created: '2026-01-01T00:00:00.000Z', disabled: { Outfit: ['a'] } });
        writePreset(dir, 'newer', { name: 'Newer', created: '2026-06-01T00:00:00.000Z', disabled: { Outfit: ['a', 'b'], Gear: ['c'] } });
        const list = listPresets(dir);
        assert.equal(list.length, 2);
        assert.equal(list[0].slug, 'newer');
        assert.equal(list[0].count, 3);
        assert.equal(list[1].slug, 'older');
        assert.equal(list[1].count, 1);
    });
});

test('deletePreset removes the file and returns true, then false on a second call', () => {
    withTempPresetsDir((dir) => {
        writePreset(dir, 'x', { name: 'x', created: 'now', disabled: {} });
        assert.equal(deletePreset(dir, 'x'), true);
        assert.equal(presetExists(dir, 'x'), false);
        assert.equal(deletePreset(dir, 'x'), false);
    });
});

test('readPreset returns null for an unknown slug', () => {
    withTempPresetsDir((dir) => {
        assert.equal(readPreset(dir, 'nope'), null);
    });
});
