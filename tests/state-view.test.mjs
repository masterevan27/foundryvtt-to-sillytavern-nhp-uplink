import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
async function make() {
    const path = new URL('../st-ui-extension/sillytavern-foundryvtt-input/state-view.mjs', import.meta.url);
    assert.ok(existsSync(path), 'state view implementation missing');
    return (await import(path)).createStateView();
}
const payload = () => ({ state: { scene: 'Dock', combatants: [{ hp: { value: 10 } }] }, stateMeta: {
    status: 'recent', reason: 'recent_observation_not_live_query', worldId: 'test', worldTitle: 'Disposable',
    source: 'foundry', snapshotAt: 100000, receivedAt: 100100, ageMs: 100, staleAfterMs: 60000 } });
const render = state => JSON.stringify(state);
test('UI snapshot ages without new events using elapsed local time, never labels live', async () => {
    const view = await make(); view.accept(payload(), 5000);
    assert.match(view.format(render, false, 5000), /BOARD STATE RECENT/);
    assert.match(view.format(render, false, 65001), /BOARD STATE STALE/);
    assert.doesNotMatch(view.format(render, false, 5000), /LIVE BOARD/);
});
test('disconnect and failed refresh retain only labeled historical state', async () => {
    const view = await make(); const input = payload(); const before = structuredClone(input);
    view.accept(input, 5000); view.disconnect();
    assert.match(view.format(render, false, 5001), /BOARD STATE STALE/);
    assert.deepEqual(input, before);
    view.accept(input, 5000);
    assert.equal((await view.refresh(async () => { throw Error('offline'); }, 5001)).ok, false);
    assert.match(view.format(render, false, 5002), /BOARD STATE STALE/);
});
test('empty refresh clears old snapshot and legacy metadata remains unknown', async () => {
    const view = await make(); view.accept(payload(), 5000);
    await view.refresh(async () => ({ ok: true, json: async () => ({ state: null }) }), 5001);
    assert.equal(view.current().state, null);
    assert.match(view.format(render, true, 5002), /BOARD STATE MISSING/);
    view.accept({ state: { scene: 'legacy' } }, 5003);
    assert.match(view.format(render, false, 5004), /BOARD STATE UNKNOWN/);
});
test('conflict stays explicit on manual and recurring state rendering', async () => {
    const view = await make(); const input = payload(); input.stateMeta.status = 'conflict'; input.stateMeta.reason = 'world_conflict';
    view.accept(input, 5000);
    for (const full of [true, false]) assert.match(view.format(render, full, 5001), /CONFLICT[\s\S]*world_conflict/);
});
