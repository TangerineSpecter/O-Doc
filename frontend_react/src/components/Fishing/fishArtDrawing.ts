import {PixelPainter} from '../Combat/art/pixelPainter';
import type {FishArtProfile} from './fishVisuals';

type BodyRow = readonly [y: number, left: number, right: number];
const bodies: Record<FishArtProfile['shape'], readonly BodyRow[]> = {
    round: [[10,15,21],[11,12,24],[12,10,26],[13,9,27],[14,9,28],[15,8,29],[16,8,29],[17,9,28],[18,9,28],[19,10,26],[20,12,24],[21,15,21]],
    deep: [[8,17,20],[9,14,23],[10,12,24],[11,11,25],[12,10,26],[13,9,27],[14,9,28],[15,8,29],[16,8,29],[17,9,28],[18,9,27],[19,10,26],[20,11,25],[21,12,24],[22,14,22],[23,17,20]],
    long: [[12,16,23],[13,11,26],[14,8,28],[15,7,30],[16,7,30],[17,8,29],[18,10,27],[19,14,24]],
    catfish: [[11,18,24],[12,13,27],[13,10,28],[14,8,29],[15,7,30],[16,7,30],[17,8,30],[18,10,28],[19,13,26],[20,17,23]],
};
const outline = '#4d4548';

function drawFins(g: PixelPainter, p: FishArtProfile) {
    // Broad stepped tail and small fins stay readable at the same scale as potion sprites.
    g.polygon([11,14,7,12,3,9,3,15,5,16,3,18,3,23,7,21,11,18], outline);
    g.polygon([9,15,7,14,5,12,5,15,7,16,5,19,5,21,8,19,10,17], p.fin);
    g.rect(5,13,1,2,p.light);
    if (p.shape === 'long') {
        g.polygon([12,14,12,9,15,11,18,9,21,12,24,13], outline);
        g.polygon([13,13,13,11,16,12,18,11,20,13], p.fin);
        g.polygon([16,18,18,23,22,20,24,18], outline);
        g.polygon([18,19,19,21,21,19], p.fin);
    } else {
        const top = p.shape === 'deep' ? 5 : 7;
        g.polygon([11,13,13,top,17,top+2,20,top,24,12], outline);
        g.polygon([13,12,14,top+2,17,top+4,20,top+2,22,12], p.fin);
        const bottom = p.shape === 'deep' ? 23 : 21;
        g.polygon([15,bottom-2,17,bottom+4,21,bottom,24,bottom-3], outline);
        g.polygon([17,bottom-1,18,bottom+2,21,bottom-1], p.fin);
    }
}

/** Same integer-grid painter as the 32 px potion art; no antialiasing or SVG. */
export function drawFishArt(ctx: CanvasRenderingContext2D, p: FishArtProfile) {
    ctx.clearRect(0,0,32,32);
    const g = new PixelPainter(ctx);
    g.ellipse(17,28,10,1,'#d6dfd5');
    drawFins(g,p);
    const rows = bodies[p.shape];
    const mask = new Set(rows.flatMap(([y,l,r]) => Array.from({length:r-l+1},(_,i) => `${l+i},${y}`)));
    const inside = (x: number,y: number) => mask.has(`${x},${y}`);
    const paint = (x: number,y: number,color: string,w=1,h=1) => {
        for (let dy=0;dy<h;dy++) for (let dx=0;dx<w;dx++) {
            if (inside(x+dx,y+dy) && inside(x+dx+1,y+dy) && inside(x+dx-1,y+dy)
                && inside(x+dx,y+dy+1) && inside(x+dx,y+dy-1)) g.rect(x+dx,y+dy,1,1,color);
        }
    };
    for (const [y,l,r] of rows) for (let x=l;x<=r;x++) {
        const edge = !inside(x-1,y) || !inside(x+1,y) || !inside(x,y-1) || !inside(x,y+1);
        g.rect(x,y,1,1,edge ? outline : y>=18 ? p.belly : p.color);
        if (!edge && y===rows[rows.length-2][0]) g.rect(x,y,1,1,p.shadow);
    }
    // Small clusters of shade, rather than gradients, match the hand-drawn loot icons.
    for (const [y,l,r] of rows.slice(2,5)) paint(l+2,y,p.light,Math.max(0,r-l-8));
    if (p.pattern === 'scales') {
        for (const [x,y] of [[12,14],[16,13],[20,14],[14,17],[18,16],[22,17]]) {
            paint(x,y,p.shadow); paint(x+1,y+1,p.light);
        }
    } else if (p.pattern === 'spots') {
        for (const [x,y] of [[12,14],[16,12],[17,16],[21,13],[22,18],[12,18]]) paint(x,y,p.shadow,2,2);
    } else if (p.pattern === 'stripes') {
        for (const x of [13,17,21]) {paint(x,11,p.shadow,2,4); paint(x+1,15,p.shadow,2,3);}
    } else {
        for (let x=11;x<24;x++) paint(x,16,p.light);
        if (p.shape === 'deep') {paint(14,18,p.fin,9,2);paint(17,20,p.belly,7);}
    }
    // Gill, pectoral fin, single square eye and tiny glint.
    paint(24,14,p.shadow,1,5);
    paint(19,18,p.shadow,4,2); paint(20,18,p.fin,2);
    paint(26,14,outline,2,2); paint(26,14,'#faf1d6');
    paint(28,17,p.shadow);
    if (p.whiskers) {
        g.line(28,19,30,21,outline); g.line(30,21,29,23,outline);
        if (p.shape === 'catfish') {g.line(26,20,26,24,outline);g.line(26,24,24,24,outline);}
    }
    if (p.king) {
        g.polygon([21,7,20,2,23,4,25,1,27,4,30,2,29,7],outline);
        g.polygon([22,6,22,4,24,5,25,3,27,5,29,4,28,6], '#e9b754');
        g.rect(22,7,7,1,'#b48241');g.rect(24,5,2,1,'#fff0ae');
        if (p.shape === 'deep') {g.rect(5,7,1,3,p.light);g.rect(4,8,3,1,p.light);}
    }
}
