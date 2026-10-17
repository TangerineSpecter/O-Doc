import {P} from './palette';
import {cx, hash, hline, mk, outline, px, rc, vline, type Canvas, type Ctx} from './pixel';

export type PlotStage = 'empty' | 'seedling' | 'growing' | 'ripe';
/** 设计稿提供的四种作物精灵；游戏内其余作物按外观归并到这四种，见 cropMapping。 */
export type CropSprite = 'wheat' | 'tomato' | 'carrot' | 'pumpkin';
export interface PlotSprite {c: Canvas; ox: number; oy: number}

export const PLOT_W = 28, PLOT_H = 24, PLOT_HEAD = 10;

function soil(g: Ctx, x: number, y: number, w: number, h: number, wet: boolean) {
    const base = wet ? P.sw1 : P.s2, dark = wet ? P.sw2 : P.s3, light = wet ? P.s3 : P.s1;
    rc(g, x, y, w, h, base);
    // 垄：每 8px 一条，亮脊 + 暗沟
    for (let ry = 3; ry < h; ry += 8) { hline(g, x, y + ry, w, light); hline(g, x, y + ry + 1, w, base); hline(g, x, y + ry + 2, w, dark); }
    for (let i = 0; i < w * h; i++) { const sx = i % w, sy = (i / w) | 0, r = hash(sx, sy, wet ? 11 : 4); if (r > 0.93) px(g, x + sx, y + sy, dark); else if (r < 0.05) px(g, x + sx, y + sy, light); }
    if (wet) for (let i = 0; i < 6; i++) { const sx = Math.floor(hash(i, 3, 9) * (w - 2)), sy = Math.floor(hash(i, 5, 9) * (h - 2)); px(g, x + sx, y + sy, P.s2); }
}

