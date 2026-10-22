import {drawFire} from '../campWorld/effects';
import {footBounds} from './placement';
import {getTemplate, GROUND, STAGE_HEIGHT, STAGE_WIDTH, TILE} from './templates';
import type {ActorView, Placement, StageOptions, StudioArt} from './types';

export function drawBackdrop(g:CanvasRenderingContext2D,art:StudioArt,room:StageOptions['room']) {
    g.fillStyle='#7e6345';g.fillRect(0,0,STAGE_WIDTH,STAGE_HEIGHT);
    if(room==='camp'){
        g.drawImage(art.background,0,0,art.background.width,art.background.height*.835,0,0,STAGE_WIDTH,GROUND);
        g.drawImage(art.background,0,art.background.height*.835,art.background.width,art.background.height*.165,0,GROUND,STAGE_WIDTH,STAGE_HEIGHT-GROUND);
    }else{
        g.fillStyle='#d6bea1';g.fillRect(0,0,STAGE_WIDTH,GROUND);
        for(let y=0;y<GROUND;y+=32)for(let x=0;x<STAGE_WIDTH;x+=64){g.fillStyle=(x/64+y/32)%3?'#cdb596':'#d3bd9f';g.fillRect(x+(y/32%2)*32,y,62,30);}
        g.fillStyle='#75553d';g.fillRect(0,0,STAGE_WIDTH,15);g.fillRect(0,GROUND-11,STAGE_WIDTH,14);
        for(const x of [64,608,1184]){g.fillStyle='#694d38';g.fillRect(x,0,14,GROUND);g.fillStyle='#94704d';g.fillRect(x+2,16,4,GROUND-28);}
        for(const x of [190,890]){
            g.fillStyle='#684f3a';g.fillRect(x-10,99,168,168);g.fillStyle='#ac8b61';g.fillRect(x-4,105,156,154);
            g.drawImage(art.background,300,80,440,300,x+4,112,140,139);
            g.fillStyle='#75553d';g.fillRect(x+69,108,8,147);g.fillRect(x,179,148,7);g.fillRect(x-16,257,180,9);
            g.fillStyle='#a38057';g.fillRect(x-12,257,172,3);
        }
        for(let x=0;x<STAGE_WIDTH;x+=64){g.fillStyle=x%128?'#97714b':'#a47c53';g.fillRect(x,GROUND+3,62,90);g.fillStyle='#b68c5c';g.fillRect(x+1,GROUND+4,60,3);}
        g.fillStyle='#5d4736';g.fillRect(0,GROUND+94,STAGE_WIDTH,2);
    }
}

export function drawFurniture(g:CanvasRenderingContext2D,art:StudioArt,item:Placement,time:number,ghost=false) {
    const t=getTemplate(item.templateId),x=item.col*TILE,w=t.width*TILE,h=t.height*TILE;
    g.save();g.globalAlpha=ghost?.55:1;
    if(item.templateId==='lamp'&&item.lit){const light=g.createRadialGradient(x+w/2,GROUND-h+30,1,x+w/2,GROUND-h+30,95);light.addColorStop(0,'#ffce7377');light.addColorStop(.4,'#ffce7320');light.addColorStop(1,'#ffce7300');g.fillStyle=light;g.fillRect(x-70,GROUND-h-60,200,200);}
    if(item.flipped){g.translate(x+w,GROUND-h);g.scale(-1,1);}else g.translate(x,GROUND-h);
    if(item.templateId==='lamp'&&!item.lit)g.filter='brightness(.45) saturate(.5)';
    g.drawImage(art.objects[item.templateId],0,0,w,h);
    g.restore();
    if(item.templateId==='fire'){g.save();g.translate(x+w/2-763,GROUND-334);drawFire(g,time);g.restore();}
}

