const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTableFile, toggleBulletInText, setBulletWeightInText } = require('../lib/tableBullets');

const SAMPLE = [
    '# Random NPC Generator Tables',
    '',
    '## Outfit',
    '',
    '- a heavy work jacket over a stained undersuit || civ',
    '- x4 nondescript grey work coveralls',
    '<!-- - a graffiti-tagged cropped t-shirt and cut-off shorts || civ -->',
    '',
    '## Gear',
    '',
    '- nothing at all, hands loose and empty',
    '- a sidearm holstered high on a chest rig || mil',
    '',
].join('\n');

test('parseTableFile reads enabled, weighted, and disabled bullets', () => {
    const tables = parseTableFile(SAMPLE);
    assert.equal(tables.length, 2);
    assert.equal(tables[0].name, 'Outfit');
    assert.deepEqual(tables[0].bullets, [
        { text: 'a heavy work jacket over a stained undersuit || civ', weight: 1, enabled: true },
        { text: 'nondescript grey work coveralls', weight: 4, enabled: true },
        { text: 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', weight: 1, enabled: false },
    ]);
    assert.equal(tables[1].name, 'Gear');
    assert.equal(tables[1].bullets.length, 2);
});

test('toggleBulletInText disables an enabled bullet by wrapping it in an HTML comment', () => {
    const result = toggleBulletInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', false);
    assert.equal(result.ok, true);
    assert.match(result.text, /<!-- - nothing at all, hands loose and empty -->/);
    const reparsed = parseTableFile(result.text);
    const gear = reparsed.find((t) => t.name === 'Gear');
    const bullet = gear.bullets.find((b) => b.text === 'nothing at all, hands loose and empty');
    assert.equal(bullet.enabled, false);
});

test('toggleBulletInText re-enables a disabled bullet, recovering the original line exactly', () => {
    const result = toggleBulletInText(SAMPLE, 'Outfit',
        'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', true);
    assert.equal(result.ok, true);
    assert.match(result.text, /^- a graffiti-tagged cropped t-shirt and cut-off shorts \|\| civ$/m);
    assert.doesNotMatch(result.text, /<!--.*graffiti/);
});

test('toggleBulletInText preserves an xN weight prefix across a disable/enable round trip', () => {
    const disabled = toggleBulletInText(SAMPLE, 'Outfit', 'nondescript grey work coveralls', false);
    assert.equal(disabled.ok, true);
    assert.match(disabled.text, /<!-- - x4 nondescript grey work coveralls -->/);
    const reEnabled = toggleBulletInText(disabled.text, 'Outfit', 'nondescript grey work coveralls', true);
    assert.equal(reEnabled.ok, true);
    assert.match(reEnabled.text, /^- x4 nondescript grey work coveralls$/m);
});

test('toggleBulletInText is a no-op when the bullet is already in the requested state', () => {
    const result = toggleBulletInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', true);
    assert.equal(result.ok, true);
    assert.equal(result.text, SAMPLE);
});

test('toggleBulletInText returns ok:false for a bullet that does not exist under that heading', () => {
    const result = toggleBulletInText(SAMPLE, 'Outfit', 'a suit of powered armor', false);
    assert.equal(result.ok, false);
    assert.match(result.error, /no bullet matching/);
});

test('toggleBulletInText does not match a bullet that exists only under a different heading', () => {
    const result = toggleBulletInText(SAMPLE, 'Outfit', 'nothing at all, hands loose and empty', false);
    assert.equal(result.ok, false);
});

test('toggleBulletInText toggles the first line, in file order, when text is duplicated under one heading', () => {
    const dupe = ['## Callsigns', '- Ghost', '- Ghost'].join('\n');
    const result = toggleBulletInText(dupe, 'Callsigns', 'Ghost', false);
    assert.equal(result.ok, true);
    const lines = result.text.split('\n');
    assert.equal(lines[1], '<!-- - Ghost -->');
    assert.equal(lines[2], '- Ghost');
});

test('setBulletWeightInText changes an enabled bullet from weight 1 to a multiplier prefix', () => {
    const result = setBulletWeightInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', 3);
    assert.equal(result.ok, true);
    assert.match(result.text, /^- x3 nothing at all, hands loose and empty$/m);
    const reparsed = parseTableFile(result.text);
    const bullet = reparsed.find((t) => t.name === 'Gear').bullets.find((b) => b.text === 'nothing at all, hands loose and empty');
    assert.equal(bullet.weight, 3);
});

test('setBulletWeightInText changes a weighted bullet back down to weight 1, dropping the xN prefix', () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit', 'nondescript grey work coveralls', 1);
    assert.equal(result.ok, true);
    assert.match(result.text, /^- nondescript grey work coveralls$/m);
});

test("setBulletWeightInText preserves a disabled bullet's comment wrapper while changing its weight", () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit',
        'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', 2);
    assert.equal(result.ok, true);
    assert.match(result.text, /<!-- - x2 a graffiti-tagged cropped t-shirt and cut-off shorts \|\| civ -->/);
    const reparsed = parseTableFile(result.text);
    const bullet = reparsed.find((t) => t.name === 'Outfit')
        .bullets.find((b) => b.text === 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ');
    assert.equal(bullet.enabled, false);
    assert.equal(bullet.weight, 2);
});

test('setBulletWeightInText is a no-op when the bullet is already at that weight', () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit', 'nondescript grey work coveralls', 4);
    assert.equal(result.ok, true);
    assert.equal(result.text, SAMPLE);
});

test('setBulletWeightInText returns ok:false for a bullet that does not exist under that heading', () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit', 'a suit of powered armor', 2);
    assert.equal(result.ok, false);
    assert.match(result.error, /no bullet matching/);
});

test('setBulletWeightInText rejects a weight that is not a positive integer', () => {
    for (const badWeight of [-2, 1.5, 0]) {
        const result = setBulletWeightInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', badWeight);
        assert.equal(result.ok, false);
    }
});
