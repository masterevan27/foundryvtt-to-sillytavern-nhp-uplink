const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const TABLES_FIXTURE = [
    '## Outfit',
    '- a heavy work jacket over a stained undersuit || civ',
    '- nondescript grey work coveralls',
    '',
    '## Gear',
    '- nothing at all, hands loose and empty',
    '- a sidearm holstered high on a chest rig || mil',
    '',
].join('\n');

test('GET /api/table-bullets returns every table with its bullets', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets`);
    assert.equal(res.status, 200);
    const { tables } = await res.json();
    assert.equal(tables.length, 2);
    assert.equal(tables[0].name, 'Outfit');
    assert.equal(tables[0].bullets.length, 2);
    assert.ok(tables[0].bullets.every((b) => b.enabled));
});

test('POST /api/table-bullets/toggle disables a bullet, reflected on the next GET', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const toggleRes = await fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Gear', text: 'nothing at all, hands loose and empty', enabled: false }),
    });
    assert.equal(toggleRes.status, 200);

    const res = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await res.json();
    const gear = tables.find((t) => t.name === 'Gear');
    const bullet = gear.bullets.find((b) => b.text === 'nothing at all, hands loose and empty');
    assert.equal(bullet.enabled, false);
});

test('POST /api/table-bullets/toggle returns 400 for a bullet that does not exist', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Gear', text: 'not a real bullet', enabled: false }),
    });
    assert.equal(res.status, 400);
});

test('POST /api/table-bullets/toggle returns 400 when the body is missing required fields', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Gear' }),
    });
    assert.equal(res.status, 400);
});
