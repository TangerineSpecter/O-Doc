import {PixelPainter} from '../Combat/art/pixelPainter';
import type {FishArtProfile} from './fishArtTypes';
import {drawAnatomyFins, fishBodyMask, fishOutline} from './fishAnatomy';
import {drawFishFace, drawFishMarkings, drawFishSignature, type FishPaint} from './fishMarkings';

/** 32×32整数像素：先解剖轮廓，再物种纹样、器官和鱼王标识。各展示入口复用。 */
export function drawFishArt(ctx: CanvasRenderingContext2D, p: FishArtProfile) {
    ctx.clearRect(0,0,32,32);
    const g=new PixelPainter(ctx), ink=fishOutline(p), mask=fishBodyMask(p.shape);
    const inside=(x: number,y: number)=>mask.has(`${x},${y}`);
    g.ellipse(17,28,10,1,'#d6dfd5');
    drawAnatomyFins(g,p);
    for (let x=1;x<32;x++) {
        const ys=Array.from({length:27},(_,y)=>y).filter(y=>inside(x,y));
        if (!ys.length) continue;
        const top=ys[0],bottom=ys[ys.length-1];
        for (const y of ys) {
            const edge=!inside(x-1,y)||!inside(x+1,y)||!inside(x,y-1)||!inside(x,y+1);
            const color=edge?ink:y>top+(bottom-top)*.65?p.belly:y<top+(bottom-top)*.35?p.light:p.color;
            g.rect(x,y,1,1,color);
            if (!edge&&y===bottom-1) g.rect(x,y,1,1,p.shadow);
        }
    }
    const paint: FishPaint=(x,y,color,width=1,height=1)=>{
        for (let dy=0;dy<height;dy++) for (let dx=0;dx<width;dx++) {
            if (inside(x+dx,y+dy)&&inside(x+dx-1,y+dy)&&inside(x+dx+1,y+dy)) g.rect(x+dx,y+dy,1,1,color);
        }
    };
    drawFishMarkings(g,p,paint);
    drawFishFace(g,p,paint,ink);
    drawFishSignature(g,p);
    if (p.king) {
        // 鮟鱇的皇冠置于尾侧，给额前灯杆与星灯留出独立轮廓。
        const x=p.shape==='royal_angler'?3:22;
        g.polygon([x,6,x-1,1,x+2,3,x+4,0,x+6,3,x+9,1,x+8,6],ink);
        g.polygon([x+1,5,x+1,3,x+3,4,x+4,2,x+6,4,x+8,3,x+7,5],'#e9b754');
        g.rect(x+1,6,7,1,'#b48241');
    }
}
