import {DUMMY_X,GROUND,HEIGHT,WIDTH} from './catalog';
import {burst,glow} from './pixelDrawing';
import {clamp} from './pose';
import type {BattleArt,BattleSnapshot} from './types';

export function drawArena(g:CanvasRenderingContext2D,art:BattleArt,s:BattleSnapshot){
    const image=art.background,split=image.height*.69;
    g.drawImage(image,0,0,image.width,split,0,0,WIDTH,GROUND);
    g.drawImage(image,0,split,image.width,image.height-split,0,GROUND,WIDTH,HEIGHT-GROUND);
    const shade=g.createLinearGradient(0,0,0,HEIGHT);shade.addColorStop(0,'#10203700');shade.addColorStop(.65,'#0b173100');shade.addColorStop(1,'#07101d44');g.fillStyle=shade;g.fillRect(0,0,WIDTH,HEIGHT);
    for(let i=0;i<21;i++){const x=110+i*51+Math.sin(s.time*.25+i)*9,y=GROUND-20-i%4*40+Math.sin(s.time*.8+i*3)*7;g.globalAlpha=.12+Math.max(0,Math.sin(s.time*1.6+i))*.4;g.fillStyle=i%3?'#f4daa1':'#aadbdc';g.fillRect(x,y,2,2);}g.globalAlpha=1;
    if(s.action.kind==='skill'){
        const t=s.action.age,fade=Math.min(clamp(t/.4),clamp((s.action.duration-t)/.8));g.fillStyle=`rgba(5,13,28,${fade*.32})`;g.fillRect(0,0,WIDTH,HEIGHT);
    }
}
export function drawDummy(g:CanvasRenderingContext2D,art:BattleArt,s:BattleSnapshot){
    const recent=s.events[0],age=recent?s.time-recent.at:99;
    const broken=s.breakAt!==null,breakAge=broken?s.time-s.breakAt!:0;
    g.fillStyle='#07112688';g.beginPath();g.ellipse(DUMMY_X,GROUND+3,58,8,0,0,Math.PI*2);g.fill();
    if(!broken){
        const shake=age<.4?Math.sin(age*65)*Math.exp(-age*9)*(recent?.critical?10:5):0;
        g.save();g.translate(DUMMY_X+shake,GROUND);g.rotate(age<.4?Math.sin(age*35)*.035*Math.exp(-age*6):0);g.drawImage(art.dummy,-55,-178,110,178);
        if(age<.12){g.globalAlpha=(1-age/.12)*.85;g.drawImage(art.dummyFlash,-55,-178,110,178);}g.restore();
        if(age<.36)glow(g,DUMMY_X,GROUND-87,70,recent?.color??'#ffda9b',clamp((.36-age)/.36)*.3);
    }else{
        const alpha=clamp((2.5-breakAge)/.6);g.save();g.globalAlpha=alpha;
        for(let i=0;i<24;i++){const dx=(i%6-2.5)*16,dy=Math.floor(i/6)*34;g.fillStyle=i%3?'#b68d60':'#5e4b3b';g.fillRect(DUMMY_X+dx+Math.sin(i*12)*breakAge*50,GROUND-160+dy+Math.sin(i)*breakAge*14+breakAge*breakAge*80,8+i%3*3,10+i%2*4);}
        burst(g,DUMMY_X,GROUND-85,breakAge,'#d4b182',30,160);g.restore();
    }
    g.font='12px MiSans, sans-serif';g.textAlign='center';g.fillStyle='#d2d9d6bb';g.fillText(broken?'木桩修复中…':'试炼木桩',DUMMY_X,GROUND+28);g.textAlign='left';
}
export function drawDamage(g:CanvasRenderingContext2D,s:BattleSnapshot){
    for(const event of s.events.slice(0,20)){
        const age=s.time-event.at;if(age>1.35)continue;
        const dx=(event.id%5-2)*17,dy=(event.id%3)*13;
        g.save();g.globalAlpha=clamp((1.35-age)/.45);g.textAlign='center';g.font=`700 ${event.critical?35:21}px MiSans, sans-serif`;g.lineWidth=4;g.strokeStyle='#142138cc';
        const x=DUMMY_X+dx,y=GROUND-160-age*54-dy;const label=event.critical?`✦ ${event.damage}`:String(event.damage);g.strokeText(label,x,y);g.fillStyle=event.color;g.fillText(label,x,y);g.restore();
    }
}
