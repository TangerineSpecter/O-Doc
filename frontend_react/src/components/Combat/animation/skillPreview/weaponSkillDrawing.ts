import {clampEffect as clamp,ellipse,polygon,star} from '../pixelEffectDrawing';
import type {EffectContext} from '../pixelEffectDrawing';
import type {PlayerSkillAnchors} from '../playerRouteEffects';
import type {AtlasSkillProfile} from './atlasSkillProfiles';
import {arrow,crystal,path,runeRing,slash,sparks} from './skillDrawingPrimitives';

/** Physical skills use a weapon arc, arrow path or visible dash instead of a generic bolt. */
export function drawWeaponSkill(ground:EffectContext,rear:EffectContext,front:EffectContext,
    skill:AtlasSkillProfile,time:number,a:PlayerSkillAnchors) {
    const {shape,color,light}=skill,hit=time-skill.impact,p=clamp(hit/.65),fade=1-clamp((hit-.5)/.6);
    const target=a.targetX;
    if(shape==='evade') {
        const progress=clamp((time-skill.release)/.55),alpha=1-clamp((time-1.1)/.5);
        for(let i=0;i<3;i++) {
            const x=a.sourceX-30-i*22-progress*50;
            path(rear,[x-8,-182,x+25,-148,x+17,-38,x-6,-6],color,10,alpha*(.35-i*.08));
            path(front,[x-60,-95,x-8,-95,x+20,-101],light,3,alpha*.7);
        }
        runeRing(ground,a.sourceX,4,65,time,color,alpha*.6);return;
    }
    if(['aim','chargedarrow','pierce'].includes(shape)) {
        if(time<skill.release) {
            const charge=clamp(time/skill.release);
            ellipse(front,a.emitterX,a.emitterY,14+charge*10,14+charge*10,color,.8,3);
            for(let i=0;i<3;i++)path(front,[a.emitterX-20-i*10,a.emitterY-15+i*15,a.emitterX-2,a.emitterY],light,2,charge*.8);
        } else if(hit<0) {
            const travel=clamp((time-skill.release)/(skill.impact-skill.release));
            const end=shape==='pierce'?target+80:target,x=a.emitterX+(end-a.emitterX)*travel,y=a.emitterY+(-70-a.emitterY)*travel;
            arrow(front,x,y,shape==='aim'?47:shape==='pierce'?140:90,color,light);
            if(shape!=='aim')for(let i=0;i<2;i++)path(front,[x-65-i*15,y-12+i*24,x-25,y-12+i*24],color,3,.65);
        } else if(hit<.8) {
            if(shape==='pierce') {arrow(front,target+70+hit*220,-70,160,color,light,fade);path(front,[target-130,-70,target+170,-70],light,6,fade*.8);}
            else {path(front,[target-20,-94,target+8,-70,target+27,-87],light,7,fade);sparks(front,target,-70,p,light,shape==='aim'?6:10,90);}
            ellipse(ground,target,4,25+p*55,6+p*10,color,fade*.6,3);
        }
        return;
    }
    if(hit<-.2)return;
    if(hit>1.2)return;
    const phase=clamp((hit+.2)/.45);
    if(shape==='bash') {
        const x=target-30+p*40;
        polygon(front,[x-38,-137,x+30,-137,x+34,-80,x,-37,x-39,-80],color,fade*.8);
        path(front,[x-30,-127,x+22,-127,x+26,-82,x,-48,x-31,-82,x-30,-127],light,4,fade);
        for(let i=0;i<3;i++)path(rear,[x-110,-110+i*23,x-60,-110+i*23],color,5,fade);
        sparks(front,target,-70,p,light);return;
    }
    const radius=shape==='strike'?65:shape==='rage'?132:skill.tier===3?111:88;
    if(shape==='combo'||shape==='shadow') {
        const count=shape==='combo'?3:4;
        for(let i=0;i<count;i++) {
            const age=hit+.14-i*.16;
            if(age>=0&&age<.48)slash(front,target+i%2*8,-80,78+skill.tier*10,clamp(age/.4),color,light,i%2===1,1-age/.48);
        }
        if(shape==='shadow')for(let i=0;i<3;i++) {
            const x=target-65+i*52;
            path(rear,[x-10,-176,x+28,-153,x+22,-42,x-12,-10],color,12,fade*.24);
        }
    } else if(shape==='runeblade') {
        slash(front,target,-82,radius,phase,color,light,false,fade);
        slash(rear,target,-82,radius*.78,phase,'#82cee2','#defcff',true,fade*.85);
        runeRing(ground,target,2,100*phase,time,color,fade*.9);
    } else if(shape==='backstab') {
        polygon(front,[target-90,-111,target+86,-71,target-95,-67,target-13,-82],color,fade);
        path(front,[target-77,-91,target+86,-71],light,5,fade);sparks(front,target,-75,p,light);
    } else if(shape==='break') {
        slash(front,target,-80,radius,phase,color,light,false,fade);
        for(const side of [-1,1]) {
            const x=target+side*p*95;
            polygon(front,[x,-115+p*35,x+side*22,-98+p*35,x+side*16,-56+p*50,x-side*5,-46+p*50], '#8f9fa7',fade);
            path(front,[x,-110+p*35,x+side*12,-85+p*35,x,-52+p*50],light,3,fade);
        }
    } else if(shape==='rage') {
        slash(front,target,-85,radius,phase,color,light,false,fade);
        path(front,[target-50,-193,target-15,-112,target-24,-80,target+32,-3],light,10,fade);
        ellipse(ground,target,4,35+p*110,8+p*22,color,fade,6);
        for(let i=0;i<6;i++)crystal(front,target+Math.sin(i*2.7)*p*105,12-p*70+p*p*60,12,14,'#9e8878','#d4b494',fade);
    } else if(shape==='poison') {
        slash(front,target,-80,radius,phase,'#9d80bd',light,true,fade);
        for(let i=0;i<5;i++) {
            const x=target+Math.sin(i*2.6)*45,y=-30-((hit+i*.19)%1)*65;
            ellipse(rear,x,y,15,17,color,fade*.35);star(front,x,y,4,light,fade*.8);
        }
        runeRing(ground,target,3,70,time,color,fade);
    } else slash(front,target,-85,radius,phase,color,light,false,fade);
    if(hit>=0&&hit<.65)sparks(front,target,-75,p,light,skill.tier===3?12:6);
}
