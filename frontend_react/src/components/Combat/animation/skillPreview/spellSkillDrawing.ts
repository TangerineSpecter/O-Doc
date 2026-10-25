import {clampEffect as clamp,ellipse,polygon,star,energyRing} from '../pixelEffectDrawing';
import type {EffectContext} from '../pixelEffectDrawing';
import type {AtlasSkillProfile} from './atlasSkillProfiles';
import type {PlayerSkillAnchors} from '../playerRouteEffects';
import {cross,crystal,orb,path,runeRing,sparks} from './skillDrawingPrimitives';

function tendril(c:EffectContext,x:number,height:number,time:number,color:string,light:string,alpha:number,side=1) {
    const points:number[]=[];
    for(let i=0;i<=14;i++){const p=i/14;points.push(x+Math.sin(p*7+time)*18*side,-p*height);}
    path(c,points,color,8,alpha);path(c,points,light,2,alpha*.8);
    for(let i=2;i<13;i+=3) {
        const px=points[i*2],py=points[i*2+1],s=i%2?-1:1;
        polygon(c,[px,py,px+s*24,py-15,px+s*14,py-26,px-3,py-8],color,alpha);
    }
}
function shield(c:EffectContext,x:number,color:string,light:string,grow:number,alpha:number,holy=false) {
    const points=[x,-225*grow,x+85*grow,-198*grow,x+95*grow,-67*grow,x+50*grow,-6,x-50*grow,-6,x-95*grow,-67*grow,x-85*grow,-198*grow];
    polygon(c,points,color,alpha*.12);path(c,[...points,points[0],points[1]],color,6,alpha);
    path(c,[x,-213*grow,x+75*grow,-188*grow,x+82*grow,-68*grow],light,3,alpha);
    if(holy)cross(c,x,-95,26*grow,light,alpha*.7);
}

