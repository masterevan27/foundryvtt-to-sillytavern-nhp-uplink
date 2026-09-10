import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildEnvelope } from '../foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/envelope.mjs';
test('real Foundry chat hook and absorbed flow retain the native message reference without changing actors', () => {
    const actor = Object.freeze({ id: 'actor-1', name: 'Test Pilot', type: 'mech' });
    const context = vm.createContext({ buildEnvelope, console, foundry: { abstract: { Document: class {} } }, Roll: class {}, Hooks: { once() {} },
        setTimeout() { return 1; }, clearTimeout() {},
        game: { user: { isGM: true, id: 'gm' }, actors: new Map([['actor-1', actor]]),
            settings: { get(_module, key) { return ['enabled', 'sendChatCards', 'sendFlows'].includes(key); }, settings: new Map() } } });
    const file = new URL('../foundry-module/foundryvtt-to-sillytavern-nhp-uplink/scripts/uplink.js', import.meta.url);
    vm.runInContext(readFileSync(file, 'utf8').replace(/^import .*;\r?\n/m, ''), context);
    vm.runInContext(`onChatMessage({ id: 'message-1', content: '', speaker: { actor: 'actor-1' }, rolls: [{total: 14}] });`, context);
    assert.equal(vm.runInContext('queue[0].nativeMessageId', context), 'message-1');
    assert.equal(vm.runInContext('queue[0].nativeActorId', context), 'actor-1');
    vm.runInContext(`onFlow('WeaponAttackFlow', {state:{actor: game.actors.get('actor-1'), data:{}}}, true);`, context);
    assert.equal(vm.runInContext('queue.length', context), 1);
    assert.equal(vm.runInContext('queue[0].nativeMessageId', context), 'message-1');
    assert.equal(vm.runInContext('queue[0].rollTotals[0]', context), 14);
    assert.equal(actor.name, 'Test Pilot');
});
