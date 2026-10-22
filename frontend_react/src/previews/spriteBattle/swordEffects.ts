import {DUMMY_X,GROUND} from './catalog';
import {bezier,clamp,easeOut,lerp} from './pose';
import {burst,glow,pixelLine,ring,swordSprite} from './pixelDrawing';
import type {BattleArt,BattleSnapshot,HeroPose,Point} from './types';

export function drawSwordAura(g:CanvasRenderingContext2D,art:BattleArt,hero:HeroPose,s:BattleSnapshot){
    ring(g,hero.x,GROUND+3,75,11,'#83c4cb55');glow(g,hero.x-35,GROUND-80,80,'#79d4d5',.13);
    g.fillStyle='#263e4e';g.fillRect(hero.x-73,GROUND-132,24,103);g.fillStyle='#b7a466';g.fillRect(hero.x-72,GROUND-134,22,4);g.fillRect(hero.x-72,GROUND-32,22,4);g.fillStyle='#59949f';g.fillRect(hero.x-67,GROUND-122,4,79);g.fillStyle='#c8c89a';g.fillRect(hero.x-59,GROUND-93,3,18);
    const disappear=s.action.kind==='skill'&&s.action.profession==='blademaster'?clamp(1-s.action.age/.8):1;
    for(let i=0;i<5;i++){
        const a=-Math.PI+i*Math.PI/4,x=hero.x+Math.cos(a)*104,y=GROUND-154+Math.sin(a)*60+Math.sin(s.time*1.7+i)*5;
        glow(g,x,y,21,'#89d9d6',.16*disappear);swordSprite(g,art.weapons.katana,x,y,Math.PI/2+(i-2)*.16,1.12,disappear*.85);
    }
}

interface Flight {start:number;from:Point;control1:Point;control2:Point;target:Point}
export function swordFlight(index:number,hero:Point):Flight {
    const theta=-Math.PI+index%8*Math.PI/7,layer=Math.floor(index/8),from={x:hero.x+Math.cos(theta)*(100+layer*30),y:GROUND-155+Math.sin(theta)*(65+layer*18)};
    const target={x:DUMMY_X+(index%5-2)*7,y:GROUND-80+(index%4-1.5)*8};
    return {start:.85+index*.061,from,control1:{x:from.x+120+layer*25,y:from.y-70+index%3*35},control2:{x:target.x-130,y:target.y-110+index%6*36},target};
}

function judgmentSword(g:CanvasRenderingContext2D,x:number,y:number,alpha:number){
    g.save();g.globalAlpha*=alpha;glow(g,x,y,160,'#9bede4',.28);
    for(let yy=-140;yy<122;yy+=2){
        const width=yy>94?Math.max(2,(122-yy)*.5):yy<-94?8:17;
        g.fillStyle='#437c96';g.fillRect(x-width-3,y+yy,width*2+6,2);
        g.fillStyle='#e2d99a';g.fillRect(x-width,y+yy,width*2,2);
        g.fillStyle='#b3e7df';g.fillRect(x-width+3,y+yy,Math.max(2,width*2-6),2);
        g.fillStyle='#fff7c5';g.fillRect(x-2,y+yy,4,2);
    }
    g.fillStyle='#5c7e83';g.fillRect(x-53,y-99,106,10);g.fillStyle='#d6ba69';g.fillRect(x-48,y-101,96,6);g.fillStyle='#fff0ae';g.fillRect(x-39,y-101,78,2);
    g.fillStyle='#b7cfaa';g.fillRect(x-11,y-115,22,24);g.fillStyle='#488ca3';g.fillRect(x-7,y-112,14,18);g.fillStyle='#d9fff1';g.fillRect(x-3,y-109,6,6);
    for(let i=0;i<5;i++){const yy=y-70+i*29;pixelLine(g,{x:x-6,y:yy-5},{x:x+6,y:yy+5},'#fff9ce',2);pixelLine(g,{x:x+6,y:yy-5},{x:x-6,y:yy+5},'#fff9ce',2);}
    g.restore();
}

