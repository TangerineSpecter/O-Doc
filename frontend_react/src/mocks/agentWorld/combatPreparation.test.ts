import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCombatPreparation} from './combatPreparation';
import {combatCatalog,combatProfiles,localAdventureOptions} from './adventure';
import type {CombatSnapshot} from '../../types/api/combat';
import {localEquipmentPreview} from './combatEquipmentPreview';
import {dungeonElementSummary, preparationWeapons} from '../../components/Combat/preparationElementSummary';

const actor=combatProfiles[0].actorId;
test('preparation explains the selected dungeon and retained weapon',()=>{
    assert.equal(dungeonElementSummary(combatCatalog, 'dungeon.element.tidal_shoal'),
        '魔物普攻：水属性；水抗性 +15.0%～+25.0%，土抗性 -20.0%～-10.0%');
    const weapons=preparationWeapons(combatProfiles[2]);
    assert.equal(weapons.equipped, '训练木剑（无属性）');
    assert.deepEqual(weapons.backups, ['潮汐法杖（本地样例）（水属性，水强化 +5.0%）']);
    assert.equal(dungeonElementSummary(combatCatalog, 'missing-dungeon'), '');
    const withNeutralMonster = {...combatCatalog, tables:{...combatCatalog.tables,
        monsterResists:combatCatalog.tables.monsterResists.filter(row => row.monsterId !== 'monster.element.water.bubble_crab')}};
    assert.match(dungeonElementSummary(withNeutralMonster, 'dungeon.element.tidal_shoal'), /水抗性 0.0%～\+25.0%/);
});
test('local combat profile includes a retained water weapon with fixed power',()=>{
    const item=combatProfiles[2].equipment.find(row=>row.id==='local-backup-water-staff');
    assert.equal(item?.retainedForAdventure,true);
    assert.equal(item?.snapshot.element,'water');
    assert.equal(item?.snapshot.stats.waterPower,.05);
    const preview=localEquipmentPreview(combatProfiles[2], {weapon:item!.id});
    assert.ok(!(preview instanceof Response));
    assert.equal(preview.attributes.waterPower,.05);
    assert.equal(preview.attributes.magicAttack,105);
    assert.equal(preview.attributes.hpMax,490);
    assert.equal(combatProfiles[2].loadout.weapon,'local-equipment-2');
});
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

test('local elemental exploration uses the candidate monster preview stats',()=>{
    let now=0;
    const runtime=createCombatPreparation(()=>now);
    const start=runtime.prepare(combatProfiles[2].actorId,
        {key:'water',constraints:{adventureMode:'solo',dungeonId:'dungeon.element.tidal_shoal'}},false) as CombatSnapshot;
    now=2500;
    const monster=runtime.read(start.id)?.party?.enemies[0];
    const preview=combatCatalog.monsterPreviews.find(row=>row.id===monster?.templateId);
    assert.ok(monster);
    assert.ok(monster.templateId?.startsWith('monster.element.water.'));
    assert.equal(monster.hp,preview?.attributes.hpMax);
    assert.equal(monster.level,preview?.level);
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