export function drawGrid(g:CanvasRenderingContext2D,options:StageOptions,ghost:Placement|null,invalid:boolean) {
    if(options.grid){
        g.strokeStyle=options.room==='camp'?'#fff5cc25':'#553a3425';g.lineWidth=1;g.beginPath();
        for(let x=0;x<=STAGE_WIDTH;x+=TILE){g.moveTo(x+.5,32);g.lineTo(x+.5,GROUND);}
        for(let y=32;y<=GROUND;y+=TILE){g.moveTo(0,y+.5);g.lineTo(STAGE_WIDTH,y+.5);}g.stroke();
        g.font='10px MiSans, sans-serif';g.fillStyle='#f5ebd5bb';
        for(let x=0;x<40;x+=5)g.fillText(String(x),x*TILE+5,GROUND+27);
    }
    const selected=ghost||options.placements.find(p=>p.id===options.selected);
    if(selected){
        const t=getTemplate(selected.templateId),x=selected.col*TILE,y=GROUND-t.height*TILE;
        g.fillStyle=invalid?'#fa5b6933':'#ffd78a18';g.fillRect(x,y,t.width*TILE,t.height*TILE);
        g.strokeStyle=invalid?'#fb7185':'#ffe0a3';g.lineWidth=1.6;g.setLineDash([5,3]);g.strokeRect(x+.5,y+.5,t.width*TILE-1,t.height*TILE-1);g.setLineDash([]);
        for(const [cx,cy] of [[x,y],[x+t.width*TILE,y],[x,GROUND],[x+t.width*TILE,GROUND]]){g.fillStyle='#fff5dd';g.fillRect(cx-3,cy-3,6,6);g.fillStyle='#cc8c44';g.fillRect(cx-1,cy-1,2,2);}
        g.fillStyle='#fff6e5';g.font='11px MiSans, sans-serif';const label=`${selected.name}  ${t.width} × ${t.height}`;const tw=g.measureText(label).width+18;
        g.fillStyle='#263e36e8';g.fillRect(x+(t.width*TILE-tw)/2,y-27,tw,20);g.fillStyle='#fff3dc';g.fillText(label,x+(t.width*TILE-tw)/2+9,y-13);
    }
    if(options.collisions)for(const item of options.placements){
        const t=getTemplate(item.templateId),b=footBounds(item);
        if(item.solid){g.fillStyle='#f47a8050';g.fillRect(b.left,GROUND-b.height,b.right-b.left,b.height);g.strokeStyle='#ffa7a8';g.strokeRect(b.left,GROUND-b.height,b.right-b.left,b.height);}
        const points=item.solid?[b.left-15,b.right+15]:[(item.col+t.width/2)*TILE];
        for(const x of points){g.strokeStyle='#92e3c1';g.beginPath();g.arc(x,GROUND,4,0,Math.PI*2);g.stroke();g.fillStyle='#92e3c1';g.fillRect(x-1,GROUND-1,2,2);}
    }
}

export function drawActors(g:CanvasRenderingContext2D,art:StudioArt,actors:ActorView[],time:number) {
    for(const actor of actors){
        const sitting=actor.pose==='sit';g.fillStyle='#182c3455';g.beginPath();g.ellipse(actor.x,GROUND+1,20,4,0,0,Math.PI*2);g.fill();
        g.save();g.translate(Math.round(actor.x),GROUND-(sitting?12:0));g.scale(actor.facing,1);g.drawImage(art.characters[actor.id][actor.pose],-44,-84);g.restore();
        g.fillStyle=actor.id==='klee'?'#ffb994':'#f7c8d9';g.font='11px MiSans, sans-serif';g.textAlign='center';g.fillText(actor.id==='klee'?'可莉':'阿尼亚',actor.x,GROUND+19);g.textAlign='left';
    }
    const actor=actors[Math.floor(time/6)%2];if(!actor?.text)return;
    const text=actor.text,w=Math.min(244,g.measureText(text).width+28),x=Math.max(12,Math.min(STAGE_WIDTH-w-12,actor.x-w/2)),y=GROUND-132;
    g.fillStyle='#fffaf0f5';g.beginPath();g.roundRect(x,y,w,34,7);g.fill();
    g.beginPath();g.moveTo(actor.x-5,y+34);g.lineTo(actor.x,y+41);g.lineTo(actor.x+5,y+34);g.fill();
    g.fillStyle='#524839';g.font='12px MiSans, sans-serif';g.fillText(text,x+12,y+22,w-18);
}
