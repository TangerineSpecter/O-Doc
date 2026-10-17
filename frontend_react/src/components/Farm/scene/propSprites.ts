import {P} from './palette';
import {ell, mk, cx, hline, outline, px, rc, vline, type Sprite} from './pixel';
import {hayBale} from './buildingParts';

export type SignIcon = 'egg' | 'cow' | 'wheat' | 'fish';
export type TroughKind = 'feed' | 'water';

const propCache: Record<string, Sprite> = {};

/* 路牌：icon = 'egg' | 'cow' | 'wheat' | 'fish' */
export function drawSign(icon: SignIcon): Sprite {
    const k = 'sg' + icon; if (propCache[k]) return propCache[k];
    const c = mk(14, 18), g = cx(c);
    rc(g, 6, 8, 2, 9, P.w3); vline(g, 6, 8, 9, P.w2);
    rc(g, 0, 0, 14, 9, P.w2); hline(g, 0, 0, 14, P.w1); hline(g, 0, 8, 14, P.w4); vline(g, 13, 0, 9, P.w3); vline(g, 0, 0, 9, P.w1);
    rc(g, 2, 2, 10, 5, P.c2); hline(g, 2, 2, 10, P.c1); hline(g, 2, 6, 10, P.c3);
    px(g, 1, 1, P.w4); px(g, 12, 1, P.w4); px(g, 1, 7, P.w4); px(g, 12, 7, P.w4);
    if (icon === 'egg') { rc(g, 5, 3, 4, 3, P.y2); px(g, 6, 2, P.y2); px(g, 7, 2, P.y2); px(g, 5, 3, P.y1); hline(g, 5, 5, 4, P.y3); }
    if (icon === 'cow') { rc(g, 4, 3, 6, 3, P.c1); px(g, 5, 3, P.w4); px(g, 6, 4, P.w4); px(g, 8, 3, P.w4); px(g, 9, 4, P.pk); px(g, 3, 3, P.c3); px(g, 10, 3, P.c3); }
    if (icon === 'wheat') { for (const x of [4, 6, 8]) { vline(g, x, 3, 3, P.y3); px(g, x, 2, P.y2); } hline(g, 3, 5, 7, P.l3); }
    if (icon === 'fish') { rc(g, 4, 3, 5, 2, P.a3); px(g, 9, 2, P.a3); px(g, 9, 5, P.a3); px(g, 5, 3, P.c1); }
    return (propCache[k] = { c: outline(c), ax: 7, ay: 18 });
}
/** 路灯：lit=true 点亮 */
export function drawLamp(lit: boolean): Sprite {
    const k = 'lamp' + lit; if (propCache[k]) return propCache[k];
    const c = mk(9, 22), g = cx(c);
    rc(g, 4, 8, 2, 13, P.k3); vline(g, 4, 8, 13, P.k2); rc(g, 3, 19, 4, 3, P.k3); hline(g, 3, 19, 4, P.k2);
    rc(g, 2, 2, 6, 7, P.k3); rc(g, 3, 3, 4, 5, lit ? P.y2 : P.a1); rc(g, 3, 3, 2, 2, P.c1); if (lit) px(g, 5, 5, P.y1); else px(g, 5, 6, P.a2);
    hline(g, 1, 1, 8, P.k2); hline(g, 2, 0, 6, P.k1); px(g, 4, 0, P.k1);
    return (propCache[k] = { c: outline(c), ax: 5, ay: 23 });
}
export function drawTrough(kind: TroughKind): Sprite {   // 'feed' 饲料槽 | 'water' 水槽
    const k = 'tr' + kind; if (propCache[k]) return propCache[k];
    const c = mk(20, 9), g = cx(c);
    rc(g, 0, 1, 20, 8, P.w3); hline(g, 0, 1, 20, P.w1); hline(g, 0, 2, 20, P.w2); hline(g, 0, 8, 20, P.w4); vline(g, 19, 1, 8, P.w4); vline(g, 0, 1, 8, P.w2);
    rc(g, 2, 3, 16, 3, P.w4); hline(g, 2, 3, 16, P.s3);                                     // 凹槽内部
    if (kind === 'water') { rc(g, 2, 3, 16, 2, P.a2); hline(g, 2, 3, 16, P.a1); px(g, 6, 4, P.a1); px(g, 13, 4, P.c1); hline(g, 2, 5, 16, P.a3); }
    else { hline(g, 2, 4, 16, P.y2); hline(g, 2, 5, 16, P.y3); for (let x = 3; x < 17; x += 3) px(g, x, 4, P.y1); hline(g, 4, 3, 5, P.y2); hline(g, 11, 3, 4, P.y1); }
    rc(g, 1, 7, 3, 2, P.w4); rc(g, 16, 7, 3, 2, P.w4); px(g, 3, 6, P.w4); px(g, 16, 6, P.w4);
    return (propCache[k] = { c: outline(c), ax: 11, ay: 11 });
}
export function drawHay(n: number): Sprite {
    const k = 'hay' + n; if (propCache[k]) return propCache[k];
    const c = mk(18, 17), g = cx(c);
    hayBale(g, 0, 8, 10, 8); hayBale(g, 9, 9, 9, 7); if (n > 1) hayBale(g, 3, 1, 10, 8);
    return (propCache[k] = { c: outline(c), ax: 10, ay: 18 });
}
export function drawBarrel(): Sprite {
    if (propCache.barrel) return propCache.barrel;
    const c = mk(9, 11), g = cx(c);
    rc(g, 0, 1, 9, 9, P.w3); vline(g, 1, 1, 9, P.w2); vline(g, 2, 1, 9, P.w2); vline(g, 7, 1, 9, P.w4); vline(g, 8, 1, 9, P.w4);
    hline(g, 1, 0, 7, P.w2); ell(g, 4, 1, 4, 1, P.w1); hline(g, 0, 3, 9, P.k3); hline(g, 0, 7, 9, P.k3); hline(g, 0, 3, 3, P.k2); hline(g, 0, 7, 3, P.k2);
    return (propCache.barrel = { c: outline(c), ax: 5, ay: 12 });
}
export function drawScarecrow(): Sprite {
    if (propCache.sc) return propCache.sc;
    const c = mk(16, 24), g = cx(c);
    vline(g, 8, 8, 15, P.w3); vline(g, 7, 8, 15, P.w2); hline(g, 1, 11, 14, P.w3); hline(g, 1, 10, 14, P.w2);
    rc(g, 5, 11, 6, 8, P.r2); hline(g, 5, 11, 6, P.r1); vline(g, 10, 11, 8, P.r3); px(g, 7, 14, P.y2); px(g, 8, 16, P.y2);   // 衣服+补丁
    rc(g, 5, 3, 6, 6, P.c2); hline(g, 5, 3, 6, P.c1); vline(g, 10, 3, 6, P.c3); px(g, 6, 5, P.dk); px(g, 9, 5, P.dk); hline(g, 7, 7, 2, P.r3);
    rc(g, 3, 2, 10, 2, P.w3); hline(g, 3, 2, 10, P.w2); rc(g, 5, 0, 6, 3, P.w3); hline(g, 5, 0, 6, P.w2); hline(g, 5, 2, 6, P.r2);
    px(g, 1, 12, P.y2); px(g, 0, 13, P.y2); px(g, 14, 12, P.y2); px(g, 15, 13, P.y2); px(g, 2, 12, P.y3); px(g, 13, 12, P.y3); px(g, 6, 19, P.y2); px(g, 9, 19, P.y2);
    return (propCache.sc = { c: outline(c), ax: 9, ay: 25 });
}