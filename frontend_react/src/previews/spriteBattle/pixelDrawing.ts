import type {Point} from './types';

export function pixelLine(g:CanvasRenderingContext2D,a:Point,b:Point,color:string,size=2){
    g.fillStyle=color;const count=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))/2));
    for(let i=0;i<=count;i++)g.fillRect(Math.round((a.x+(b.x-a.x)*i/count)/2)*2,Math.round((a.y+(b.y-a.y)*i/count)/2)*2,size,size);
}
export function glow(g:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=.4){
    g.save();g.globalAlpha*=alpha;const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(.3,color+'90');gradient.addColorStop(1,color+'00');g.fillStyle=gradient;g.fillRect(x-r,y-r,r*2,r*2);g.restore();
}
export function ring(g:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string,start=0,end=Math.PI*2,size=2){
    let previous={x:x+Math.cos(start)*rx,y:y+Math.sin(start)*ry};
    for(let a=start+.07;a<=end+.07;a+=.07){const point={x:x+Math.cos(a)*rx,y:y+Math.sin(a)*ry};pixelLine(g,previous,point,color,size);previous=point;}
}
export function flame(g:CanvasRenderingContext2D,x:number,y:number,size:number,time:number){
    for(let dx=-size;dx<=size;dx+=2){const h=Math.max(2,size*2-Math.abs(dx)*1.4+Math.sin(time*12+dx)*size*.17);
        for(let dy=0;dy<h;dy+=2){g.fillStyle=Math.abs(dx)<size*.35&&dy<h*.6?'#fff2b8':dy>h*.75?'#e9824d':'#ffc169';g.fillRect(Math.round((x+dx)/2)*2,Math.round((y-dy)/2)*2,2,2);}}
}
export function swordSprite(g:CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,angle:number,scale:number,alpha=1){
    g.save();g.globalAlpha*=alpha;g.translate(Math.round(x),Math.round(y));g.rotate(angle+1.06);g.drawImage(image,-image.width*scale/2,-image.height*scale/2,image.width*scale,image.height*scale);g.restore();
}
export function burst(g:CanvasRenderingContext2D,x:number,y:number,age:number,color:string,count=22,radius=110){
    if(age<0||age>1.1)return;
    g.save();g.globalAlpha=(1-age/1.1)*.9;
    for(let i=0;i<count;i++){
        const angle=i*2.39996,distance=(.3+i%7*.1)*radius*age,sx=x+Math.cos(angle)*distance,sy=y+Math.sin(angle)*distance+age*age*35;
        pixelLine(g,{x:sx-Math.cos(angle)*(10-age*5),y:sy-Math.sin(angle)*(10-age*5)},{x:sx,y:sy},i%3===0?'#fff7cb':color,i%3?2:3);
    }g.restore();
}
