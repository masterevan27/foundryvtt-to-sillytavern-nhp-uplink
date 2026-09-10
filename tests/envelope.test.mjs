import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('Foundry envelope binds snapshot time/world while preserving event identity and state', async () => {
    const path = new URL('../foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/envelope.mjs', import.meta.url);
    assert.ok(existsSync(path), 'envelope helper missing');
    const { buildEnvelope } = await import(path);
    const events = [{ id: 'e1', ts: 99000, type: 'chat_card', rollTotals: [14] }];
    const state = { scene: 'Dock', combatants: [] };
    const body = buildEnvelope(events, state, { id: 'test', title: 'Disposable' }, 100000, 100020);
    assert.equal(body.worldId, 'test'); assert.equal(body.world, 'Disposable');
    assert.equal(body.snapshotAt, 100000); assert.equal(body.sentAt, 100020);
    assert.equal(body.snapshotId, 'test:100000');
    assert.deepEqual(body.state, state); assert.deepEqual(body.events, events);
});
