const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const TABLES_FIXTURE = [
    '## Outfit',
    '- a heavy work jacket over a stained undersuit || civ',
    '- a graffiti-tagged cropped t-shirt and cut-off shorts || civ',
    '',
    '## Gear',
    '- nothing at all, hands loose and empty',
    '',
].join('\n');

async function toggle(server, table, text, enabled) {
    return fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, text, enabled }),
    });
}

async function savePreset(server, name) {
    return fetch(`${server.baseUrl}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
}

test('POST /api/presets saves a snapshot of every currently-disabled bullet', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await toggle(server, 'Outfit', 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', false);

    const saveRes = await savePreset(server, 'Grittier Frontier');
    assert.equal(saveRes.status, 200);
    const { slug } = await saveRes.json();
    assert.equal(slug, 'grittier-frontier');

    const listRes = await fetch(`${server.baseUrl}/api/presets`);
    const { presets } = await listRes.json();
    assert.equal(presets.length, 1);
    assert.equal(presets[0].slug, 'grittier-frontier');
    assert.equal(presets[0].count, 1);
});

test('POST /api/presets returns 409 for a duplicate name', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const first = await savePreset(server, 'Same Name');
    assert.equal(first.status, 200);
    const second = await savePreset(server, 'Same Name');
    assert.equal(second.status, 409);
});

test('GET /api/presets/export downloads the raw preset JSON with a Content-Disposition header', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await savePreset(server, 'Export Me');
    const res = await fetch(`${server.baseUrl}/api/presets/export?slug=export-me`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="export-me\.json"/);
    const data = await res.json();
    assert.equal(data.name, 'Export Me');
});

test('GET /api/presets/export returns 404 for an unknown slug', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/presets/export?slug=nope`);
    assert.equal(res.status, 404);
});

test('POST /api/presets/import previews without writing anything to disk', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const preset = {
        name: "Someone Else's Preset",
        created: '2026-01-01T00:00:00.000Z',
        disabled: {
            Outfit: ['a heavy work jacket over a stained undersuit || civ'],
            Headgear: ['a hat that does not exist'],
        },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    assert.equal(res.status, 200);
    const diff = await res.json();
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a heavy work jacket over a stained undersuit || civ' }]);
    assert.deepEqual(diff.notFound, [{ table: 'Headgear', text: 'a hat that does not exist' }]);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const bullet = outfit.bullets.find((b) => b.text === 'a heavy work jacket over a stained undersuit || civ');
    assert.equal(bullet.enabled, true, 'import must not write anything - the bullet should still be enabled');
});

test('POST /api/presets/apply disables only the willDisable bullets and leaves the rest untouched', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const preset = {
        name: 'Apply Me',
        created: '2026-01-01T00:00:00.000Z',
        disabled: { Outfit: ['a heavy work jacket over a stained undersuit || civ'] },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    assert.equal(res.status, 200);
    const diff = await res.json();
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a heavy work jacket over a stained undersuit || civ' }]);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const jacket = outfit.bullets.find((b) => b.text === 'a heavy work jacket over a stained undersuit || civ');
    assert.equal(jacket.enabled, false);
    const tee = outfit.bullets.find((b) => b.text === 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ');
    assert.equal(tee.enabled, true, 'a bullet the preset never mentioned must stay untouched');
});

test('POST /api/presets/delete removes a saved preset', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await savePreset(server, 'Delete Me');
    const del = await fetch(`${server.baseUrl}/api/presets/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'delete-me' }),
    });
    assert.equal(del.status, 200);
    const listRes = await fetch(`${server.baseUrl}/api/presets`);
    const { presets } = await listRes.json();
    assert.equal(presets.length, 0);
});

test('POST /api/presets/delete returns 404 for an unknown slug', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/presets/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'nope' }),
    });
    assert.equal(res.status, 404);
});
