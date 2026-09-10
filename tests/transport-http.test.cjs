const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const pluginModule = require('../st-server-plugin/sillytavern-foundryvtt-input-server-plugin/index.js');

// Real route handlers and real HTTP/SSE, with a minimal native adapter for Express's response helpers.
async function harness(t) {
    assert.equal(typeof pluginModule.createPlugin, 'function', 'isolatable lifecycle missing');
    const routes = new Map();
    const router = { use() {}, get(path, fn) { routes.set('GET ' + path, fn); }, post(path, fn) { routes.set('POST ' + path, fn); } };
    const plugin = pluginModule.createPlugin({ port: 0, host: '127.0.0.1', secret: '', staleAfterMs: 60000 });
    await plugin.init(router);
    const ui = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        req.query = Object.fromEntries(url.searchParams); req.body = {};
        if (req.method === 'POST') { const parts = []; for await (const chunk of req) parts.push(chunk); req.body = JSON.parse(Buffer.concat(parts).toString() || '{}'); }
        res.set = (key, val) => res.setHeader(key, val);
        res.status = code => { res.statusCode = code; return res; };
        res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        const fn = routes.get(req.method + ' ' + url.pathname);
        if (fn) fn(req, res); else { res.statusCode = 404; res.end(); }
    });
    await new Promise(resolve => ui.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await plugin.exit(); ui.closeAllConnections(); await new Promise(resolve => ui.close(resolve)); });
    return { inbound: `http://127.0.0.1:${plugin.address().port}`, ui: `http://127.0.0.1:${ui.address().port}` };
}
test('true HTTP ingestion retains sender provenance and overrides spoofed receiver fields through SSE and polling', async t => {
    const h = await harness(t); const now = Date.now();
    const stream = await fetch(h.ui + '/stream'); const reader = stream.body.getReader();
    const hello = new TextDecoder().decode((await reader.read()).value);
    assert.match(hello, /"status":"missing"/);
    const sent = { source: 'foundry', worldId: 'disposable', world: 'Disposable', snapshotAt: now,
        snapshotId: 'snap-1', sentAt: now, state: { combatants: [] },
        events: [{ id: 'event-1', ts: now - 1, type: 'chat_card', rollTotals: [14], seq: 999, receivedAt: 1,
            provenance: { worldId: 'spoofed', receivedAt: 1 } }] };
    const response = await fetch(h.inbound + '/event', { method: 'POST', body: JSON.stringify(sent) });
    assert.equal(response.status, 200);
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, /"worldId":"disposable"/);
    assert.match(frame, /"snapshotId":"snap-1"/);
    const poll = await (await fetch(h.ui + '/inbound')).json();
    assert.equal(poll.items[0].seq, 1);
    assert.ok(poll.items[0].receivedAt >= now);
    assert.equal(poll.items[0].id, 'event-1'); assert.equal(poll.items[0].ts, now - 1);
    assert.equal(poll.items[0].provenance.worldId, 'disposable');
    assert.equal(poll.stateMeta.status, 'recent');
    assert.deepEqual(poll.state, sent.state);
    await reader.cancel();
});
test('legacy HTTP snapshot stays unknown and clear resets state/world binding', async t => {
    const h = await harness(t);
    await fetch(h.inbound + '/event', { method: 'POST', body: JSON.stringify({ state: { scene: 'old' } }) });
    assert.equal((await (await fetch(h.ui + '/state')).json()).stateMeta.status, 'unknown');
    await fetch(h.ui + '/clear', { method: 'POST', body: '{}' });
    const cleared = await (await fetch(h.ui + '/state')).json();
    assert.equal(cleared.state, null); assert.equal(cleared.stateMeta.status, 'missing');
});
