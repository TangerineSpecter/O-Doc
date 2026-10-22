import {DUMMY_X,GROUND} from './catalog';
import {bezier,clamp,easeOut,lerp} from './pose';
import {burst,flame,glow,pixelLine,ring} from './pixelDrawing';
import type {BattleSnapshot,Point} from './types';

export function drawFireAura(g:CanvasRenderingContext2D,hero:Point,s:BattleSnapshot){
    const charge=s.embers;
    glow(g,hero.x,GROUND-45,105,'#ffb46e',.12);
    ring(g,hero.x,GROUND+2,67,11,'#c38f4b55');
    for(let i=0;i<3;i++){
        const a=s.time*.7+i*Math.PI*2/3,x=hero.x+Math.cos(a)*74,y=GROUND-54+Math.sin(a)*30;
        glow(g,x,y-10,25,'#ffbc72',.2);flame(g,x,y,i<charge?8:5,s.time+i);
        if(i<charge)ring(g,x,y-7,12,12,'#e7ac6355');
    }
}

function fireOrb(g:CanvasRenderingContext2D,x:number,y:number,r:number,time:number,bloom=true){
    if(bloom)glow(g,x,y,r*4,'#ffb96c',.55);
    for(let yy=-r;yy<=r;yy+=2)for(let xx=-r;xx<=r;xx+=2){
        const limit=r*(.9+.07*Math.sin(time*18+Math.atan2(yy,xx)*4));
        if(xx*xx+yy*yy>limit*limit)continue;
        g.fillStyle=Math.abs(xx)+Math.abs(yy)<r*.65?'#fff4bb':xx*xx+yy*yy<r*r*.5?'#ffd078':'#e98a4d';g.fillRect(Math.round((x+xx)/2)*2,Math.round((y+yy)/2)*2,2,2);
    }
    for(let i=0;i<4;i++){const a=time*3+i*Math.PI/2;g.fillStyle='#ffdfa0';g.fillRect(Math.round(x+Math.cos(a)*r*.8),Math.round(y+Math.sin(a)*r*.8),3,3);}
}

export function drawMageAttack(g:CanvasRenderingContext2D,s:BattleSnapshot,origin:Point){
    const t=s.action.age,blue=s.action.profession==='blademaster',target={x:DUMMY_X,y:GROUND-86};
    if(t<.35){const k=clamp(t/.35);glow(g,origin.x,origin.y,24+k*12,blue?'#8be0eb':'#ffc580',k*.5);ring(g,origin.x,origin.y,8+k*9,8+k*9,blue?'#b1eced':'#ffe0a1');}
    const p=(t-.35)/.53;
    if(p>=0&&p<=1){
        const a={x:origin.x,y:origin.y},b={x:lerp(origin.x,target.x,.3),y:origin.y-24},c={x:lerp(origin.x,target.x,.7),y:target.y-15};
        const head=bezier(a,b,c,target,p);
        for(let j=9;j>0;j--){const u=clamp(p-j*.015),q=bezier(a,b,c,target,u);g.save();g.globalAlpha=(1-j/10)*.8;pixelLine(g,q,head,blue?'#71d4ea':'#eaa45b',j<3?3:2);g.restore();}
        if(blue){glow(g,head.x,head.y,30,'#79d8eb',.5);g.fillStyle='#ddfbff';g.fillRect(head.x-5,head.y-5,10,10);}
        else fireOrb(g,head.x,head.y,8,s.time);
    }
    burst(g,target.x,target.y,t-.88,blue?'#96e5ee':'#ffc178',20,100);
}

export function drawPyroSkill(g:CanvasRenderingContext2D,s:BattleSnapshot,origin:Point){
    const t=s.action.age,target={x:DUMMY_X,y:GROUND-86};
    if(t<.96){
        const k=easeOut(t/.9);ring(g,origin.x,origin.y,34*k,34*k,'#efb67388');
        ring(g,origin.x,origin.y,47*k,47*k,'#ffc37855',s.time*2,s.time*2+Math.PI*1.5);
        fireOrb(g,origin.x,origin.y,4+15*k,s.time);
        for(let i=0;i<7;i++){const a=i*2.4+s.time*3,r=60*(1-k)+18;flame(g,origin.x+Math.cos(a)*r,origin.y+Math.sin(a)*r,3+i%2,s.time+i);}
    }
    const p=(t-.9)/.78;
    if(p>=0&&p<=1){
        const a=origin,b={x:origin.x+180,y:origin.y-110},c={x:target.x-160,y:target.y-100},head=bezier(a,b,c,target,p);
        for(let j=18;j>0;j--){const q=bezier(a,b,c,target,clamp(p-j*.009));g.save();g.globalAlpha=(1-j/20)*.65;flame(g,q.x,q.y,4+(18-j)*.48,s.time+j*.1);g.restore();}
        fireOrb(g,head.x,head.y,20,s.time);
    }
    const impact=t-1.68;
    if(impact>=0&&impact<1.55){
        const k=easeOut(impact/.6),fade=clamp(1-(impact-.5)/1.05);
        glow(g,target.x,target.y,190,'#ffc573',fade*.27);
        g.save();g.globalAlpha=fade*.9;
        for(let dy=-104;dy<=104;dy+=3)for(let dx=-104;dx<=104;dx+=3){
            const angle=Math.atan2(dy,dx),radius=(65+29*Math.cos(4*(angle-Math.PI/4)))*k*(1+.035*Math.sin(angle*19+s.time*5));
            const distance=Math.hypot(dx,dy),ratio=distance/Math.max(1,radius);
            if(ratio>1)continue;
            if(impact>.75&&ratio<clamp((impact-.75)*1.4))continue;
            g.fillStyle=ratio<.27?'#fff4bd':ratio<.55?'#ffdc89':ratio<.8?'#f5af60':'#d87d46';
            g.fillRect(Math.round(target.x+dx),Math.round(target.y+dy),3,3);
        }
        g.restore();
        ring(g,target.x,GROUND-2,135*k,24*k,`#ffd794${Math.round(fade*220).toString(16).padStart(2,'0')}`,0,Math.PI*2,3);
        burst(g,target.x,target.y,impact,'#ffc46f',36,230);
    }
    if(t>2&&t<4.15){
        const fade=clamp((4.15-t)/.8);g.save();g.globalAlpha=fade*.65;
        for(let i=0;i<13;i++){const a=i*2.4+s.time*.3,r=38+i%4*8;flame(g,target.x+Math.cos(a)*r,GROUND-7-Math.abs(Math.sin(a))*12,3+i%4,s.time+i);}
        g.restore();
    }
}
