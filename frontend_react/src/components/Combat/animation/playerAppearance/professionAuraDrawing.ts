import {ellipse,flameTongue,polygon,star} from '../pixelEffectDrawing';
import type {ProfessionAuraId} from './layeredPlayerArt';
import {professionAuraProfiles} from '../../art/professionAuras';
import {drawProfessionMotif} from './professionAuraMotifs';
type Context=CanvasRenderingContext2D;

function segmentedRing(c:Context,y:number,rx:number,ry:number,color:string,time:number) {
    ellipse(c,0,y,rx,ry,color,.18,20);ellipse(c,0,y,rx,ry,color,.85,5);
    for(let i=0;i<8;i++) {
        const a=i/8*Math.PI*2+time*.18;
        star(c,Math.cos(a)*rx,y+Math.sin(a)*ry,12,'#fff1b7',.85);
    }
}

/** Identity ambience is continuous and separate from learned combat skills. */
export function drawProfessionAura(rear:Context,ground:Context,id:ProfessionAuraId,time:number) {
    if(id==='none') return;
    if(id==='flame') {
        const heights=[290,420,530,430,310];
        [-230,-155,0,155,230].forEach((x,i)=>flameTongue(rear,x,8,34+i%2*10,heights[i]+Math.sin(time*2+i)*22,time*.4,i*1.7,.78));
        for(let i=0;i<9;i++) {
            const p=(time*.16+i*.117)%1;
            const x=Math.sin(i*2.7)*265+Math.sin(time+i)*12;
            rear.fillStyle=i%3?'#ffd371':'#fff2bc';rear.globalAlpha=(1-p)*.85;
            rear.fillRect(Math.round(x/8)*8,-Math.round((100+p*460)/8)*8,8,i%2?16:8);
        }
        rear.globalAlpha=1;
        ellipse(ground,0,8,205,42,'#f5a94b',.16);ellipse(ground,0,8,195,36,'#f5ae52',.7,5);
    } else if(id==='holy') {
        const centerY=-315;
        ellipse(rear,0,centerY,226,226,'#ffe6a0',.16);
        ellipse(rear,0,centerY,213,213,'#f6d58b',.65,6);
        ellipse(rear,0,centerY,189,189,'#fff6cd',.6,4);
        for(let i=0;i<10;i++) {
            const a=i/10*Math.PI*2;
            const x=Math.cos(a),y=Math.sin(a);
            polygon(rear,[x*174-y*11,centerY+y*174+x*11,x*278,centerY+y*278,x*174+y*11,centerY+y*174-x*11],'#ffefba',.44+Math.sin(time*1.4+i)*.12);
        }
        star(rear,0,-582,31,'#fff8d7');
        for(let i=0;i<6;i++) {
            const p=(time*.1+i*.17)%1;
            star(rear,Math.sin(i*2.8)*240,-60-p*480,8+(i%2)*4,'#ffefb6',.65*(1-p));
        }
        ellipse(ground,0,8,156,30,'#edda9e',.25);
    } else if(id==='cross') {
        segmentedRing(ground,5,265,73,'#d7ad58',time);
        ellipse(ground,0,5,226,58,'#fff3b9',.75,4);
        // Cross is projected on the floor plane, not a flat symbol over the face.
        polygon(ground,[-22,-56,22,-56,22,-9,142,-9,142,16,22,16,22,66,-22,66,-22,16,-142,16,-142,-9,-22,-9],'#ffeda4',.78);
        polygon(ground,[-8,-45,8,-45,8,0,119,0,119,7,8,7,8,52,-8,52,-8,7,-119,7,-119,0,-8,0],'#fff9db',.9);
        for(let i=0;i<6;i++) {
            const p=(time*.12+i/6)%1;const x=Math.sin(i*2.3)*190;
            rear.fillStyle='#fff0b8';rear.globalAlpha=(1-p)*.6;
            rear.fillRect(Math.round(x/8)*8,-p*210,8,20);
        }
        rear.globalAlpha=1;
    } else {
        const profile=professionAuraProfiles.find(p=>p.id===id);
        if(profile)drawProfessionMotif(rear,ground,profile,time);
    }
}
