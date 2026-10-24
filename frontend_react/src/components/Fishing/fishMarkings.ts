import {PixelPainter} from '../Combat/art/pixelPainter';
import type {FishArtProfile} from './fishArtTypes';

export type FishPaint = (x: number, y: number, color: string, width?: number, height?: number) => void;

export function drawFishMarkings(g: PixelPainter, p: FishArtProfile, paint: FishPaint) {
    if (p.pattern==='scales') {
        for (const [x,y] of [[11,15],[15,13],[19,14],[13,18],[17,17],[22,19]]) {
            paint(x,y,p.shadow);paint(x+1,y+1,p.light);
        }
    } else if (p.pattern==='spots'||p.pattern==='marbled') {
        for (const [x,y] of [[11,15],[15,13],[18,16],[22,13],[24,19],[12,19]]) {
            paint(x,y,p.shadow,p.pattern==='marbled'?3:2,2);
            if (p.pattern==='marbled') paint(x+1,y+2,p.shadow,1,2);
        }
    } else if (p.pattern==='stripes') {
        for (const x of [11,15,19,23]) {paint(x,12,p.shadow,2,4);paint(x+1,16,p.shadow,2,4);}
    } else if (p.pattern==='rainbow') {
        for (let x=9;x<29;x++) paint(x,16,p.fin,1,2);
        for (const [x,y] of [[11,14],[15,12],[19,13],[23,12],[26,14],[17,19],[23,19]]) paint(x,y,p.shadow);
        for (const [x,y] of [[2,14],[4,16],[3,21]]) g.rect(x,y,1,1,p.shadow);
    } else if (p.pattern==='red_spots') {
        for (const [x,y] of [[11,16],[16,14],[21,17],[25,14],[17,19]]) {
            paint(x-1,y-1,p.belly,3,3);paint(x,y,p.fin);
        }
    } else if (p.pattern==='tail_eye') {
        paint(8,16,p.light,4,4);paint(9,17,'#39434a',2,2);
        for (let x=14;x<25;x+=3) paint(x,15,p.shadow);
    } else if (p.pattern==='ribbons') {
        for (let x=9;x<29;x++) {
            const y=13+(Math.floor(x/3)%3);
            paint(x,y,p.light);paint(x,y+4,p.fin);paint(x,y+7,p.light);
        }
    } else if (p.pattern==='embers') {
        for (let x=7;x<27;x+=4) {
            for (let y=10;y<26;y++) paint(x+(y%3===0?1:0),y,p.fin);
            paint(x+2,16,p.light,1,3);
        }
    } else if (p.pattern==='gill_patch') {
        paint(23,16,p.fin,3,3);for (let x=9;x<23;x++) paint(x,17,p.light);
    } else if (p.pattern==='lateral_lines') {
        for (const y of [15,18]) for (let x=8;x<26;x++) paint(x,y,p.shadow);
    } else if (p.pattern==='pearls') {
        for (const [x,y] of [[12,15],[16,13],[19,16],[23,12],[25,19],[15,20]]) paint(x,y,p.light);
    } else if (p.pattern==='moon') {
        for (let y=11;y<22;y++) paint(18+Math.round(Math.cos((y-16)/6)*4),y,p.light,2,1);
    } else for (let x=9;x<27;x++) paint(x,16,p.light);
    if (p.luminous) for (const x of [12,16,20,24]) paint(x,20,'#b9eae1');
}

