/** Integer-grid painter: polygon edges are filled one pixel at a time, without antialiasing. */
export class PixelPainter {
    readonly context:CanvasRenderingContext2D;
    constructor(context:CanvasRenderingContext2D) {this.context=context;}
    rect(x:number,y:number,w:number,h:number,color:string) {this.context.fillStyle=color;this.context.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
    ellipse(x:number,y:number,rx:number,ry:number,color:string) {
        for(let py=Math.floor(y-ry);py<=y+ry;py++)for(let px=Math.floor(x-rx);px<=x+rx;px++)
            if(((px+.5-x)/rx)**2+((py+.5-y)/ry)**2<=1)this.rect(px,py,1,1,color);
    }
    polygon(points:readonly number[],color:string) {
        const xs=points.filter((_,i)=>i%2===0),ys=points.filter((_,i)=>i%2===1);
        for(let y=Math.floor(Math.min(...ys));y<Math.ceil(Math.max(...ys));y++)for(let x=Math.floor(Math.min(...xs));x<Math.ceil(Math.max(...xs));x++) {
            let inside=false;
            for(let i=0,j=xs.length-1;i<xs.length;j=i++)if((ys[i]>y+.5)!==(ys[j]>y+.5)&&x+.5<(xs[j]-xs[i])*(y+.5-ys[i])/(ys[j]-ys[i])+xs[i])inside=!inside;
            if(inside)this.rect(x,y,1,1,color);
        }
    }
    line(x:number,y:number,tx:number,ty:number,color:string,width=1) {
        const n=Math.max(Math.abs(tx-x),Math.abs(ty-y));
        for(let i=0;i<=n;i++)this.rect(x+(tx-x)*i/Math.max(n,1)-width/2,y+(ty-y)*i/Math.max(n,1)-width/2,width,width,color);
    }
}
