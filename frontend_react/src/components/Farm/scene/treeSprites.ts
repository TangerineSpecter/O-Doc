import {P} from './palette';
import {hash, hline, mk, cx, outline, px, rc, trim, vline, type Canvas, type Ctx, type Sprite} from './pixel';

export type TreeKind = 'orange' | 'green' | 'small' | 'pine' | 'bush' | 'berry';
export type FlowerKind = 'white' | 'orange' | 'purple' | 'pink' | 'yellow';

export const leafOutline = (r: number, g: number, b: number) => (g > r + 6 && g > b) ? P.l4 : P.ink;
function canopy(g: Ctx, discs: number[][], ox: number, oy: number, o: {leaves?: number} = {}) {
    const w = g.canvas.width, h = g.canvas.height, mask = new Uint8Array(w * h);
    let sx = 0, sy = 0, n = 0, minY = 1e9, maxY = -1;
    for (const [dx, dy, r] of discs) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) { const X = ox + dx + x, Y = oy + dy + y; if (X >= 0 && Y >= 0 && X < w && Y < h && !mask[Y * w + X]) { mask[Y * w + X] = 1; sx += X; sy += Y; n++; minY = Math.min(minY, Y); maxY = Math.max(maxY, Y); } }
    const cX = sx / n, cY = sy / n, R = (maxY - minY) / 2 + 2;
    const tones = [P.l1, P.l2, P.l3, P.l4];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
        let t = ((x - cX) * 0.55 + (y - cY) * 0.85) / R;     // 左上亮，右下暗
        t += (hash(x >> 1, y >> 1, 3) - 0.5) * 0.28;          // 叶团噪声
        const d = ((x + y) & 1) ? 0.07 : -0.07;               // 抖动
        t += d;
        px(g, x, y, t < -0.5 ? tones[0] : t < 0.05 ? tones[1] : t < 0.6 ? tones[2] : tones[3]);
    }
    // 叶片小弧线
    for (let i = 0; i < (o.leaves || 14); i++) { const x = Math.floor(hash(i, 1, 21) * w), y = Math.floor(hash(i, 2, 21) * h); if (mask[y * w + x] && mask[y * w + x + 2] && mask[(y + 1) * w + x + 1]) { px(g, x, y, P.l4); px(g, x + 1, y + 1, P.l4); px(g, x + 2, y, P.l4); } }
}
function trunk(g: Ctx, x: number, y: number, h: number, w = 5) {
    rc(g, x, y, w, h, P.w3); vline(g, x, y, h, P.w2); vline(g, x + w - 1, y, h, P.w4); px(g, x + 1, y + 2, P.w4); px(g, x + 1, y + 5, P.w2);
    px(g, x - 1, y + h - 1, P.w3); px(g, x + w, y + h - 1, P.w4); hline(g, x, y + h - 1, w, P.w4);
    rc(g, x, y, w, 2, P.l4);
}
const treeCache: Record<string, Sprite> = {};
export function drawTree(kind: TreeKind): Sprite {
    if (treeCache[kind]) return treeCache[kind];
    let c: Canvas, g: Ctx;
    if (kind === 'orange') {
        c = mk(26, 32); g = cx(c); trunk(g, 10, 20, 9, 5);
        canopy(g, [[12, 11, 9], [6, 13, 6], [18, 13, 6], [12, 7, 7]], 0, 0, { leaves: 18 });
        for (const [x, y] of [[7, 8], [13, 5], [17, 11], [10, 13], [5, 15], [14, 16], [19, 15]]) { rc(g, x, y, 2, 2, P.o2); px(g, x, y, P.o1); px(g, x + 1, y + 1, P.r2); }
    } else if (kind === 'green') {
        c = mk(30, 36); g = cx(c); trunk(g, 12, 24, 10, 5);
        canopy(g, [[14, 13, 11], [7, 17, 7], [22, 17, 7], [14, 8, 8]], 0, 0, { leaves: 24 });
    } else if (kind === 'small') {
        c = mk(20, 26); g = cx(c); trunk(g, 8, 16, 7, 4);
        canopy(g, [[10, 9, 7], [5, 11, 5], [15, 11, 5]], 0, 0, { leaves: 10 });
    } else if (kind === 'pine') {
        c = mk(20, 34); g = cx(c); trunk(g, 8, 25, 6, 4);
        const tiers = [[10, 3, 3], [10, 8, 5], [10, 14, 7], [10, 20, 9]];
        for (const [tx, ty, hw] of tiers) for (let i = 0; i < 8; i++) { const w = Math.min(hw, 1 + Math.floor(i * hw / 7)); const col = i < 2 ? P.l2 : i < 6 ? P.l3 : P.l4; hline(g, tx - w, ty + i, w * 2 + 1, col); px(g, tx - w, ty + i, P.l1); }
    } else if (kind === 'bush') {
        c = mk(18, 12); g = cx(c); canopy(g, [[9, 6, 5], [4, 7, 4], [14, 7, 4]], 0, 0, { leaves: 6 });
    } else {
        c = mk(18, 12); g = cx(c); canopy(g, [[9, 6, 5], [4, 7, 4], [14, 7, 4]], 0, 0, { leaves: 6 });
        for (const [x, y] of [[4, 5], [9, 3], [13, 6], [7, 8], [11, 8]]) { px(g, x, y, P.pk); px(g, x, y + 1, P.r2); }
    }
    const o = trim(outline(c, P.ink, leafOutline));
    return (treeCache[kind] = o);
}
export function drawFlower(kind: FlowerKind): Sprite {
    const k = 'f' + kind; if (treeCache[k]) return treeCache[k];
    const c = mk(5, 7), g = cx(c);
    px(g, 2, 6, P.l3); px(g, 2, 5, P.l3); px(g, 1, 5, P.l2); px(g, 3, 4, P.l2); px(g, 2, 4, P.l3);
    const cols = ({ white: [P.c1, P.y2], orange: [P.o2, P.y2], purple: [P.pu, P.y1], pink: [P.pk, P.y2], yellow: [P.y2, P.o2] } as Record<FlowerKind, string[]>)[kind];
    px(g, 2, 0, cols[0]); px(g, 1, 1, cols[0]); px(g, 3, 1, cols[0]); px(g, 2, 2, cols[0]); px(g, 2, 1, cols[1]);
    return (treeCache[k] = { c, ax: 2, ay: 6 });
}
export function drawTuft(): Sprite {
    if (treeCache.tuft) return treeCache.tuft;
    const c = mk(5, 4), g = cx(c);
    px(g, 0, 1, P.l3); px(g, 0, 2, P.l3); px(g, 1, 3, P.l3); px(g, 2, 0, P.l3); px(g, 2, 1, P.l3); px(g, 2, 2, P.l3); px(g, 2, 3, P.l3); px(g, 4, 1, P.l3); px(g, 4, 2, P.l3); px(g, 3, 3, P.l3);
    return (treeCache.tuft = { c, ax: 2, ay: 3 });
}