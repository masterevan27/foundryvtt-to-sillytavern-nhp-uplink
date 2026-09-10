import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const policy = { staleAfterMs: 60000, maxClockSkewMs: 5000 };
const envelope = (at = 100000) => ({ source: 'foundry', worldId: 'test-world', world: 'Disposable World',
    sentAt: at + 20, snapshotAt: at, snapshotId: `snapshot-${at}`,
    events: [{ id: 'e1', ts: at, type: 'chat_card', rollTotals: [14] }],
    state: { scene: 'Dock', combatants: [{ id: 'a1', hp: { value: 10 } }] } });
function lib() {
    assert.ok(existsSync(new URL('../st-server-plugin/sillytavern-foundryvtt-input-server-plugin/provenance.cjs', import.meta.url)), 'provenance implementation missing');
    return require('../st-server-plugin/sillytavern-foundryvtt-input-server-plugin/provenance.cjs');
}
test('source world and snapshot times survive, with receiver-owned metadata', () => {
    const p = envelope(); p.stateMeta = { receivedAt: 1, status: 'recent' };
    const stored = lib().observeSnapshot(null, p, 100100, policy);
    assert.equal(stored.stateMeta.worldId, 'test-world');
    assert.equal(stored.stateMeta.worldTitle, 'Disposable World');
    assert.equal(stored.stateMeta.snapshotAt, 100000);
    assert.equal(stored.stateMeta.receivedAt, 100100);
    assert.equal(lib().evaluateState(stored, 100100).stateMeta.status, 'recent');
});
test('legacy snapshot and missing state are unknown or missing, never recent', () => {
    const stored = lib().observeSnapshot(null, { state: { scene: 'old' } }, 100100, policy);
    assert.equal(lib().evaluateState(stored, 100100).stateMeta.status, 'unknown');
    assert.equal(lib().evaluateState(null, 100100).stateMeta.status, 'missing');
});
test('age changes without arrivals; excessive clock skew is unknown', () => {
    const p = lib();
    const stored = p.observeSnapshot(null, envelope(), 100100, policy);
    assert.equal(p.evaluateState(stored, 160001).stateMeta.status, 'stale');
    assert.equal(p.evaluateState(p.observeSnapshot(null, envelope(120000), 100100, policy), 100100).stateMeta.status, 'unknown');
});
test('conflicts retain original snapshot without mixing worlds or actor state', () => {
    const p = lib(); const original = p.observeSnapshot(null, envelope(), 100100, policy);
    const foreign = envelope(100200); foreign.worldId = 'other-world';
    const reordered = envelope(99000);
    const changed = envelope(); changed.state.combatants[0].hp.value = 0;
    for (const incoming of [foreign, reordered, changed]) {
        const result = p.observeSnapshot(original, incoming, 100300, policy);
        assert.deepEqual(result.state, original.state);
        assert.equal(p.evaluateState(result, 100300).stateMeta.status, 'conflict');
        assert.equal(result.stateMeta.worldId, 'test-world');
    }
    assert.equal(original.state.combatants[0].hp.value, 10);
});
test('duplicate snapshots do not refresh capture age and missing envelope does not refresh state', () => {
    const p = lib(); const original = p.observeSnapshot(null, envelope(), 100100, policy);
    const again = p.observeSnapshot(original, envelope(), 170000, policy);
    assert.equal(p.evaluateState(again, 170000).stateMeta.status, 'stale');
    assert.equal(again.stateMeta.receivedAt, 100100);
    assert.deepEqual(p.observeSnapshot(original, { events: [] }, 170000, policy), original);
});
