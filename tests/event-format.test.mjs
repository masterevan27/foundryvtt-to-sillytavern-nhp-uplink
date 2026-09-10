import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEvent, buildDigest } from '../st-ui-extension/sillytavern-foundryvtt-input/format.js';
test('player intent is never rendered as execution or a roll outcome', () => {
    const line = describeEvent({ type: 'action_intent', actor: 'Pilot', text: 'I intend to fire.', rolls: { targets: [{ total: 20, hit: true }] } });
    assert.match(line, /INTENT.*NOT EXECUTED/);
    assert.doesNotMatch(line, /HIT|CRIT|ATTACK ROLL/);
});
test('an unreported attack outcome is not silently called a miss', () => {
    const line = describeEvent({ type: 'flow', flow: 'WeaponAttackFlow', rolls: { targets: [{ total: 9, target: 'Target' }] } });
    assert.match(line, /OUTCOME UNREPORTED/);
    assert.doesNotMatch(line, /=> MISS/);
});
test('digest preserves per-event world, event identity and observed timestamps across sources', () => {
    const events = ['world-a', 'world-b'].map((worldId, n) => ({ type: 'chat_card', id: `event-${n}`, ts: 100000 + n,
        seq: n + 1, receivedAt: 100100, rollTotals: [14], provenance: { source: 'foundry', worldId, worldTitle: worldId, sentAt: 100050 } }));
    const before = structuredClone(events);
    const text = buildDigest(events);
    for (const word of ['world-a', 'world-b', 'event-0', 'event-1', 'received', 'ROLL TOTAL 14']) assert.ok(text.includes(word));
    assert.deepEqual(events, before);
});
