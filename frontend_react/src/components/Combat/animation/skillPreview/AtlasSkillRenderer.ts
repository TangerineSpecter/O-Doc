import {PixelEffectSurface} from '../PlayerSkillRenderer';
import {drawPlayerGuard} from '../playerGuardVisual';
import {drawPlayerBurn} from '../playerBurnVisual';
import {drawPlayerBurst} from '../playerBurstVisual';
import {drawWeaponSkill} from './weaponSkillDrawing';
import {drawSpellSkill} from './spellSkillDrawing';
import type {AtlasSkillProfile} from './atlasSkillProfiles';
import type {PlayerSkillAnchors} from '../playerRouteEffects';

export class AtlasSkillRenderer {
    readonly ground=new PixelEffectSurface();
    readonly rear=new PixelEffectSurface();
    readonly front=new PixelEffectSurface();
    private frame='';
    draw(skill:AtlasSkillProfile,time:number,anchors:PlayerSkillAnchors) {
        if(skill.shape==='bolt'){this.clear();return;}
        const tick=Math.floor(time*30),key=`${skill.id}:${tick}:${anchors.sourceX}:${anchors.emitterX.toFixed(1)}:${anchors.emitterY.toFixed(1)}`;
        if(key===this.frame)return;this.frame=key;
        const surfaces=[this.ground,this.rear,this.front];surfaces.forEach(surface=>surface.reset());
        const contexts=[this.ground.context,this.rear.context,this.front.context] as const;
        if(skill.shape==='barrier')drawPlayerGuard(...contexts,tick/30,anchors);
        else if(skill.shape==='burn')drawPlayerBurn(...contexts,tick/30,anchors);
        else if(skill.shape==='burst')drawPlayerBurst(...contexts,tick/30,anchors);
        else if(skill.motion!=='cast')drawWeaponSkill(...contexts,skill,tick/30,anchors);
        else drawSpellSkill(...contexts,skill,tick/30,anchors);
        surfaces.forEach(surface=>surface.upload());
    }
    clear(){this.ground.visible=this.rear.visible=this.front.visible=false;this.frame='';}
    dispose(){this.ground.destroy();this.rear.destroy();this.front.destroy();}
}
