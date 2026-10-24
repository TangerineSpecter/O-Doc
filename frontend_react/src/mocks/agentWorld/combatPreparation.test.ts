import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCombatPreparation} from './combatPreparation';
import {combatProfiles,localAdventureOptions} from './adventure';
import type {CombatSnapshot} from '../../types/api/combat';

const actor=combatProfiles[0].actorId;
test('solo request keeps one ID through preparing, single-member battle and recall',()=>{
    let now=0;
    const runtime=createCombatPreparation(()=>now);
    const command={key:'solo',constraints:{adventureMode:'solo',durationSeconds:3600,dungeonId:'dungeon.sprout_meadow'}};
    const start=runtime.prepare(actor,command,false) as CombatSnapshot;
    assert.equal(start.status,'preparing');assert.equal(start.party,null);assert.equal(start.player,null);
    assert.equal(runtime.active(actor),start.id);
    assert.equal((runtime.prepare(actor,command,false) as CombatSnapshot).id,start.id);
    now=2500;
    const active=runtime.read(start.id)!;
    assert.equal(active.id,start.id);assert.equal(active.status,'active');
    assert.equal(active.party?.players.length,1);assert.equal(active.party?.players[0].id,actor);
    assert.equal(active.party?.roundSeconds,15);assert.equal(active.durationSeconds,3600);
    const recalled=runtime.command(start.id,'recall')!;
    assert.equal(recalled.status,'recalled');assert.equal(runtime.active(actor),null);
    now=9000;assert.equal(runtime.read(start.id)?.status,'recalled');
});

test('join remains uncharged while waiting, then joins the selected party with matching roster',()=>{
    let now=0;
    const runtime=createCombatPreparation(()=>now),target=localAdventureOptions.parties[0];
    const command={key:'join',constraints:{partyId:target.id,partyRevision:target.revision,styleId:'style.balanced'}};
    const start=runtime.prepare(actor,command,false) as CombatSnapshot;
    now=1500;
    const waiting=runtime.read(start.id)!;
    assert.equal(waiting.id,start.id);assert.equal(waiting.status,'preparing');
    assert.equal(waiting.stage,'waiting_party');assert.equal(waiting.party,null);
    assert.equal(waiting.result.energy,undefined);
    now=4500;
    const active=runtime.read(start.id)!;
    assert.equal(active.party?.id,target.id);
    assert.deepEqual(active.party?.players.map(player=>player.id),[...target.members.map(member=>member.actorId),actor]);
    assert.equal(active.party?.roundSeconds,5);assert.equal(active.durationSeconds,target.durationSeconds);
    assert.equal(active.result.kills,0);
});

test('empty options cannot join and stale revisions are rejected, but solo still prepares',()=>{
    const runtime=createCombatPreparation(()=>0),target=localAdventureOptions.parties[0];
    for(const [empty,revision] of [[true,target.revision],[false,target.revision+1]] as const) {
        const response=runtime.prepare(actor,{constraints:{partyId:target.id,partyRevision:revision}},empty);
        assert.ok(response instanceof Response);assert.equal(response.status,400);
    }
    const solo=runtime.prepare(actor,{constraints:{adventureMode:'solo'}},true) as CombatSnapshot;
    assert.equal(solo.status,'preparing');assert.equal(solo.party,null);
    assert.equal(runtime.read('unknown'),undefined);
});