/* ---- 作物：g 画布，(x,y)=底边中点，stage 1 幼苗 / 2 生长 / 3 成熟 ---- */
const CROP_DRAW: Record<CropSprite, (g: Ctx, x: number, y: number, st: number) => void> = {
    wheat(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x, y - 1, P.l2); px(g, x - 1, y - 2, P.l1); px(g, x + 1, y - 2, P.l1); return; }
        if (st === 2) { for (const [dx, h] of [[-2, 4], [0, 6], [2, 4]]) { vline(g, x + dx, y - h + 1, h, P.l3); px(g, x + dx, y - h, P.l1); px(g, x + dx + (dx < 0 ? -1 : 1), y - h + 2, P.l2); } px(g, x, y - 7, P.l1); return; }
        for (const [dx, h] of [[-4, 8], [-1, 10], [2, 8]]) {
            vline(g, x + dx, y - 3, 4, P.l3); vline(g, x + dx + 1, y - 2, 3, P.l4);                 // 秆
            rc(g, x + dx, y - h, 2, h - 3, P.y2); vline(g, x + dx, y - h, h - 3, P.y1); vline(g, x + dx + 1, y - h + 2, h - 5, P.y3);
            px(g, x + dx, y - h - 1, P.y1); px(g, x + dx + 1, y - h + 1, P.y1);
            for (let k = 1; k < h - 3; k += 2) px(g, x + dx + 1, y - h + k + 1, P.y1);           // 麦粒
            px(g, x + dx - 1, y - 2, P.l2);
        }
    },
    tomato(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x - 1, y - 1, P.l2); px(g, x + 1, y - 1, P.l2); px(g, x, y - 1, P.l3); return; }
        const bush = (rows: number[]) => rows.forEach((rw, i) => { const yy = y - rows.length + 1 + i; hline(g, x - (rw >> 1), yy, rw, P.l2); px(g, x - (rw >> 1), yy, P.l1); px(g, x - (rw >> 1) + rw - 1, yy, P.l3); if (i === rows.length - 1) hline(g, x - (rw >> 1), yy, rw, P.l3); });
        if (st === 2) { bush([3, 5, 5, 5]); px(g, x - 1, y - 4, P.l1); px(g, x + 1, y - 2, P.c1); px(g, x - 1, y - 1, P.y2); return; }
        
        bush([3, 5, 7, 7, 7, 5]);
        for (const [dx, dy] of [[-3, -3], [1, -3], [-1, -6]]) { rc(g, x + dx, y + dy, 3, 3, P.r2); px(g, x + dx, y + dy, P.r1); hline(g, x + dx, y + dy + 2, 3, P.r3); px(g, x + dx + 1, y + dy - 1, P.l4); }
    },
    carrot(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x - 1, y - 1, P.l1); px(g, x + 1, y - 1, P.l1); return; }
        const fan = (n: number) => { for (let i = -n; i <= n; i++) { const h = n * 2 - Math.abs(i) + 1; vline(g, x + i, y - h - 1, h, Math.abs(i) % 2 ? P.l2 : P.l3); px(g, x + i, y - h - 1, P.l1); } };
        if (st === 2) { fan(2); return; }
        fan(3); px(g, x - 3, y - 3, P.l1);
        rc(g, x - 2, y - 1, 5, 2, P.o2); hline(g, x - 2, y - 1, 5, P.o1); px(g, x + 2, y, P.r2);
    },
    pumpkin(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x, y - 1, P.l3); px(g, x - 2, y - 2, P.l2); px(g, x - 1, y - 2, P.l2); px(g, x + 1, y - 2, P.l2); px(g, x + 2, y - 2, P.l2); px(g, x - 1, y - 3, P.l1); return; }
        if (st === 2) { hline(g, x - 4, y - 1, 9, P.l3); rc(g, x - 4, y - 4, 4, 3, P.l2); px(g, x - 4, y - 4, P.l1); rc(g, x + 1, y - 3, 3, 2, P.l2); rc(g, x - 1, y - 2, 3, 2, P.l4); px(g, x, y - 2, P.l2); px(g, x + 3, y - 1, P.l1); return; }
        // 成熟：大南瓜 10x7
        const rows = [[3, 4], [1, 8], [0, 10], [0, 10], [0, 10], [1, 8], [2, 6]];
        rows.forEach(([o, w], i) => { const yy = y - 6 + i; hline(g, x - 5 + o, yy, w, P.o2); px(g, x - 5 + o, yy, P.o1); px(g, x - 5 + o + 1, yy, P.o1); px(g, x - 5 + o + w - 1, yy, P.r2); if (i > 4) hline(g, x - 5 + o, yy, w, P.r2); });
        for (const ox of [-2, 1]) vline(g, x + ox, y - 5, 5, P.r2);
        px(g, x - 3, y - 4, P.y3); px(g, x - 3, y - 3, P.y3);
        rc(g, x - 1, y - 8, 2, 2, P.l3); px(g, x + 1, y - 8, P.l2); px(g, x + 2, y - 9, P.l2); px(g, x - 1, y - 8, P.l4);
    }
};
const CROP_SLOTS: Record<CropSprite, number[]> = { wheat: [6, 14, 22], tomato: [6, 14, 22], carrot: [6, 14, 22], pumpkin: [8, 20] };
const CROP_ROWS = [10, 19];

