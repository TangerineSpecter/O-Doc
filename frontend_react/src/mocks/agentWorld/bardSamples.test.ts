import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveLocalRoute} from './routes';
import {bardJobs} from './bardSamples';
import {resolveLoadoutHeroArchetype} from '../../components/Combat/loadoutPresentation';
import {musicActionText} from '../../components/Combat/musicPresentation';
import type {CombatProfile,CombatSnapshot} from '../../types/api/combat';
const root='http://localhost/api/settings/agent-world/combat';
Object.defineProperty(globalThis,'location',{value:{search:''},configurable:true});
test('seven local profession profiles expose actual inherited skills and instruments',async()=>{
    for(const job of bardJobs){
        const p=await resolveLocalRoute(new Request(`${root}/agents/local-bard-${job}/`)) as CombatProfile;
        assert.equal(p.progression.job,`job.${job}`);
        assert.equal(resolveLoadoutHeroArchetype(p.progression.job),'bard');
        assert.ok(p.skills.some(s=>s.id==='skill.player.080'));
        assert.equal(p.equipment.find(e=>e.snapshot.slot==='weapon')?.snapshot.equipmentType,'instrument');
        assert.equal(p.activeExplorationId,'local-bard-exploration');
    }
});
test('local shared snapshots carry music resources and readable confirmed actions',async()=>{
    const snapshot=await resolveLocalRoute(new Request(`${root}/explorations/local-bard-exploration/`)) as CombatSnapshot;
    assert.equal(snapshot.party?.players.length,4);
    assert.equal(snapshot.party?.players.find(p=>p.jobId==='job.virtuoso')?.bard?.beats,2);
    assert.equal(snapshot.party?.enemies[0].states[0].value,3);
    const texts=snapshot.party!.events.flatMap(e=>e.payload.events||[]).map(musicActionText).filter(Boolean);
    assert.ok(texts.includes('节拍 2/3'));assert.ok(texts.includes('共振 3/3'));assert.ok(texts.includes('暴击 +3%'));
    const history=await resolveLocalRoute(new Request(`${root}/parties/local-bard-party/events/?before=1`));
    assert.deepEqual(history,{events:[],hasMore:false});
});
test('empty scenario removes learned skills and worn gear from profiles',async()=>{
    Object.defineProperty(globalThis,'location',{value:{search:'?mockState=empty'},configurable:true});
    const p=await resolveLocalRoute(new Request(`${root}/agents/local-bard-virtuoso/`)) as CombatProfile;
    assert.deepEqual(p.skills,[]);assert.deepEqual(p.equipment,[]);assert.deepEqual(p.loadout,{});
    Object.defineProperty(globalThis,'location',{value:{search:''},configurable:true});
});