export function drawBladeSkill(g:CanvasRenderingContext2D,art:BattleArt,s:BattleSnapshot,hero:HeroPose){
    const t=s.action.age;
    if(t<3.05){
        const reveal=clamp(t/.6);g.save();g.globalAlpha=clamp((3.05-t)/.45)*.65;
        ring(g,hero.x,GROUND-141,139*reveal,103*reveal,'#87d6d866');ring(g,hero.x,GROUND-141,160*reveal,118*reveal,'#d5c78b55',s.time,s.time+Math.PI*1.7);
        for(let i=0;i<12;i++){const a=i*Math.PI/6+s.time*.35;g.fillStyle='#d5e6bf';g.fillRect(hero.x+Math.cos(a)*149-2,GROUND-141+Math.sin(a)*110-2,4,4);}g.restore();
    }
    for(let i=0;i<24;i++){
        const f=swordFlight(i,hero),p=(t-f.start)/.63;
        if(p<0){const alpha=clamp((t-.08-i*.016)/.35)*.75;swordSprite(g,art.weapons.katana,f.from.x,f.from.y,-.25,1.05,alpha);continue;}
        if(p<=1){
            const head=bezier(f.from,f.control1,f.control2,f.target,p);
            for(let j=15;j>0;j--){const q=bezier(f.from,f.control1,f.control2,f.target,clamp(p-j*.012)),r=bezier(f.from,f.control1,f.control2,f.target,clamp(p-(j-1)*.012));g.save();g.globalAlpha=(1-j/16)*.72;pixelLine(g,q,r,i%3?'#7bdde0':'#e9cc8a',j<4?3:2);g.restore();}
            const prev=bezier(f.from,f.control1,f.control2,f.target,clamp(p-.02)),angle=Math.atan2(head.y-prev.y,head.x-prev.x);
            glow(g,head.x,head.y,24,'#a5e7e0',.17);swordSprite(g,art.weapons.katana,head.x,head.y,angle,1.25);
        }else burst(g,f.target.x,f.target.y,(p-1)*.63,'#b8e8df',9,80);
    }
    if(t>2.9&&t<4.05){
        const k=clamp((t-2.9)/.5);ring(g,DUMMY_X,GROUND-3,100*k,16*k,'#d5d293');ring(g,DUMMY_X,GROUND-3,133*k,22*k,'#91d9d477');
        pixelLine(g,{x:DUMMY_X,y:0},{x:DUMMY_X,y:GROUND},'#a5e6dc33',2);
    }
    if(t>3.38&&t<4.38){
        const p=clamp((t-3.38)/.67),y=lerp(-170,GROUND-118,p*p),alpha=t<4.05?1:clamp((4.38-t)/.33);
        for(let i=1;i<5;i++){g.save();g.globalAlpha=(1-i/5)*.13;judgmentSword(g,DUMMY_X,y-i*29,alpha);g.restore();}
        judgmentSword(g,DUMMY_X,y,alpha);
    }
    const impact=t-4.05;
    if(impact>=0&&impact<1.5){
        const k=easeOut(impact/.65),fade=clamp((1.5-impact)/.7);
        glow(g,DUMMY_X,GROUND-55,240,'#c6f2d7',fade*.35);
        g.save();g.globalAlpha=fade;ring(g,DUMMY_X,GROUND,225*k,37*k,'#f3dda4',0,Math.PI*2,3);ring(g,DUMMY_X,GROUND-80,100*k,100*k,'#b9eee6',0,Math.PI*2,2);
        for(let i=0;i<12;i++){const dx=(i-6)*22*k,y=GROUND-Math.abs(Math.sin(i*2.4))*45*(1-k);pixelLine(g,{x:DUMMY_X+dx,y:GROUND},{x:DUMMY_X+dx+15,y},'#a1d4c9',2);}g.restore();
        burst(g,DUMMY_X,GROUND-65,impact,'#f6d99b',46,285);
    }
}

export function drawSwordAttack(g:CanvasRenderingContext2D,s:BattleSnapshot,hero:HeroPose){
    const t=s.action.age;if(t<.25||t>1)return;
    const k=clamp((t-.25)/.4),fade=clamp((1-t)/.35);
    g.save();g.globalAlpha=fade;
    for(let i=0;i<5;i++)ring(g,hero.x+26,GROUND-73,90-i*5,80-i*4,i<2?'#6ab5ca':'#ffe2a7',-.9+k*.3,1.2+k*.3,i===4?3:2);
    g.restore();burst(g,DUMMY_X,GROUND-78,t-.57,'#ffe0a2',24,130);
}