/** Spell silhouettes and timing express the actual effect family, separate from job ambience. */
export function drawSpellSkill(ground:EffectContext,rear:EffectContext,front:EffectContext,
    skill:AtlasSkillProfile,time:number,a:PlayerSkillAnchors) {
    const {shape,color,light}=skill;
    const hit=time-skill.impact,age=time-skill.release,grow=clamp(age/.45),fade=1-clamp((time-skill.duration+.65)/.65);
    const x=skill.target==='self'?a.sourceX:a.targetX;
    if(time<skill.release) {
        const p=clamp(time/skill.release);
        star(front,a.emitterX,a.emitterY,5+10*p,light);
        ellipse(front,a.emitterX,a.emitterY,12+9*p,12+9*p,color,.7,2);
    }
    if(time<skill.release)return;
    if(shape==='music') {
        const source=a.sourceX,travel=clamp(age/.5),destination=skill.target==='self'?source:a.targetX;
        for(let i=0;i<3;i++) {
            const nx=source+(destination-source)*travel+(i-1)*18;
            const ny=-95+Math.sin(age*5+i)*22-i*16;
            ellipse(front,nx,ny,7,4,color,fade);
            path(front,[nx+6,ny,nx+6,ny-27,nx+20,ny-32,nx+20,ny-5],light,3,fade);
            ellipse(front,nx+20,ny-5,6,4,color,fade);
        }
        if(skill.target==='self'||hit>=0) {
            const wave=skill.target==='self'?grow:clamp(hit/.5);
            for(let i=0;i<(skill.id==='skill.player.093'?3:2);i++)ellipse(rear,destination,-110,(35+i*20)+wave*70,70+wave*80,color,fade*.55,3);
            runeRing(ground,destination,5,65*grow,time,color,fade*.4);
        }
    } else if(shape==='armor'||shape==='holyshield') {
        shield(front,x,color,light,grow,fade,shape==='holyshield');
        runeRing(ground,x,3,80*grow,time,color,fade);
        if(shape==='armor')for(const side of [-1,1])crystal(rear,x+side*81,-10,19,115*grow,color,light,fade*.75);
        else {
            energyRing(rear,x,-114,106*grow,122*grow,time,color,fade*.7,true);
            for(let i=0;i<6;i++)star(front,x+Math.cos(time+i)*95,-108+Math.sin(time+i)*118,5,light,fade);
        }
    } else if(['heal','prayer','greatheal'].includes(shape)) {
        const large=shape==='greatheal',r=large?114:shape==='prayer'?85:60;
        runeRing(ground,x,4,r*grow,time,color,fade);
        ellipse(rear,x,-105,r,116,color,fade*.12*grow);
        for(let i=0;i<(large?7:4);i++) {
            const p=(age*.55+i*.23)%1,px=x+Math.sin(i*2.6)*r*.62;
            cross(front,px,-22-p*175,large?12:8,light,fade*Math.sin(p*Math.PI));
            path(rear,[px,-12,px,-45-p*150],color,large?10:5,fade*(1-p)*.3);
        }
        if(shape==='prayer') {
            energyRing(rear,x,-103,99*grow,122*grow,time,color,fade*.8,true);
            cross(rear,x,-236,18*grow,light,fade);
        }
        if(large) {
            for(const side of [-1,1])for(let i=0;i<3;i++) {
                polygon(rear,[x+side*40,-142,x+side*(140-i*17),-204+i*18,x+side*(118-i*15),-126+i*18,x+side*50,-96],color,fade*(.65-i*.08)*grow);
            }
            cross(rear,x,-258,27,light,fade*grow);
            ellipse(ground,x,4,r+age*24,26+age*6,color,fade*.6,4);
        }
    } else if(shape==='holybolt'||shape==='judgment') {
        const p=clamp(hit/.7),impact=hit>=0&&hit<.95?fade*(1-clamp((hit-.25)/.7)):0;
        if(shape==='judgment') {
            const y=-300+(1-clamp(-hit/.3))*150;
            if(hit<.45) {
                polygon(front,[x-12,y-70,x+12,y-70,x+12,y+50,x+37,y+50,x+37,y+62,x+12,y+62,x,y+104,x-12,y+62,x-37,y+62,x-37,y+50,x-12,y+50],color,fade);
                path(front,[x,y-68,x,y+95],light,5,fade);
            }
            for(const side of [-1,1]) {
                path(rear,[x+side*56,-262,x+side*56,-12],color,13,impact*.35);
                cross(front,x+side*56,-173,18,light,impact);
            }
            ellipse(ground,x,4,30+p*130,7+p*30,color,impact,5);
            sparks(front,x,-60,p,light,12,140);
        } else {
            path(rear,[x,-250,x,-5],color,29,impact*.6);path(front,[x,-235,x,-25],light,11,impact);
            cross(front,x,-80,26+p*24,light,impact);sparks(front,x,-70,p,color);
        }
    } else if(shape==='freeze') {
        for(let i=0;i<5;i++) {
            const phase=clamp((hit+.15-i*.06)/.4),px=x+(i-2)*28;
            crystal(i%2?rear:front,px,-3,42,(100+((i*3)%5)*27)*phase,color,light,fade*.86);
        }
        ellipse(ground,x,4,90*grow,23*grow,color,fade*.85,4);
        if(hit>0)sparks(front,x,-100,clamp(hit/1.6),light,10,110);
    } else if(shape==='thorns'||shape==='renew'||shape==='forest') {
        const self=shape!=='thorns',height=shape==='forest'?230:shape==='renew'?178:142;
        for(const side of [-1,1])tendril(rear,x+side*(shape==='forest'?105:68),height*grow,age*.7,color,light,fade,side);
        if(shape==='thorns')for(let i=0;i<4;i++) {
            const p=clamp((hit+.05-i*.06)/.5);
            polygon(front,[x-65+i*38,6,x-43+i*38,-93*p,x-35+i*38,-47*p,x-33+i*38,6],color,fade);
        }
        if(shape==='renew') {
            for(let i=0;i<6;i++) {
                const p=(age*.4+i/6)%1;orb(front,x+Math.sin(i*2.1)*70,-10-p*170,5,color,light,fade*(1-p));
            }
            polygon(rear,[x,-260,x+22,-235,x,-211,x-22,-235],light,fade*grow);
            cross(front,x,-95,17,light,fade*.45);
        }
        if(shape==='forest') {
            ellipse(rear,x,-104,125*grow,150*grow,color,fade*.13);
            ellipse(front,x,-104,125*grow,150*grow,light,fade*.07);
            ellipse(front,x,-104,125*grow,150*grow,color,fade*.75,4);
            for(let i=0;i<7;i++)star(front,x+Math.cos(i/7*Math.PI*2+age*.3)*122,-104+Math.sin(i/7*Math.PI*2+age*.3)*146,6,light,fade);
        }
        runeRing(ground,x,4,self?110:84,time,color,fade);
    } else if(shape==='mark') {
        const radius=53+(1-grow)*35;
        ellipse(front,x,-76,radius,radius,color,fade,3);
        for(let i=0;i<4;i++) {
            const angle=i*Math.PI/2,dx=Math.cos(angle),dy=Math.sin(angle);
            path(front,[x+dx*(radius-15),-76+dy*(radius-15),x+dx*(radius+13),-76+dy*(radius+13)],light,5,fade);
        }
        polygon(front,[x-12,-167,x,-183,x+12,-167,x,-149],color,fade);
        if(hit>=0&&hit<.6)sparks(front,x,-76,hit/.6,light,6,60);
    } else if(shape==='weaken'||shape==='decay') {
        const large=shape==='decay',radius=large?85:55,eyeY=large?-200:-155;
        if(large) {
            polygon(rear,[x-radius,eyeY,x,eyeY-27,x+radius,eyeY,x,eyeY+27],color,fade*grow);
            ellipse(rear,x,eyeY,16,21,light,fade*grow);ellipse(rear,x,eyeY,6,15,'#5c4269',fade*grow);
            for(let i=0;i<6;i++) {
                const angle=age*1.4+i/6*Math.PI*2,px=x+Math.cos(angle)*93,py=-81+Math.sin(angle)*85;
                slashPetal(front,px,py,angle,color,fade*.8);
            }
        } else {
            path(front,[x-38,-139,x,-103,x+38,-139,x+17,-65,x-17,-65,x-38,-139],color,6,fade*grow);
            polygon(front,[x,-112,x+12,-90,x,-68,x-12,-90],light,fade*grow);
            path(rear,[x-70,-112,x-52,-84,x-59,-45,x-31,-25],color,5,fade*.65);
        }
        ellipse(rear,x,-70,radius,80,color,fade*.13*grow);runeRing(ground,x,3,radius,age,color,fade);
    } else if(shape==='summon') {
        const launch=clamp((time-skill.release)/.25),travel=clamp((time-skill.release-.25)/(skill.impact-skill.release-.25));
        for(const side of [-1,1]) {
            const px=a.sourceX+side*90+(x-a.sourceX-side*90)*travel,py=-140+Math.sin(travel*Math.PI)*-35;
            polygon(front,[px-25,py+21,px-29,py-6,px-10,py-30,px+9,py-30,px+27,py-7,px+22,py+21,px+9,py+13,px,py+23,px-10,py+13],color,fade*launch);
            ellipse(front,px-9,py-3,4,6,light,fade*launch);ellipse(front,px+9,py-3,4,6,light,fade*launch);
            path(rear,[px-30,py+12,px-70,py+26,px-94,py+15],light,4,fade*.65*launch);
        }
        runeRing(ground,a.sourceX,4,89*grow,age,color,fade);
        if(hit>.4)sparks(front,x,-80,clamp((hit-.4)/.8),light,12,120);
    }
}
function slashPetal(c:EffectContext,x:number,y:number,angle:number,color:string,alpha:number) {
    c.save();c.translate(x,y);c.rotate(angle);
    polygon(c,[-24,0,0,-13,24,0,0,4],color,alpha);c.restore();
}
