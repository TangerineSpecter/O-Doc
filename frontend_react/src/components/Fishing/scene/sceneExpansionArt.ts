import {cx, ell, hash, mk, rc, type Ctx} from '../../Farm/scene/pixel';
import {drawTree} from '../../Farm/scene/treeSprites';
import {drawSign, drawLamp} from '../../Farm/scene/propSprites';
import type {FishingSpot} from '../spotVisuals';
import {palettes} from './spotPalettes';
import {SCENE_WIDTH, SCENE_HEIGHT, shoreX, stamp, pixelLine, reeds, pier} from './scenePrimitives';

function rock(g: Ctx, x: number, y: number, width: number, dark: string, light: string) {
    const height=Math.max(3,Math.min(14,Math.round(width*.6)));
    ell(g,x,y,width,Math.max(2,Math.round(height/3)),dark);
    rc(g,x-width+2,y-height,width*2-4,height,dark);
    rc(g,x-width+3,y-height-2,width*2-6,Math.max(2,height/2),light);
}
function pine(g: Ctx, x: number, y: number, snow = false) {
    stamp(g,drawTree('pine'),x,y);
    if (snow) for (let i=0;i<3;i++) {
        const width=8+i*5;rc(g,x-width,y-69+i*14,width*2,3,'#eaf1e8');
        rc(g,x-width+3,y-72+i*14,width*2-6,3,'#f5f5e7');
    }
}
function coral(g: Ctx, x: number, y: number, color: string) {
    pixelLine(g,x,y,x,y-20,color,4);pixelLine(g,x,y-8,x-10,y-16,color,3);
    pixelLine(g,x-10,y-16,x-11,y-25,color,3);pixelLine(g,x,y-13,x+9,y-20,color,3);
    pixelLine(g,x+9,y-20,x+9,y-28,color,3);rc(g,x-1,y-21,2,3,'#f2cfba');
}
function cliffPlatform(g: Ctx, color: string, light: string) {
    rc(g,165,179,139,40,color);rc(g,165,174,139,31,light);
    for (let x=176;x<300;x+=23) pixelLine(g,x,180,x+6,201,color);
    rc(g,165,205,139,5,color);rc(g,170,176,128,3,'#c1c8c1');
}

