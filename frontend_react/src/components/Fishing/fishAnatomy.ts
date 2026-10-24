import {PixelPainter} from '../Combat/art/pixelPainter';
import type {FishArtProfile} from './fishArtTypes';

type Shape = FishArtProfile['shape'];
const contours: Partial<Record<Shape, readonly number[]>> = {
    round: [7,15,11,11,18,10,24,11,28,13,30,16,28,20,23,22,15,23,9,20],
    carp: [6,16,11,11,19,9,25,11,29,14,30,18,26,21,17,23,9,21],
    royal_carp: [5,16,9,11,16,8,23,8,28,12,31,17,29,21,23,24,13,24,6,20],
    deep: [7,16,12,11,19,8,25,10,29,14,30,18,26,22,19,24,12,22,8,19],
    bream: [6,17,12,12,20,9,27,13,30,17,25,21,18,24,11,22],
    long: [6,16,12,13,22,12,28,14,31,16,28,19,18,20,10,18],
    ayu: [5,17,11,14,21,13,27,14,30,16,29,18,21,20,11,19],
    mullet: [6,17,12,13,23,13,29,14,30,17,28,20,16,21,9,19],
    trout: [5,17,12,13,21,11,27,12,30,15,30,18,26,20,17,21,10,20],
    whitefish: [6,17,11,14,20,13,25,14,28,16,31,18,28,20,19,21,10,19],
    grayling: [5,17,12,13,22,12,27,14,30,16,28,19,19,21,10,20],
    catfish: [5,17,13,13,22,12,28,13,31,16,30,20,24,22,13,21,6,19],
    royal_catfish: [5,18,11,13,19,10,27,10,31,14,31,21,26,24,14,23,7,21],
    wrasse: [6,17,12,12,20,10,25,10,28,13,29,16,31,18,28,21,21,23,12,22],
    royal_wrasse: [5,17,10,12,16,9,20,7,26,7,29,11,29,15,31,17,30,21,25,24,14,24,7,21],
    angler: [9,18,12,13,17,10,24,10,28,12,30,16,30,21,26,24,18,24,13,22],
    royal_angler: [8,18,9,13,13,9,21,7,27,9,30,13,31,18,30,23,25,25,16,25,10,22],
    chimaera: [7,18,12,14,18,11,23,12,31,14,30,16,26,16,24,20,18,22,12,20,8,19],
    knifefish: [4,20,10,13,17,8,22,9,27,13,30,17,29,20,22,23,13,23,6,22,4,21],
    snakehead: [5,18,10,14,22,13,28,13,31,15,31,19,27,21,17,21,8,20],
    noodlefish: [3,17,13,15,25,15,29,16,31,17,28,19,15,19,5,18],
    cod: [5,18,10,14,19,12,26,12,30,15,31,18,28,21,20,22,12,20,5,19],
    burbot: [4,19,10,15,20,13,27,14,30,16,31,18,28,21,20,22,12,21,5,20],
    grouper: [6,17,12,12,23,10,28,12,30,15,31,19,27,22,15,23,8,21],
    drum: [5,17,13,12,22,11,27,13,30,16,29,20,23,22,14,21,7,19],
    bass: [6,17,13,13,22,11,28,13,31,16,30,19,25,22,15,22,8,20],
    mandarin: [6,17,12,12,21,10,27,12,30,16,30,20,25,23,15,23,8,20],
    pike: [5,18,12,14,21,13,26,15,31,16,31,18,26,19,21,21,11,20],
    lanternfish: [5,18,13,15,20,11,26,11,30,14,31,18,27,21,20,22,13,20],
};

function inPolygon(points: readonly number[], x: number, y: number): boolean {
    let inside = false;
    for (let i=0,j=points.length-2;i<points.length;j=i,i+=2) {
        const [ax,ay,bx,by]=[points[i],points[i+1],points[j],points[j+1]];
        if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
    }
    return inside;
}

function centerline(shape: Shape, x: number): number {
    if (shape==='loach') return 17+Math.round(Math.sin((x-4)/24*Math.PI));
    if (shape==='royal_eel') return 17+Math.round(Math.sin((x-2)/26*Math.PI*1.6)*5);
    return 18+Math.round(Math.cos((x-2)/26*Math.PI)*5);
}

/** 鳗与泥鳅按连续中线生成实心身体，避免旧横向扫描表留下两片分叉轮廓。 */
export function fishBodyMask(shape: Shape): Set<string> {
    const mask=new Set<string>();
    for (let y=0;y<27;y++) for (let x=1;x<32;x++) {
        let inside: boolean;
        if (shape==='eel'||shape==='royal_eel'||shape==='loach') {
            const start=shape==='loach'?5:2, end=29;
            const radius=shape==='loach'?(x<9?1:2):x<7?1:x<14?2:3;
            inside=x>=start&&x<end&&Math.abs(y-centerline(shape,x))<=radius;
        } else inside=inPolygon(contours[shape]!,x+.5,y+.5);
        if (inside) mask.add(`${x},${y}`);
    }
    return mask;
}

export const fishOutline = (p: FishArtProfile) => p.shape==='noodlefish' ? p.shadow : '#45484b';

