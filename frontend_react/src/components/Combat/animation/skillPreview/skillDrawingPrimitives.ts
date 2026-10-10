import {ellipse,polygon,star,energyRing} from '../pixelEffectDrawing';
import type {EffectContext} from '../pixelEffectDrawing';

export function path(c:EffectContext,points:number[],color:string,width:number,alpha=1) {
    c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=width;c.lineJoin='miter';c.lineCap='square';c.beginPath();
    for(let i=0;i<points.length;i+=2){if(i)c.lineTo(points[i],points[i+1]);else c.moveTo(points[i],points[i+1]);}
    c.stroke();c.restore();
}
export function slash(c:EffectContext,x:number,y:number,radius:number,progress:number,color:string,light:string,reverse=false,alpha=1) {
    const points:number[]=[],inner:number[]=[];
    const direction=reverse?-1:1,start=direction===1?-2.1:-.9;
    for(let i=0;i<=18;i++) {
        const p=i/18,angle=start+direction*p*2.7;
        const tip=radius*(.45+.55*Math.sin(p*Math.PI));
        const r=tip*(.7+progress*.3);
        points.push(x+Math.cos(angle)*r,y+Math.sin(angle)*r);
        inner.unshift(x+Math.cos(angle)*(r-16*Math.sin(p*Math.PI)),y+Math.sin(angle)*(r-16*Math.sin(p*Math.PI)));
    }
    polygon(c,[...points,...inner],color,alpha);
    path(c,points,light,4,alpha);
}
export function sparks(c:EffectContext,x:number,y:number,time:number,color:string,count=8,spread=85) {
    for(let i=0;i<count;i++) {
        const angle=i/count*Math.PI*2+.42,r=12+time*spread;
        star(c,x+Math.cos(angle)*r,y+Math.sin(angle)*r+time*time*15,i%2?3:5,color,Math.max(0,1-time));
    }
}
export function cross(c:EffectContext,x:number,y:number,size:number,color:string,alpha=1) {
    polygon(c,[x-size*.22,y-size,x+size*.22,y-size,x+size*.22,y-size*.22,x+size,y-size*.22,
        x+size,y+size*.22,x+size*.22,y+size*.22,x+size*.22,y+size,x-size*.22,y+size,
        x-size*.22,y+size*.22,x-size,y+size*.22,x-size,y-size*.22,x-size*.22,y-size*.22],color,alpha);
}
export function arrow(c:EffectContext,x:number,y:number,length:number,color:string,light:string,alpha=1) {
    polygon(c,[x-length,y-3,x-9,y-3,x-15,y-10,x+5,y,x-15,y+10,x-9,y+3,x-length,y+3],color,alpha);
    path(c,[x-length+3,y,x+1,y],light,2,alpha);
}
export function crystal(c:EffectContext,x:number,y:number,width:number,height:number,color:string,light:string,alpha=1) {
    polygon(c,[x,y-height,x+width*.5,y-height*.28,x+width*.35,y+5,x-width*.35,y+5,x-width*.5,y-height*.28],color,alpha);
    polygon(c,[x,y-height,x+width*.15,y-height*.25,x,y+3,x-width*.28,y-height*.28],light,alpha*.85);
}
export function runeRing(c:EffectContext,x:number,y:number,r:number,time:number,color:string,alpha=1) {
    energyRing(c,x,y,r,r*.28,time,color,alpha,true);
    for(let i=0;i<4;i++)star(c,x+Math.cos(i*Math.PI/2+time)*r,y+Math.sin(i*Math.PI/2+time)*r*.28,5,color,alpha);
}
export function orb(c:EffectContext,x:number,y:number,r:number,color:string,light:string,alpha=1) {
    ellipse(c,x,y,r+5,r+5,color,alpha*.25);ellipse(c,x,y,r,r,color,alpha);
    ellipse(c,x-2,y-3,r*.55,r*.55,light,alpha);
}
