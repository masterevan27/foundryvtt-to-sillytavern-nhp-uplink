const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTables, toggleBulletOnDisk, setBulletWeightOnDisk } = require('../lib/tableBullets');

function withTempTablesFile(text, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tablebullets-fs-test-'));
    const file = path.join(dir, 'npc-generator-tables.md');
    fs.writeFileSync(file, text);
    try {
        return fn(file);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('readTables reads a real file off disk', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const tables = readTables(file);
        assert.equal(tables[0].name, 'Gear');
        assert.equal(tables[0].bullets[0].enabled, true);
    });
});

test('toggleBulletOnDisk writes the change back to the file', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const result = toggleBulletOnDisk(file, 'Gear', 'nothing at all, hands loose and empty', false);
        assert.equal(result.ok, true);
        const onDisk = fs.readFileSync(file, 'utf8');
        assert.match(onDisk, /<!-- - nothing at all, hands loose and empty -->/);
    });
});

test('toggleBulletOnDisk leaves the file byte-for-byte untouched when the bullet is not found', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const before = fs.readFileSync(file, 'utf8');
        const result = toggleBulletOnDisk(file, 'Gear', 'not a real bullet', false);
        assert.equal(result.ok, false);
        assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
});

test('setBulletWeightOnDisk writes the new weight back to the file', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const result = setBulletWeightOnDisk(file, 'Gear', 'nothing at all, hands loose and empty', 5);
        assert.equal(result.ok, true);
        const onDisk = fs.readFileSync(file, 'utf8');
        assert.match(onDisk, /^- x5 nothing at all, hands loose and empty$/m);
    });
});

test('setBulletWeightOnDisk leaves the file byte-for-byte untouched when the bullet is not found', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const before = fs.readFileSync(file, 'utf8');
        const result = setBulletWeightOnDisk(file, 'Gear', 'not a real bullet', 2);
        assert.equal(result.ok, false);
        assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
});
