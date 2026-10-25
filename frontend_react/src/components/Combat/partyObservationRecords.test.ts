import assert from 'node:assert/strict';
import test from 'node:test';
import {mergePartyHistory, partyObservationRecords} from './partyObservationRecords.ts';
import type {AdventurePartySnapshot, CombatEvent} from '../../types/api/combat.ts';

const shared: AdventurePartySnapshot['events'] = [
    {id:'party:1',sequence:1,kind:'round',payload:{round:1,events:[{kind:'heal',healing:30}]}},
    {id:'party:2',sequence:2,kind:'round',payload:{round:2,events:[{kind:'damage',damage:84},{kind:'loot_roll',rolls:[]}]}},
];
const personal: CombatEvent[] = [
    {id:'start',sequence:1,kind:'depart',elapsedSeconds:0,payload:{},createdAt:''},
    {id:'receipt',sequence:2,kind:'round',elapsedSeconds:15,payload:{sharedEventId:'party:2',events:[{kind:'kill',experience:122}]},createdAt:''},
    {id:'end',sequence:3,kind:'terminal',elapsedSeconds:15,payload:{report:'探索结算'},createdAt:''},
];
test('shared combat joins its personal receipt without losing awards or settlement', () => {
    const rows = partyObservationRecords(personal, shared);
    assert.deepEqual(rows.map(e=>e.id), ['start','party:party:1','receipt','end']);
    assert.deepEqual(rows[2].payload.events?.map(a=>a.kind), ['damage','loot_roll','kill']);
    assert.equal(rows[2].elapsedSeconds,15);
    assert.equal(rows[2].payload.events?.[2].experience,122);
    assert.equal(rows[1].timelineLabel,'队伍历史 · 第1回合');
    assert.equal(rows[3].payload.report,'探索结算');
});
test('overlapping polling and history pages deduplicate and retain older actions', () => {
    const merged = mergePartyHistory(shared, [shared[1],{id:'party:3',sequence:3,kind:'round',payload:{events:[{kind:'revive',healing:20}]}}]);
    assert.deepEqual(merged.map(e=>e.sequence), [1,2,3]);
    assert.equal(partyObservationRecords(personal,merged).flatMap(e=>e.payload.events||[]).filter(a=>a.kind==='damage').length,1);
});
test('solo events survive unchanged; shared-only history still renders', () => {
    assert.deepEqual(partyObservationRecords(personal,[]),personal);
    assert.equal(partyObservationRecords([],shared).length,2);
    assert.equal(partyObservationRecords([],shared)[1].timelineLabel,'队伍历史 · 第2回合');
});

test('local party sample links shared actions and personal kills to the same timestamp', async () => {
    const {localPartyExploration, localOlderPartyEvents} = await import('../../mocks/agentWorld/adventure.ts');
    const rows = partyObservationRecords(localPartyExploration.events,
        mergePartyHistory(localOlderPartyEvents, localPartyExploration.party!.events));
    const current = rows.find(row => row.id === 'local-party-personal')!;
    assert.deepEqual(current.payload.events?.map(action => action.kind), ['revive','damage','loot_roll','kill']);
    assert.equal(current.elapsedSeconds,240);
    assert.equal(current.timelineLabel,undefined);
    assert.equal(rows.filter(row => row.timelineLabel).length,1);
});
