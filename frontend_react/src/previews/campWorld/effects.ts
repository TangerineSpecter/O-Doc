import {BRIDGE, GROUND_Y} from './worldMap';
import type {Resident, Shape} from './types';

export function pixelLine(g:CanvasRenderingContext2D,x0:number,y0:number,x1:number,y1:number,color:string,size=1) {
    g.fillStyle=color;const count=Math.max(1,Math.abs(x1-x0),Math.abs(y1-y0));
    for(let i=0;i<=count;i++)g.fillRect(Math.round(x0+(x1-x0)*i/count),Math.round(y0+(y1-y0)*i/count),size,size);
}

export function drawFire(g:CanvasRenderingContext2D,time:number) {
    const x0=763,y0=GROUND_Y-18;
    const glow=g.createRadialGradient(x0,y0-10,2,x0,y0-10,70);
    glow.addColorStop(0,'#f5ae4355');glow.addColorStop(1,'#f5ae4300');g.fillStyle=glow;g.fillRect(x0-70,y0-80,140,120);
    for(let x=-11;x<=11;x+=2){
        const height=Math.max(3,29-Math.abs(x)*1.5+Math.sin(time*8+x*.9)*4+Math.sin(time*11-x)*2);
        for(let y=0;y<height;y+=2){g.fillStyle=y<height*.42&&Math.abs(x)<5?'#ffedac':y>height*.7?'#df7938':'#ffb84f';g.fillRect(x0+x,y0-y,2,2);}
    }
    for(let i=0;i<12;i++){const age=(time*(8+i%3)+i*6.8)%50;g.globalAlpha=(1-age/50)*.7;g.fillStyle='#ffd38d';
        g.fillRect(Math.round(x0+Math.sin(i*8+age*.09)*(4+age*.13)),Math.round(y0-10-age),i%3?1:2,2);}
    g.globalAlpha=1;
}

export function drawBridge(g:CanvasRenderingContext2D,time:number) {
    const {x,width}=BRIDGE;
    g.fillStyle='#264f4e';g.fillRect(x,GROUND_Y+3,width,70);
    g.fillStyle='#356664';g.fillRect(x,GROUND_Y+28,width,18);
    for(let i=0;i<22;i++){g.globalAlpha=.25+Math.max(0,Math.sin(time*1.8+i*3))*.5;g.fillStyle=i%3?'#7eb1a0':'#d6c280';
        g.fillRect(x+6+(i*23)%260+Math.round(Math.sin(time+i)*2),GROUND_Y+21+i%5*8,4+i%5,1);}
    g.globalAlpha=1;
    g.fillStyle='#4c382b';g.fillRect(x-6,GROUND_Y-3,width+12,7);
    for(let i=0;i<width;i+=14){g.fillStyle=i%28?'#a77f4c':'#bd9560';g.fillRect(x+i,GROUND_Y-5,12,4);}
    for(let i=0;i<width;i+=65){g.fillStyle='#654b31';g.fillRect(x+i,GROUND_Y-24,5,75);g.fillStyle='#b58b54';g.fillRect(x+i,GROUND_Y-25,6,3);}
    g.fillStyle='#80603c';g.fillRect(x,GROUND_Y-19,width,3);
}

export function drawAtmosphere(g:CanvasRenderingContext2D,time:number) {
    for(let i=0;i<25;i++){
        const x=42+i*73+Math.sin(time*.32+i*1.7)*10,y=GROUND_Y-30-i%4*18+Math.sin(time*.65+i)*7;
        g.globalAlpha=.2+Math.max(0,Math.sin(time*2+i))*.5;g.fillStyle='#fff0a1';g.fillRect(Math.round(x),Math.round(y),2,2);
    }
    g.globalAlpha=1;
    for(let i=0;i<5;i++){const rise=(time*6+i*9)%44;g.globalAlpha=(1-rise/44)*.28;g.fillStyle='#c3c1ac';
        g.fillRect(Math.round(183+rise*.25+Math.sin(time+i)*2),Math.round(140-rise),5+i%3,4);}
    g.globalAlpha=1;
    for(let i=0;i<3;i++){const x=(time*12+i*163)%1900,y=95+i*24+Math.sin(time*.6+i)*5;
        pixelLine(g,x-4,y-2,x,y,'#485d51');pixelLine(g,x,y,x+4,y-2,'#485d51');}
}

export function drawHeldProps(g:CanvasRenderingContext2D,r:Resident,time:number) {
    if(r.pose!=='fish')return;
    const age=time-r.actionSince,phase=age>8&&age<10.7,x=r.x,y=r.y,f=r.facing;
    const tip={x:x+f*33,y:y-(phase?65:54)},bobber={x:x+f*64,y:GROUND_Y+38+Math.sin(time*3)};
    pixelLine(g,x+f*12,y-27,tip.x,tip.y,'#64482f',2);
    if(!phase){pixelLine(g,tip.x,tip.y,bobber.x,bobber.y,'#d3d5bd');g.fillStyle='#ef9166';g.fillRect(bobber.x-1,bobber.y-3,3,3);
        g.fillStyle='#afcfc0';g.fillRect(bobber.x-6,bobber.y+2,12,1);
    }else{const p=(age-8)/2.7,fx=x+f*(50-p*24),fy=y-15-Math.sin(p*Math.PI)*42;
        pixelLine(g,tip.x,tip.y,fx,fy,'#d3d5bd');g.fillStyle='#e7b469';g.fillRect(fx-4,fy,8,4);g.fillStyle='#c58554';g.fillRect(fx+3,fy-1,3,6);g.fillStyle='#334e40';g.fillRect(fx-3,fy+1,1,1);}
}

export function traceShape(g:CanvasRenderingContext2D,shape:Shape,color:string,fill=true) {
    g.beginPath();
    if(shape.kind==='rect')g.rect(shape.x,shape.y,shape.w,shape.h);
    else if(shape.kind==='ellipse')g.ellipse(shape.x,shape.y,shape.rx,shape.ry,0,0,Math.PI*2);
    else{shape.points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();}
    if(fill){g.globalAlpha=.18;g.fillStyle=color;g.fill();}g.globalAlpha=.85;g.strokeStyle=color;g.lineWidth=1;g.stroke();g.globalAlpha=1;
}
