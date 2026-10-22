import {DUMMY_X,getWeapon,GROUND,HERO_X} from './catalog';
import type {BattleSnapshot,HeroPose,Point} from './types';

export const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
export const easeOut=(t:number)=>1-Math.pow(1-clamp(t),3);
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function bezier(a:Point,b:Point,c:Point,d:Point,t:number):Point {
    const u=1-t;return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
}
export function heroPose(s:BattleSnapshot):HeroPose {
    const a=s.action,t=a.age,pose:HeroPose={x:HERO_X,y:GROUND,frame:0,rotation:0,weaponRotation:0,scale:1.5};
    if(a.kind==='idle'){pose.y+=Math.floor(Math.sin(s.time*2.8)*1.2);return pose;}
    if(a.kind==='attack'){
        if(getWeapon(a.weapon).kind==='sword'){
            const forward=t<.6?easeOut((t-.18)/.36):1-easeOut((t-.8)/.55);pose.x+=Math.max(0,forward)*(DUMMY_X-HERO_X-100);
            pose.frame=t<.28?1:t<.78?3:0;pose.weaponRotation=t<.3?-.65:t<.7?1.35:0;pose.rotation=t<.7?.04:0;
        }else{pose.frame=t<.38?1:t<1.02?2:0;pose.weaponRotation=t<.38?-.15:.2;pose.x+=Math.sin(clamp(t/1.4)*Math.PI)*6;}
    }else if(a.profession==='pyromancer'){
        pose.frame=t<.85?1:t<2.6?2:0;pose.y-=Math.sin(clamp(t/2.8)*Math.PI)*9;pose.weaponRotation=t<.85?-.1:.1;
    }else{
        pose.frame=t<.8?1:t<3.5?2:t<4.45?3:0;pose.y-=Math.sin(clamp(t/4.5)*Math.PI)*13;pose.weaponRotation=t<3.4?-.3:.6;
    }
    return pose;
}
export function weaponTransform(pose:HeroPose,hand:Point,grip:Point,tip:Point,scale:number,angle:number):Point {
    const localX=(hand.x-72)*pose.scale,localY=(hand.y-140)*pose.scale;
    const dx=(tip.x-grip.x)*scale,dy=(tip.y-grip.y)*scale;
    return {x:pose.x+localX+dx*Math.cos(angle)-dy*Math.sin(angle),y:pose.y+localY+dx*Math.sin(angle)+dy*Math.cos(angle)};
}