export function drawFishFace(g: PixelPainter, p: FishArtProfile, paint: FishPaint, ink: string) {
    const shape=p.shape, eel=shape==='eel'||shape==='royal_eel';
    const small=shape==='loach'||shape==='noodlefish';
    const [ex,ey]=shape==='loach'?[26,17]:eel?[26,12]:shape==='chimaera'?[22,14]
        :shape==='angler'||shape==='royal_angler'?[23,12]:shape==='noodlefish'?[27,16]
        :shape==='lanternfish'?[26,14]:[26,15];
    const eyeSize=shape==='lanternfish'?3:small?1:2;
    g.rect(ex,ey,eyeSize,eyeSize,ink);
    if (!small) g.rect(ex,ey,1,1,'#fff5da');
    if (small) {
        if (shape==='loach') {
            g.line(28,19,30,20,ink);g.line(27,20,28,22,ink);g.line(26,20,25,22,ink);
            paint(28,19,ink);
        }
        return;
    }
    if (shape==='angler'||shape==='royal_angler') {
        const royal=shape==='royal_angler';
        g.polygon(royal?[21,15,30,13,30,23,22,21,20,18]:[23,16,29,14,29,22,24,21,22,19],ink);
        for (const x of royal?[22,25,28]:[24,27]) {
            g.polygon([x,15,x+1,15,x,royal?19:18],p.belly);
            g.polygon([x,21,x+1,21,x+1,royal?18:20],p.belly);
        }
        // 星灯渊王用高弧长杆与星形灯，普通鮟鱇用短弯杆与圆灯。
        const lx=royal?17:27,ly=royal?4:8;
        g.line(royal?16:20,10,royal?12:20,4,p.fin);
        g.line(royal?12:20,4,lx,royal?2:4,p.fin);g.line(lx,royal?2:4,lx,ly,p.fin);
        if (royal) {
            g.polygon([lx,ly-2,lx+1,ly,lx+3,ly+1,lx+1,ly+2,lx,ly+4,lx-1,ly+2,lx-3,ly+1,lx-1,ly],p.light);
            g.rect(lx,ly,1,2,'#eaffec');
            for (const x of [12,15,18]) paint(x,22,'#b9eae1',2,1);
        } else {g.rect(lx-1,ly,3,3,p.light);g.rect(lx,ly,1,1,'#eaffec');}
        return;
    }
    if (eel) {
        g.line(28,15,30,15,ink);g.line(24,15,23,17,p.shadow);
        return;
    }
    paint(24,16,p.shadow,1,4);paint(19,19,p.fin,3,2);
    if (shape==='wrasse'||shape==='royal_wrasse') {
        g.rect(29,17,2,3,p.fin);g.rect(29,18,2,1,p.light);
        if (shape==='royal_wrasse') paint(25,10,p.light,2,2);
    } else if (shape==='chimaera') g.line(24,18,26,18,ink);
    else paint(29,18,ink,2,1);
    if (p.whiskers) {
        g.line(29,20,31,22,ink);g.line(28,21,29,25,ink);
        if (shape==='royal_catfish') {
            g.line(27,21,26,26,ink);g.line(25,21,23,25,ink);
        }
    }
    if (shape==='burbot'||shape==='cod') g.line(28,21,28,23,p.fin);
}

export function drawFishSignature(g: PixelPainter, p: FishArtProfile) {
    if (p.crest==='leaf') {
        g.polygon([11,12,11,6,15,8,17,4,20,9,23,6,24,12],p.fin);g.line(13,8,22,11,p.light);
    } else if (p.crest==='wave') {
        g.polygon([10,13,11,7,14,9,17,4,20,7,23,5,26,13],p.fin);g.line(13,9,17,6,p.light);
    } else if (p.crest==='ice') {
        g.polygon([10,13,11,5,14,9,17,3,20,8,23,5,26,13],p.light);g.rect(17,5,1,5,p.belly);
    } else if (p.crest==='moss') {
        g.polygon([10,13,10,10,14,9,15,6,18,9,22,8,26,11,28,14],p.fin);
        g.rect(15,9,3,2,p.light);
    } else if (p.crest==='ribbon') {
        g.line(7,15,2,8,p.fin,2);g.line(8,20,2,25,p.light,2);
    }
    if (p.pattern==='moon') {
        g.polygon([3,9,8,14,7,20,2,25,4,18,2,14],p.light);
        g.line(14,22,11,26,p.light,2);
    }
}