const plotCache: Record<string, PlotSprite> = {};
/** 地块精灵：返回画布及地块左上角在画布中的偏移（上方留有作物探出头的空间）。 */
export function drawPlot(state: PlotStage, o: {crop?: CropSprite; wet?: boolean} = {}): PlotSprite {
    const crop = o.crop || 'wheat', wet = !!o.wet, key = state + crop + wet;
    if (plotCache[key]) return plotCache[key];
    const W = PLOT_W + 2, c = mk(W + 2, PLOT_H + PLOT_HEAD + 2), g = cx(c);
    const bed = mk(PLOT_W + 2, PLOT_H + 2), bg = cx(bed);
    if (state === 'empty') {
        // 空闲：浅色松土 + 虚线框 + "+"
        rc(bg, 1, 1, PLOT_W, PLOT_H, wet ? P.s2 : P.s1);
        for (let i = 0; i < 40; i++) { const sx = 2 + Math.floor(hash(i, 1, 6) * (PLOT_W - 3)), sy = 2 + Math.floor(hash(i, 2, 6) * (PLOT_H - 3)); px(bg, sx, sy, hash(i, 3, 6) > .5 ? (wet ? P.sw1 : P.s2) : (wet ? P.s1 : P.s1)); }
        for (let x = 3; x < PLOT_W - 1; x += 2) { px(bg, x, 3, P.c1); px(bg, x, PLOT_H - 2, P.c1); }
        for (let y = 3; y < PLOT_H - 1; y += 2) { px(bg, 3, y, P.c1); px(bg, PLOT_W - 2, y, P.c1); }
        const mx = 1 + (PLOT_W >> 1), my = 1 + (PLOT_H >> 1); rc(bg, mx - 3, my, 7, 1, P.c1); rc(bg, mx, my - 3, 1, 7, P.c1);
        g.drawImage(outline(bed, wet ? P.sw2 : P.s3), 0, PLOT_HEAD);
    } else {
        // 木框苗床
        const fx = 1, fy = 1;
        rc(bg, fx, fy, PLOT_W, PLOT_H, P.w3);
        hline(bg, fx, fy, PLOT_W, P.w1); hline(bg, fx, fy + 1, PLOT_W, P.w2); vline(bg, fx, fy, PLOT_H, P.w1); vline(bg, fx + 1, fy, PLOT_H, P.w2);
        hline(bg, fx, fy + PLOT_H - 1, PLOT_W, P.w4); hline(bg, fx + 1, fy + PLOT_H - 2, PLOT_W - 2, P.w3); vline(bg, fx + PLOT_W - 1, fy, PLOT_H, P.w4); vline(bg, fx + PLOT_W - 2, fy + 1, PLOT_H - 2, P.w3);
        soil(bg, fx + 2, fy + 2, PLOT_W - 4, PLOT_H - 4, wet);
        // 内沿暗线
        hline(bg, fx + 2, fy + 2, PLOT_W - 4, wet ? P.sw2 : P.s3); vline(bg, fx + 2, fy + 2, PLOT_H - 4, wet ? P.sw2 : P.s3);
        // 四角钉
        for (const [x, y] of [[fx + 1, fy + 1], [fx + PLOT_W - 3, fy + 1], [fx + 1, fy + PLOT_H - 3], [fx + PLOT_W - 3, fy + PLOT_H - 3]]) px(bg, x, y, P.w4);
        g.drawImage(outline(bed), 0, PLOT_HEAD);
        const st = state === 'seedling' ? 1 : state === 'growing' ? 2 : 3, slots = CROP_SLOTS[crop];
        for (const ry of CROP_ROWS) for (const sx of slots) CROP_DRAW[crop](g, sx + 2, ry + PLOT_HEAD + 1, st);
    }
    return (plotCache[key] = { c, ox: 1, oy: PLOT_HEAD + 1 });
}
/** 尚未购买的地块：草地上的奶油色虚线地界和淡淡的松土斑点，不含十字，与可种植的「空闲」地块区分。 */
export function drawLockedPlot(): PlotSprite {
    const key = 'locked';
    if (plotCache[key]) return plotCache[key];
    const c = mk(PLOT_W + 2, PLOT_H + PLOT_HEAD + 2), g = cx(c);
    const x0 = 1, y0 = PLOT_HEAD + 1;
    for (let i = 0; i < 30; i++) px(g, x0 + 3 + Math.floor(hash(i, 1, 8) * (PLOT_W - 6)), y0 + 3 + Math.floor(hash(i, 2, 8) * (PLOT_H - 6)), hash(i, 3, 8) > .5 ? P.g2 : P.g3);
    for (let x = 0; x < PLOT_W; x += 4) { hline(g, x0 + x, y0, 2, P.c1); hline(g, x0 + x, y0 + PLOT_H - 1, 2, P.c1); }
    for (let y = 0; y < PLOT_H; y += 4) { vline(g, x0, y0 + y, 2, P.c1); vline(g, x0 + PLOT_W - 1, y0 + y, 2, P.c1); }
    return (plotCache[key] = {c, ox: x0, oy: y0});
}