/** 岸线与人物锚点共用；每种水域独立布置地貌，避免仅替换底色。 */
export function buildExpansionBackground(spot: FishingSpot): HTMLCanvasElement {
    const c=mk(SCENE_WIDTH,SCENE_HEIGHT,true),g=cx(c),p=palettes[spot];
    rc(g,0,0,SCENE_WIDTH,SCENE_HEIGHT,p.water);
    for (let y=0;y<SCENE_HEIGHT;y+=3) {
        const edge=shoreX(y);
        rc(g,0,y,edge,3,p.grass);rc(g,edge,y,9,3,p.sand);
        rc(g,edge+9,y,5,3,p.light);rc(g,edge+14,y,10,3,p.deep);
        if (spot==='stream') rc(g,535+(edge-208),y,45,3,p.sand);
        if (spot==='trench') rc(g,edge-12,y,12,3,p.dark);
    }
    for (let i=0;i<850;i++) {
        const x=hash(i,71)*200,y=hash(i,72)*324;
        rc(g,x,y,i%3?2:4,2,i%4?p.dark:p.sand);
    }
    rc(g,112,0,26,324,p.sand);rc(g,114,174,67,30,p.sand);
    for (let y=6;y<324;y+=18) rc(g,116,y,18,2,p.grass);
    if (spot==='stream') {
        for (const [x,y] of [[34,76],[80,113],[168,72],[42,311],[174,325]]) pine(g,x,y);
        // 根系、河床卵石及对岸的小瀑布。
        pixelLine(g,170,73,200,94,'#715e47',4);pixelLine(g,182,82,196,72,'#715e47',3);
        for (let i=0;i<22;i++) rock(g,251+hash(i,74)*270,32+hash(i,75)*280,5+hash(i,76)*5,'#7a9d95','#bec9ad');
        rock(g,537,45,33,'#698d87','#a2b8a5');
        for (let x=515;x<554;x+=5) {rc(g,x,28,3,29,p.light);rc(g,x,30,1,33,'#e2f0d9');}
        ell(g,535,63,29,5,p.light);
    } else if (spot==='wetland') {
        for (const [x,y] of [[32,70],[164,102],[182,305],[49,317],[238,57],[249,283],[496,105],[524,295]]) reeds(g,x,y);
        rock(g,490,105,42,p.deep,'#8a9b78');
        rc(g,32,113,61,12,'#65594b');rc(g,36,110,52,4,'#a99b72');
        pixelLine(g,71,112,83,91,'#65594b',5);pixelLine(g,82,94,95,91,'#65594b',3);
        ell(g,443,267,29,5,p.deep);rc(g,425,260,37,4,'#9ba97c');
    } else if (spot==='bay') {
        for (const [x,y] of [[41,83],[172,113],[33,305],[187,310],[491,63],[524,272]]) rock(g,x,y,16,'#8f9b99','#b8c4bb');
        for (let i=0;i<19;i++) {
            const x=20+hash(i,81)*171,y=22+hash(i,82)*295;
            ell(g,x,y,3,2,'#fcf1ce');rc(g,x,y-2,1,3,'#bdac89');
        }
        // 远处潮线与岸边漂木。
        for (let y=25;y<320;y+=58) {rc(g,475,y,80,2,p.light);rc(g,486,y+4,51,1,p.light);}
        rc(g,37,119,57,7,'#a58c69');rc(g,42,117,48,2,'#d6bf91');
    } else if (spot==='reef') {
        for (const [x,y] of [[274,70],[482,129],[516,287],[408,304],[532,42]]) {
            ell(g,x,y,27,9,p.light);rock(g,x,y,13,'#78a9a0','#bed3b8');
            coral(g,x-8,y-4,'#c88f83');coral(g,x+13,y+2,'#b39ec0');
        }
        for (let i=0;i<15;i++) {const x=22+hash(i,85)*170,y=22+hash(i,86)*295;ell(g,x,y,3,2,'#fff4d6');}
        coral(g,51,101,'#cf9c87');coral(g,169,286,'#b6a2be');
    } else if (spot==='frost_lake') {
        for (const [x,y] of [[33,76],[80,113],[170,82],[44,312],[177,326]]) pine(g,x,y,true);
        for (const [x,y] of [[257,52],[480,98],[522,285],[330,301],[489,28]]) {
            ell(g,x,y,20,5,p.deep);rc(g,x-16,y-5,32,5,'#d0e6e4');rc(g,x-11,y-8,21,3,'#eaf3e9');
            pixelLine(g,x-3,y-6,x+3,y-1,'#96bac9');
        }
        rock(g,50,131,23,'#91aab3','#e7eee4');rock(g,180,269,17,'#91aab3','#e7eee4');
    } else if (spot==='hot_spring') {
        for (const [x,y] of [[38,72],[169,105],[45,306],[179,305],[495,55],[531,282]]) {
            rock(g,x,y,22,'#805d57','#bd8d70');
            rc(g,x-7,y-13,3,8,'#deb98c');rc(g,x+4,y-9,3,5,'#b8d1b1');
        }
        for (let y=0;y<324;y+=9) {rc(g,shoreX(y)-9,y,4,7,'#e0c29b');rc(g,shoreX(y)+2,y+2,4,5,'#d2d8ad');}
        ell(g,475,113,45,17,'#92c4b4');ell(g,475,113,33,11,p.light);
    } else if (spot==='trench') {
        for (const [x,y] of [[40,80],[174,112],[46,307],[173,307]]) rock(g,x,y,23,'#4c5d72','#92a0aa');
        for (const [x,y] of [[488,61],[541,129],[500,290]]) {
            ell(g,x,y,27,7,p.deep);rc(g,x-14,y-51,28,49,'#354c68');
            rc(g,x-9,y-57,19,9,'#667d91');rc(g,x-14,y-47,4,36,'#78909b');
        }
        for (let y=36;y<324;y+=43) rc(g,300+(y%4)*13,y,162,2,p.deep);
    }
    stamp(g,drawSign('fish'),159,158);stamp(g,drawLamp(spot==='trench'||spot==='wetland'),148,249);
    if (spot==='trench'||spot==='hot_spring') cliffPlatform(g,p.dark,p.sand);
    else pier(g);
    return c;
}

export function drawAtmosphere(g: Ctx, spot: FishingSpot, seconds: number) {
    if (spot==='wetland'||spot==='hot_spring') {
        const steam=spot==='hot_spring';
        for (let i=0;i<7;i++) {
            const x=254+hash(i,93)*260+Math.sin(seconds*.22+i)*12;
            const y=40+hash(i,95)*265-(steam?(seconds*4+i*11)%32:0);
            g.globalAlpha=steam?.14:.11;
            ell(g,x,y,steam?20:61,steam?7:5,'#e1e9d9');
        }
    } else if (spot==='trench') {
        for (let i=0;i<18;i++) {
            g.globalAlpha=.25+(Math.sin(seconds*.8+i)+1)*.18;
            const x=252+hash(i,97)*224,y=24+hash(i,99)*280;
            rc(g,x,y,2,2,'#b3e2d9');
        }
    }
    g.globalAlpha=1;
}