/** 鱼鳍先画、身体后覆盖；鱼类差异由尾型、鳍的位置和形状承担。 */
export function drawAnatomyFins(g: PixelPainter, p: FishArtProfile) {
    const {shape,fin,light}=p, ink=fishOutline(p);
    const finPolygon=(points: number[])=>{
        g.polygon(points,ink);
        // 一像素内侧色线保留鳍缘，避免整片鳍全变成黑轮廓。
        const xs=points.filter((_,i)=>i%2===0),ys=points.filter((_,i)=>i%2===1);
        const mx=xs.reduce((a,b)=>a+b)/xs.length,my=ys.reduce((a,b)=>a+b)/ys.length;
        g.polygon(points.map((n,i)=>Math.round(n*.72+(i%2?my:mx)*.28)),fin);
    };
    if (shape==='loach') {
        finPolygon([2,15,6,16,8,19,5,21,2,21]);
        finPolygon([15,16,17,12,21,15]);
        finPolygon([21,19,24,23,26,20]);
        return;
    }
    if (shape==='eel'||shape==='royal_eel') {
        for (let x=5;x<27;x++) {
            const radius=x<7?1:x<14?2:3, y=centerline(shape,x);
            g.rect(x,y-radius-1,1,2,fin);g.rect(x,y+radius,1,2,fin);
            if (x%4===0) g.rect(x,y-radius-1,1,1,light);
        }
        finPolygon([24,16,22,20,26,18]);
        return;
    }
    if (shape==='knifefish') {
        finPolygon([3,20,7,21,15,22,28,19,26,25,10,25,3,23]);
        for (let x=7;x<27;x+=3) g.line(x,22,x-1,24,light);
        finPolygon([15,11,17,6,20,10]);return;
    }
    if (shape==='angler'||shape==='royal_angler') {
        if (shape==='royal_angler') {
            g.line(1,24,12,21,ink,2);g.line(2,24,11,21,fin);
            finPolygon([11,13,8,8,15,10,18,7,22,11]);
        } else finPolygon([4,16,10,18,11,21,5,23,3,20]);
        finPolygon([16,21,13,25,20,23]);return;
    }
    if (shape==='chimaera') {
        g.line(1,24,10,18,ink,2);g.line(2,23,10,18,fin);
        finPolygon([12,15,15,4,19,13]);
        finPolygon([15,18,8,26,22,21]);return;
    }
    const rounded=['snakehead','catfish','royal_catfish','grouper','cod','burbot','wrasse','royal_wrasse'].includes(shape);
    const tail=shape==='royal_carp' ? [2,8,9,15,8,19,2,25,4,18,1,15]
        : shape==='royal_wrasse' ? [2,10,8,15,8,20,2,25,1,18]
        : rounded ? [2,13,7,15,8,19,4,23,1,21,1,15]
        : shape==='noodlefish' ? [1,15,6,17,1,20,2,17]
        : [1,11,7,15,8,19,1,24,3,18];
    finPolygon(tail);
    if (shape==='noodlefish') {g.line(16,15,18,12,fin);g.line(19,19,21,21,fin);return;}
    if (shape==='snakehead') {
        finPolygon([6,15,8,11,26,11,28,15]);finPolygon([9,20,24,20,23,23,10,23]);return;
    }
    if (shape==='grayling') {
        finPolygon([11,14,11,5,15,3,21,4,24,6,24,13]);
        for (let x=13;x<23;x+=3) g.line(x,6,x,12,light);
    } else if (shape==='cod') {
        for (const x of [8,15,22]) finPolygon([x,14,x+2,8,x+6,13]);
        finPolygon([9,20,20,20,18,24,11,23]);
    } else if (shape==='burbot') {
        finPolygon([7,16,8,12,13,12,15,15]);finPolygon([15,15,17,10,27,12,29,16]);
        finPolygon([9,20,26,20,25,24,10,23]);
    } else if (shape==='mullet') {
        finPolygon([10,14,12,8,16,13]);finPolygon([21,14,23,10,27,14]);
    } else if (shape==='ayu') {
        finPolygon([13,14,14,10,20,10,23,14]);g.rect(9,13,2,2,fin);
        finPolygon([18,19,22,23,24,19]);
    } else if (shape==='whitefish') {
        finPolygon([12,14,14,10,19,11,21,14]);finPolygon([17,20,20,23,23,19]);
    } else if (shape==='pike') {
        finPolygon([8,15,9,9,14,13]);finPolygon([7,20,12,20,11,25]);
    } else if (shape==='catfish'||shape==='royal_catfish') {
        finPolygon([14,14,15,7,20,12]);finPolygon([8,19,12,24,24,22]);
    } else if (shape==='wrasse'||shape==='royal_wrasse') {
        finPolygon([9,14,11,8,19,7,27,10,28,14]);finPolygon([11,21,23,21,21,25,12,24]);
    } else if (shape==='bass'||shape==='drum'||shape==='grouper'||shape==='mandarin') {
        finPolygon([9,14,10,7,12,10,14,7,16,10,18,8,22,10,27,13]);
        finPolygon([13,21,19,24,25,21]);
    } else {
        finPolygon([11,14,14,8,18,10,21,8,24,14]);
        finPolygon([14,20,18,25,23,20]);
    }
    if (['trout','whitefish','grayling'].includes(shape)) g.rect(9,12,3,2,fin);
}
