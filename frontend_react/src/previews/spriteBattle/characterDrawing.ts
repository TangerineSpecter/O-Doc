import {getWeapon,GROUND} from './catalog';
import type {BattleArt,BattleSnapshot,HeroPose,Point} from './types';
import {weaponTransform} from './pose';

export function drawHero(g:CanvasRenderingContext2D,art:BattleArt,s:BattleSnapshot,pose:HeroPose):Point {
    const frame=art.frames[s.loadout.outfit][pose.frame],weapon=getWeapon(s.loadout.weapon),scale=weapon.scale,angle=weapon.angle+pose.weaponRotation;
    const hand={x:pose.x+(frame.hand.x-72)*pose.scale,y:pose.y+(frame.hand.y-140)*pose.scale};
    g.fillStyle='#070f2255';g.beginPath();g.ellipse(pose.x,GROUND+3,56,8,0,0,Math.PI*2);g.fill();
    if(s.action.kind==='attack'&&weapon.kind==='sword'&&s.action.age>.2&&s.action.age<.7){
        for(let i=4;i>0;i--){g.save();g.globalAlpha=.065*(5-i);g.filter='brightness(1.6) saturate(.5)';g.drawImage(frame.canvas,Math.round(pose.x-108-i*28),Math.round(pose.y-210),216,216);g.restore();}
    }
    g.save();g.translate(Math.round(pose.x),Math.round(pose.y));g.rotate(pose.rotation);g.drawImage(frame.canvas,-72*pose.scale,-140*pose.scale,144*pose.scale,144*pose.scale);g.restore();
    g.save();g.translate(Math.round(hand.x),Math.round(hand.y));g.rotate(angle);g.drawImage(art.weapons[weapon.id],-weapon.grip.x*scale,-weapon.grip.y*scale,art.weapons[weapon.id].width*scale,art.weapons[weapon.id].height*scale);g.restore();
    // The small foreground glove preserves grip occlusion without painting a weapon into the character.
    g.fillStyle='#493532';g.fillRect(hand.x-4,hand.y-3,8,6);g.fillStyle='#765041';g.fillRect(hand.x-3,hand.y-3,4,2);g.fillStyle='#9b7056';g.fillRect(hand.x-3,hand.y-3,2,1);
    return weaponTransform(pose,frame.hand,weapon.grip,weapon.tip,scale,angle);
}
