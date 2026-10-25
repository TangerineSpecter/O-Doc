import type {ProfessionAuraProfile} from '../../art/professionAuras';
import {auraArc,auraLine,auraSpark} from './auraDrawingPrimitives';
import {ellipse,polygon} from '../pixelEffectDrawing';

function note(c:CanvasRenderingContext2D,x:number,y:number,p:ProfessionAuraProfile,paired=false) {
    ellipse(c,x,y,9,5,p.color,.6);
    auraLine(c,[x+7,y,x+7,y-31,x+28,y-36],p.light,4,.65);
    if(paired){ellipse(c,x+28,y-7,8,5,p.color,.5);auraLine(c,[x+28,y-7,x+28,y-36],p.light,4,.6);}
}
/** Distinct moving motifs share the music drawing vocabulary and the common rig. */
export function drawBardAura(rear:CanvasRenderingContext2D,floor:CanvasRenderingContext2D,p:ProfessionAuraProfile,time:number) {
    if(p.id==='bard'){
        for(let i=0;i<3;i++){const phase=time*.5+i*Math.PI*2/3;note(rear,Math.cos(phase)*220,-210+Math.sin(phase)*95,p);}
    }else if(p.id==='musician'){
        for(let i=0;i<3;i++)auraArc(rear,0,-265,228+i*16,105+i*35,time*.3+i*2,1.6,p,.4);
        note(rear,-240,-270+Math.sin(time)*14,p,true);note(rear,220,-270-Math.sin(time)*14,p,true);
    }else if(p.id==='cursesinger'){
        for(let i=0;i<3;i++){const y=-390+i*125+Math.sin(time+i)*14;
            auraLine(rear,[-248,y,-220,y-18,-190,y+18,-163,y],p.light,4,.5);
            auraLine(rear,[165,y,195,y+18,215,y-18,247,y],p.color,6,.5);}
    }else if(p.id==='battleconductor'){
        for(const side of [-1,1]){const x=side*235,y=-325+Math.sin(time*.7+side)*30;
            auraLine(rear,[x-side*20,y+70,x+side*25,y-70],p.light,6,.6);
            auraSpark(rear,x+side*25,y-70,10,p,.5);
            for(let i=0;i<3;i++)auraLine(rear,[x-side*22,y+i*26,x+side*40,y+i*26-16],p.color,4,.3);}
    }else if(p.id==='requiemsinger'){
        for(const side of [-1,1]){const x=side*238,y=-300+Math.sin(time*.5+side)*35;
            polygon(rear,[x-30,y+20,x-23,y-36,x,y-57,x+23,y-36,x+30,y+20],p.color,.18);
            auraLine(rear,[x-30,y+20,x+30,y+20],p.light,4,.55);auraSpark(rear,x,y+31,7,p,.4);}
        auraArc(floor,0,5,245,42,-time*.2,3,p,.35);
    }else if(p.id==='virtuoso'){
        for(let i=0;i<5;i++){const phase=time*.8+i*Math.PI*2/5;
            note(rear,Math.cos(phase)*245,-270+Math.sin(phase)*165,p,i%2===0);}
        for(let i=0;i<3;i++)auraArc(floor,0,5,185+i*25,24+i*7,time*.5+i*2,1.2,p,.4);
    }else{
        for(let i=0;i<3;i++)auraArc(rear,0,-285,245-i*18,180+i*26,(i%2?-1:1)*time*.3+i*2,2,p,.5);
        for(const side of [-1,1]){const x=side*250,y=-300+Math.sin(time+side)*70;
            polygon(rear,[x,y-25,x+18,y,x,y+25,x-18,y],p.color,.5);auraLine(rear,[x,y-17,x,y+17],p.light,4,.6);}
    }
    auraArc(floor,0,5,165+p.tier*17,22+p.tier*4,time*.25,Math.PI*.7,p,.3);
}
