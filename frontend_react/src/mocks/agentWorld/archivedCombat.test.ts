import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveLocalRoute} from './routes';
import type {CombatSnapshot} from '../../types/api/combat';

test('local archived exploration exposes personal kills, experience and drops without replay', async () => {
    Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=archived'), configurable: true});
    const snapshot = await resolveLocalRoute(new Request(
        'http://localhost/api/settings/agent-world/combat/explorations/local-exploration/')) as CombatSnapshot;
    assert.equal(snapshot.historyArchived, true);
    assert.equal(snapshot.events.length, 0);
    assert.equal(snapshot.archivedKills?.length, snapshot.result.kills);
    assert.equal(snapshot.archivedKills?.[0].monster.name, '软泥怪');
    assert.equal(snapshot.archivedKills?.[0].experience, snapshot.result.experience);
    assert.ok(snapshot.archivedKills?.[0].rewards.length);
});
