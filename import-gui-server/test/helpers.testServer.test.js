const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startTestServer } = require('./helpers/testServer');

test('startTestServer spins up a real server.js against a synthetic config and /health responds', async (t) => {
    const server = await startTestServer({ tablesText: '## Gear\n- nothing at all, hands loose and empty\n', port: 5197 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
});

test('stop() tears the process down and removes the fixture directory', async () => {
    const server = await startTestServer({ tablesText: '## Gear\n- nothing at all\n', port: 5197 });
    const { dir } = server;
    await server.stop();
    assert.equal(fs.existsSync(dir), false);
});
