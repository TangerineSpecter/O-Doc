import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {getProfessionAura,professionAuraProfiles} from './professionAuras';
import {materialArtProfiles} from './materialVisuals';
import {drawMaterialArt} from './materialArtDrawing';
import {atlasSkillProfiles,sampleAtlasSkillHit} from '../animation/skillPreview/atlasSkillProfiles';
import {drawWeaponSkill} from '../animation/skillPreview/weaponSkillDrawing';
import {drawSpellSkill} from '../animation/skillPreview/spellSkillDrawing';
import {drawPlayerGuard} from '../animation/playerGuardVisual';
import {drawPlayerBurn} from '../animation/playerBurnVisual';
import {drawPlayerBurst} from '../animation/playerBurstVisual';
import {drawPlayerMagicBolt} from '../animation/playerRouteEffects';
import type {Graphics} from 'pixi.js';
// Referenced CSV columns have no quoted delimiters; use production, not preview data.
function table(name:string) {
    const file=new URL(`../../../../../system_settings/agent_world/combat/data/${name}.csv`,import.meta.url);
    const [header,...rows]=readFileSync(file,'utf8').trim().split(/\r?\n/),keys=header.split(',');
    return rows.map(row=>Object.fromEntries(row.split(',').map((value,index)=>[keys[index],value])));
}
test('all production professions have distinct registered aura silhouettes',()=>{
    const jobs=table('professions').filter(row=>row.enabled==='1'),ids=jobs.map(job=>getProfessionAura(job.id));
    assert.equal(jobs.length,29);assert.ok(!ids.includes('none'));assert.equal(new Set(ids).size,jobs.length);
    assert.equal(new Set(professionAuraProfiles.map(p=>p.shape)).size,jobs.length);
});
test('all production material IDs have portraits',()=>{
    assert.deepEqual(Object.keys(materialArtProfiles).sort(),table('materials').map(row=>row.id).sort());
});
test('active skill coverage follows catalog, while novice demo is not a persistent skill',()=>{
    const skills=table('skills'),active=skills.filter(row=>row.kind==='active'&&row.enabled==='1');
    const demos=atlasSkillProfiles.filter(skill=>skill.id!=='preview.novice.strike');
    assert.deepEqual(demos.map(skill=>skill.id).sort(),active.map(row=>row.id).sort());
    for(const skill of demos)assert.equal(skill.name,active.find(row=>row.id===skill.id)?.name);
    assert.equal(atlasSkillProfiles.length,33);assert.ok(!skills.some(row=>row.id==='preview.novice.strike'));
    for(const job of table('professions').filter(row=>row.id!=='job.novice'))assert.ok(active.some(skill=>skill.profession_id===job.id),job.id);
});
test('self effects never animate damage, attacks only react after impact',()=>{
    for(const skill of atlasSkillProfiles) {
        assert.ok(skill.release>0&&skill.release<skill.duration);
        for(let time=0;time<skill.duration;time+=.037) {
            const hit=sampleAtlasSkillHit(skill,time);
            if(skill.target==='self'||time<skill.impact)assert.equal(hit,undefined,skill.id);
            if(hit!==undefined)assert.ok(Number.isFinite(hit)&&hit>=0&&hit<.45,skill.id);
        }
        if(skill.target==='enemy')assert.ok(skill.impact>=skill.release&&skill.impact<skill.duration);
    }
});
function canvasProbe() {
    let operations=0;
    const probe=new Proxy({}, {get(_target,key){
        if(key==='operations')return operations;
        return (...args:unknown[])=>{
            for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${String(key)} got ${value}`);
            if(['fillRect','rect','stroke','fill','ellipse','polygon'].includes(String(key)))operations++;
            return probe;
        };
    },set(){return true;}});
    return probe as CanvasRenderingContext2D&{operations:number};
}
test('all art draws finite geometry across charge, impact and fade',()=>{
    for(const profile of Object.values(materialArtProfiles)) {
        const c=canvasProbe();drawMaterialArt(c,profile);assert.ok(c.operations>0,profile.shape);
    }
    for(const skill of atlasSkillProfiles) {
        const layers=[canvasProbe(),canvasProbe(),canvasProbe()] as const;
        for(let time=0;time<skill.duration;time+=.05) {
            const a={sourceX:-138,targetX:144,emitterX:-43,emitterY:-154,facing:1 as const};
            if(skill.shape==='bolt')drawPlayerMagicBolt(layers[2] as unknown as Graphics,time,a);
            else if(skill.shape==='barrier')drawPlayerGuard(...layers,time,a);
            else if(skill.shape==='burn')drawPlayerBurn(...layers,time,a);
            else if(skill.shape==='burst')drawPlayerBurst(...layers,time,a);
            else if(skill.motion!=='cast')drawWeaponSkill(...layers,skill,time,a);
            else drawSpellSkill(...layers,skill,time,a);
        }
        assert.ok(layers.some(c=>c.operations>0),skill.name);
    }
});
