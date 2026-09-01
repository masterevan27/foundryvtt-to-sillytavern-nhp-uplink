const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, snapshotDisabled, diffPresetAgainstTables } = require('../lib/presets');

test('slugify lowercases, hyphenates, and strips punctuation', () => {
    assert.equal(slugify('Grittier Frontier!'), 'grittier-frontier');
    assert.equal(slugify('  Leading/trailing spaces  '), 'leading-trailing-spaces');
});

test('snapshotDisabled captures only disabled bullets, grouped by table', () => {
    const parsed = [
        { name: 'Outfit', bullets: [
            { text: 'a jacket', weight: 1, enabled: true },
            { text: 'a graffiti tee', weight: 1, enabled: false },
        ] },
        { name: 'Gear', bullets: [
            { text: 'nothing at all', weight: 1, enabled: true },
        ] },
    ];
    assert.deepEqual(snapshotDisabled(parsed), { Outfit: ['a graffiti tee'] });
});

test('diffPresetAgainstTables buckets matches into willDisable, alreadyDisabled, and notFound', () => {
    const parsed = [
        { name: 'Outfit', bullets: [
            { text: 'a jacket', weight: 1, enabled: true },
            { text: 'a graffiti tee', weight: 1, enabled: false },
        ] },
    ];
    const preset = { Outfit: ['a jacket', 'a graffiti tee', 'a bullet that got removed'] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a jacket' }]);
    assert.deepEqual(diff.alreadyDisabled, [{ table: 'Outfit', text: 'a graffiti tee' }]);
    assert.deepEqual(diff.notFound, [{ table: 'Outfit', text: 'a bullet that got removed' }]);
});

test('diffPresetAgainstTables reports every bullet not found when the whole table is missing locally', () => {
    const diff = diffPresetAgainstTables({ Headgear: ['a helmet'] }, [{ name: 'Outfit', bullets: [] }]);
    assert.deepEqual(diff.notFound, [{ table: 'Headgear', text: 'a helmet' }]);
});
