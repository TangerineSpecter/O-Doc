import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {combatAnalyticsMock} from './combatAnalytics';
import {residents,day} from './residents';
import {resolveLocalRoute} from './routes';
import type {ResidentAnalytics} from '../../types/api/residentAnalytics';
import type {CombatCatalog} from '../../types/api/combat';

test('local combat catalog exposes all released elemental dungeons and an actual empty state',async()=>{
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=populated'),configurable:true});
    const request = () => new Request('http://localhost/api/settings/agent-world/combat/catalog/');
    const data = await resolveLocalRoute(request()) as CombatCatalog;
    const manifest = JSON.parse(readFileSync(new URL('../../../../system_settings/agent_world/combat/data/manifest.json', import.meta.url), 'utf8')) as {version: string};
    assert.equal(data.version,manifest.version);
    assert.deepEqual(data.tables.dungeons.filter(row=>row.id.startsWith('dungeon.element.')).map(row=>row.name),
        ['潮汐浅湾','琥岩地窟','浮岚高地','熔羽火山']);
    assert.equal(data.tables.monsters.filter(row=>row.id.startsWith('monster.element.')).length,16);
    assert.equal(data.tables.equipmentTemplates.find(row=>row.id==='equip.mage_staff.element.water')?.elementPower,'.05');
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=empty'),configurable:true});
    const empty = await resolveLocalRoute(request()) as CombatCatalog;
    assert.ok(Object.values(empty.tables).every(rows=>rows.length===0));
    assert.deepEqual(empty.monsterPreviews,[]);
});

test('shared kills appear for both members while world kills are distinct and details reconcile',()=>{
    const all=combatAnalyticsMock(new URL('http://localhost/'),false);
    assert.equal(all.wins,3);assert.equal(all.explorations,2);
    assert.deepEqual(all.combatComparison.slice(0,2).map(row=>row.kills),[3,2]);
    for(const row of all.combatComparison)assert.equal(row.monsters.reduce((sum,m)=>sum+m.kills,0),row.kills);
    const member=combatAnalyticsMock(new URL(`http://localhost/?actor_id=${residents[1].id}`),false);
    assert.equal(member.combatComparison.length,1);assert.equal(member.wins,2);
    assert.equal(member.combatComparison[0].bossKills,1);assert.equal(member.combatComparison[0].successRate,100);
    assert.equal(member.combatComparison[0].experience,35);assert.equal(member.combatComparison[0].potions,3);
    assert.equal(member.combatComparison[0].jobName,'牧师');assert.equal(member.combatComparison[0].jobLevel,12);
});

test('empty and dates without departures have no fabricated success rates or monster details',()=>{
    assert.deepEqual(combatAnalyticsMock(new URL('http://localhost/'),true),{combatComparison:[],explorations:0,wins:0});
    const old=combatAnalyticsMock(new URL('http://localhost/?start_date=2000-01-01&end_date=2000-01-02'),false);
    assert.equal(old.wins,0);assert.equal(old.explorations,0);
    assert.ok(old.combatComparison.every(row=>row.successRate===null&&row.monsters.length===0&&row.experience===0));
});

test('the actual analytics route returns matching selected resident totals and linked detail',async()=>{
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=populated'),configurable:true});
    const data=await resolveLocalRoute(new Request(`http://localhost/api/settings/agent-world/analytics/?actor_id=${residents[1].id}&start_date=${day}&end_date=${day}`)) as ResidentAnalytics;
    assert.equal(data.combatComparison.length,1);assert.equal(data.combatComparison[0].id,residents[1].id);
    assert.equal(data.outcomes.wins,2);assert.equal(data.combatComparison[0].unclassifiedKills,0);
});
