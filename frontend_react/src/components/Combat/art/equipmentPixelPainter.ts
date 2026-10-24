import type {EquipmentPalette} from './equipmentArtPalette';
export type Point = readonly [number,number];
export type EquipmentPixelLayer = {color:string;pixels:Set<string>};
/** A 48x48 integer grid. Bevels follow each silhouette, with light from the upper left. */
export class EquipmentPixelPainter {
    readonly layers:EquipmentPixelLayer[]=[];
    add(color:string,pixels:Set<string>) {if(pixels.size)this.layers.push({color,pixels});}
    rect(x:number,y:number,w:number,h:number,color:string) {
        const pixels=new Set<string>();
        for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)if(px>=0&&px<48&&py>=0&&py<48)pixels.add(`${px},${py}`);
        this.add(color,pixels);
    }
    line(a:Point,b:Point,color:string,width=1) {
        let [x,y]=a;
        const dx=Math.abs(b[0]-x),sx=x<b[0]?1:-1,dy=-Math.abs(b[1]-y),sy=y<b[1]?1:-1;
        let err=dx+dy;
        while(true) {
            this.rect(x,y,width,width,color);
            if(x===b[0]&&y===b[1])break;
            const twice=err*2;
            if(twice>=dy){err+=dy;x+=sx;}
            if(twice<=dx){err+=dx;y+=sy;}
        }
    }
    mask(points:readonly Point[]):Set<string> {
        const pixels=new Set<string>();
        for(let y=0;y<48;y++)for(let x=0;x<48;x++) {
            let inside=false;
            for(let i=0,j=points.length-1;i<points.length;j=i++) {
                const [a,b]=points[i],[c,d]=points[j];
                if((b>y+.5)!==(d>y+.5)&&x+.5<(c-a)*(y+.5-b)/(d-b)+a)inside=!inside;
            }
            if(inside)pixels.add(`${x},${y}`);
        }
        return pixels;
    }
    poly(points:readonly Point[],color:string) {this.add(color,this.mask(points));}
    bevel(points:readonly Point[],p:EquipmentPalette,metal=true) {
        const mask=this.mask(points),groups=new Map<string,Set<string>>();
        const xs=points.map(a=>a[0]),ys=points.map(a=>a[1]);
        const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        for(const key of mask) {
            const [x,y]=key.split(',').map(Number);
            const has=(dx:number,dy:number)=>mask.has(`${x+dx},${y+dy}`);
            const edge=!has(-1,0)||!has(1,0)||!has(0,-1)||!has(0,1);
            const left=!has(-2,0)||!has(0,-2),right=!has(2,0)||!has(0,2);
            const position=(x-minX)/(maxX-minX)+(y-minY)/(maxY-minY)*.45;
            const color=edge?p.ink:left?(metal?p.shine:p.lit):right?p.shade:position<.45?p.lit:position>1.05?p.shade:p.base;
            if(!groups.has(color))groups.set(color,new Set());
            groups.get(color)!.add(key);
        }
        for(const [color,pixels] of groups)this.add(color,pixels);
    }
    gem(x:number,y:number,r:number,p:EquipmentPalette) {
        this.poly([[x,y-r],[x+r,y-1],[x+r,y+1],[x,y+r],[x-r,y+1],[x-r,y-1]],p.ink);
        this.poly([[x,y-r+1],[x+r-1,y],[x,y+r-1],[x-r+1,y]],p.gem);
        this.poly([[x,y-r+1],[x,y],[x-r+1,y]],p.gemLight);
        this.line([x,y+1],[x,y+r-2],p.gemShade);
    }
    rivet(x:number,y:number,p:EquipmentPalette) {this.rect(x,y,2,2,p.goldShade);this.rect(x,y,1,1,p.goldLight);}
    trim(a:Point,b:Point,p:EquipmentPalette) {this.line(a,b,p.goldShade,2);this.line(a,b,p.goldLight);}
}
