import {P} from './palette';
import {mk, cx, flipH, hash, hline, outline, px, rc, vline, type Sprite} from './pixel';
import {lantern} from './shapes';
import {leafOutline} from './treeSprites';

const pondCache: Record<string, Sprite> = {};

/* ---------- 桥、睡莲、芦苇 ---------- */
/** 木栈桥（伸入池塘）。lit=夜晚点亮尽头的灯笼 */
export function drawPier(lit: boolean): Sprite {
    const k = 'pier' + lit; if (pondCache[k]) return pondCache[k];
    const L = 34, c = mk(18, L + 2), g = cx(c);
    // 纵梁
    rc(g, 1, 0, 2, L, P.w3); vline(g, 1, 0, L, P.w2); rc(g, 15, 0, 2, L, P.w4); vline(g, 15, 0, L, P.w3);
    // 桥面横板
    for (let y = 0; y < L; y += 3) { rc(g, 3, y, 12, 2, P.w2); hline(g, 3, y, 12, P.w1); hline(g, 3, y + 2, 12, P.w3); const sx = 3 + Math.floor(hash(y, 3, 4) * 10); px(g, sx, y + 1, P.w3); }
    // 栏杆柱
    for (const y of [2, 13, 24]) for (const x of [0, 15]) { rc(g, x, y, 3, 5, P.w2); vline(g, x, y, 5, P.w1); vline(g, x + 2, y, 5, P.w4); hline(g, x, y, 3, P.w1); hline(g, x, y + 4, 3, P.w4); }
    hline(g, 0, 7, 3, P.w3); vline(g, 1, 7, 7, P.w3); vline(g, 16, 7, 7, P.w4); vline(g, 1, 18, 7, P.w3); vline(g, 16, 18, 7, P.w4);
    // 尽头小平台 + 水桶 + 灯笼
    rc(g, 3, L - 3, 12, 3, P.w3); hline(g, 3, L - 3, 12, P.w2);
    rc(g, 13, L - 10, 3, 9, P.w2); vline(g, 13, L - 10, 9, P.w1); vline(g, 15, L - 10, 9, P.w4);
    lantern(g, 12, L - 15, lit); px(g, 14, L - 16, P.w4);
    rc(g, 4, L - 7, 4, 4, P.w3); hline(g, 4, L - 7, 4, P.w1); hline(g, 4, L - 5, 4, P.k3); px(g, 5, L - 8, P.w4); px(g, 6, L - 8, P.w4);
    return (pondCache[k] = { c: outline(c), ax: 9, ay: 0 });
}
export function drawLily(flower: boolean): Sprite {
    const k = 'ly' + flower; if (pondCache[k]) return pondCache[k];
    const c = mk(8, 5), g = cx(c);
    hline(g, 1, 0, 6, P.l2); hline(g, 0, 1, 8, P.l3); hline(g, 0, 2, 8, P.l3); hline(g, 1, 3, 6, P.l4); px(g, 5, 1, P.a2); px(g, 6, 1, P.a2); px(g, 1, 1, P.l1); px(g, 2, 0, P.l1);
    if (flower) { px(g, 3, 1, P.pk); px(g, 4, 1, P.c1); px(g, 3, 0, P.c1); px(g, 4, 2, P.y2); }
    return (pondCache[k] = { c, ax: 4, ay: 4 });
}
export function drawReed(): Sprite {
    if (pondCache.reed) return pondCache.reed;
    const c = mk(12, 16), g = cx(c);
    vline(g, 1, 6, 10, P.l3); px(g, 1, 5, P.l2); vline(g, 5, 2, 14, P.l2); vline(g, 10, 7, 9, P.l3); px(g, 10, 6, P.l2);
    px(g, 2, 9, P.l2); px(g, 3, 8, P.l1); px(g, 4, 11, P.l3); px(g, 7, 10, P.l2); px(g, 8, 9, P.l1); px(g, 9, 12, P.l3);
    rc(g, 4, 0, 3, 5, P.w3); vline(g, 4, 0, 5, P.w2); vline(g, 6, 1, 4, P.w4); px(g, 5, 0, P.w4);
    rc(g, 0, 3, 3, 3, P.w3); px(g, 0, 3, P.w2); px(g, 2, 5, P.w4);
    return (pondCache.reed = { c: outline(c, P.ink, leafOutline), ax: 6, ay: 16 });
}
export function drawKoi(dir: number): Sprite {
    const k = 'koi' + dir; if (pondCache[k]) return pondCache[k];
    const c = mk(9, 4), g = cx(c);
    hline(g, 2, 0, 5, P.o2); hline(g, 1, 1, 7, P.o2); hline(g, 2, 2, 5, P.o1); px(g, 4, 1, P.c1); px(g, 5, 1, P.c1); px(g, 8, 1, P.dk); px(g, 0, 0, P.o2); px(g, 0, 2, P.o2); px(g, 1, 1, P.o1);
    const cc = dir < 0 ? flipH(c) : c; return (pondCache[k] = { c: cc, ax: 4, ay: 2 });
}
