import type {CombatSnapshot} from '../../../../types/api/combat';
import type {BattleAppearanceOverlays} from '../../../../types/api/setting';
import {elementEquipmentArt} from '../../art/elementEquipmentArt';
import {getAtlasSkill} from '../skillPreview/atlasSkillProfiles';
import type {AtlasSkillProfile} from '../skillPreview/atlasSkillProfiles';

export interface ObservationVisual {
    dungeonId:string;jobId:string;weaponId:string;monsterId:string;encounterId:string;
    headImageUrl?:string;
    headBehindBody?:boolean;
    characterImageUrl?:string;
    appearanceOverlays?:BattleAppearanceOverlays;
    skills:AtlasSkillProfile[];fighting:boolean;searching:boolean;hasPlayer:boolean;hasEnemy:boolean;
    kills:number;playerAlive:boolean;
}

/** IDs come from frozen combat state. Never resolve artwork by display names. */
export function observationVisual(snapshot:CombatSnapshot,disconnected:boolean):ObservationVisual {
    const visual=snapshot.visual;
    const skills=Object.entries(snapshot.player?.skills??{})
        .filter(([,rank])=>rank>0).map(([id])=>getAtlasSkill(id))
        .filter((skill):skill is AtlasSkillProfile=>Boolean(skill));
    return {dungeonId:visual?.dungeonId??'',jobId:visual?.jobId??'job.novice',weaponId:visual?.weaponId??'none',
        monsterId:visual?.monsterId??'',encounterId:visual?.encounterId??'',headImageUrl:visual?.headImageUrl,headBehindBody:visual?.headBehindBody,
        characterImageUrl:visual?.characterImageUrl,appearanceOverlays:visual?.appearanceOverlays,skills,
        fighting:!disconnected&&snapshot.status==='active'&&snapshot.stage==='battle'&&Boolean(snapshot.enemy)&&Boolean(snapshot.player&&snapshot.player.hp>0),
        searching:snapshot.status==='active'&&snapshot.stage==='searching',
        hasPlayer:Boolean(snapshot.player),hasEnemy:Boolean(snapshot.enemy),
        kills:snapshot.result.kills??0,playerAlive:Boolean(snapshot.player&&snapshot.player.hp>0)};
}

export function basicObservationAttack(weapon:string):AtlasSkillProfile {
    const base=elementEquipmentArt(weapon).baseId;
    const source=base==='equip.bow'?getAtlasSkill('skill.player.007')
        :base==='equip.staff'||base==='equip.mage_staff'||base==='equip.holy_staff'?getAtlasSkill('skill.player.004')
            :getAtlasSkill('preview.novice.strike');
    return {...source!,id:'observation.basic',name:base==='equip.bow'?'普通射击':'普通攻击',weapon};
}

/** Randomness only chooses illustrative motions, never skills learned or real outcomes. */
export function chooseObservationAttack(visual:ObservationVisual):AtlasSkillProfile {
    if(visual.skills.length&&Math.random()<.55)return visual.skills[Math.floor(Math.random()*visual.skills.length)];
    return basicObservationAttack(visual.weaponId);
}

export const clampObservation=(value:number)=>Math.max(0,Math.min(1,value));
export function observationRecoil(age:number|undefined) {
    if(age===undefined||age<0||age>.45)return 0;
    return Math.sin(Math.PI*clampObservation(age/.45))*10;
}
export function observationSwing(skill:AtlasSkillProfile,time:number) {
    if(skill.motion!=='slash'&&skill.motion!=='dash')return 0;
    const progress=clampObservation((time-skill.release+.16)/.38);
    const recover=1-clampObservation((time-skill.release-.3)/.35);
    return (-.65+progress*1.8)*recover;
}
