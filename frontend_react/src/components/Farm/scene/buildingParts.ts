import {P} from './palette';
import {hash, hline, outline, px, rc, vline, type Canvas, type Ctx, type Sprite} from './pixel';

export type BuildingKind = 'coop' | 'barn';
/** 夜间光源：相对精灵画布左上角的位置与光晕半径。 */
export interface LightSource {x: number; y: number; r: number}
/** 建筑落脚范围，用于限制动物不走进建筑里。 */
export interface Footprint {w: number; h: number}
export interface BuildingSprite extends Sprite {lights: LightSource[]; foot: Footprint}
export interface GableOptions {up: number; lo: number; hw0: number; body: number; band: Record<'hi' | 'base' | 'lo' | 'line', string>; wall: Record<'base' | 'trim' | 'line' | 'shade', string>; btUp: number; btLo: number}
export interface GableInfo {rows: number[]; bodyTop: number; bh: number; n: number}
export interface DoorColors {door?: string; doorHi?: string; doorLo?: string}

/** 窗户：frame 外框 + 玻璃 + 十字格，lit 时暖黄 */
export function win(g: Ctx, x: number, y: number, w: number, h: number, lit: boolean, frame: string = P.c1, cross = true) {
    rc(g, x, y, w, h, frame);
    rc(g, x + 1, y + 1, w - 2, h - 2, lit ? P.y2 : P.a2);
    px(g, x + 1, y + 1, lit ? P.y1 : P.a1);
    if (!lit) hline(g, x + 1, y + h - 2, w - 2, P.a3);
    if (cross) { vline(g, x + (w >> 1), y + 1, h - 2, frame); if (h > 5) hline(g, x + 1, y + (h >> 1), w - 2, frame); }
}
export function hayBale(g: Ctx, x: number, y: number, w: number, h: number) {
    rc(g, x, y, w, h, P.y2); hline(g, x, y, w, P.y1); hline(g, x, y + h - 1, w, P.y3);
    for (let i = 3; i < w - 1; i += 4) vline(g, x + i, y, h, P.w3);
    for (let i = 1; i < w - 1; i += 2) if (hash(i, y, 5) > .5) px(g, x + i, y + 1 + (i % (h - 2)), P.y3);
    vline(g, x + w - 1, y, h, P.y3);
}
export function stoneStrip(g: Ctx, x: number, y: number, w: number, h: number) {
    rc(g, x, y, w, h, P.k2); hline(g, x, y, w, P.k1); hline(g, x, y + h - 1, w, P.k3);
    for (let r = 0; r < h - 1; r++) for (let i = (r % 2) * 3; i < w; i += 6) vline(g, x + i, y + 1 + r, 1, P.k3);
}
export function finish(c: Canvas, lights: LightSource[], foot: Footprint): BuildingSprite { const o = outline(c); return { c: o, ax: o.width >> 1, ay: o.height - 1, lights: (lights || []).map(l => ({ x: l.x + 1, y: l.y + 1, r: l.r })), foot }; }
/** 通用山墙谷仓 */
export function gableBarn(g: Ctx, cx_: number, y0: number, o: GableOptions): GableInfo {
    const rows: number[] = []; for (let i = 0; i < o.up; i++) rows.push(o.hw0 + 2 * i);
    let hw = rows[rows.length - 1]; for (let i = 0; i < o.lo; i++) { hw++; rows.push(hw); }
    const n = rows.length, B = o.band, W = o.wall;
    const inner = (i: number) => rows[i] - (i < o.up ? o.btUp : o.btLo);
    // 屋顶带（山墙外缘）
    for (let i = 0; i < n; i++) {
        const h = rows[i], y = y0 + i;
        hline(g, cx_ - h, y, h * 2 + 1, B.base); px(g, cx_ - h, y, B.hi); px(g, cx_ - h + 1, y, B.hi); px(g, cx_ + h, y, B.lo); px(g, cx_ + h - 1, y, B.lo);
        if (i === 0) hline(g, cx_ - h, y, h * 2 + 1, B.hi);
        // 瓦片分层线
        if (i % 3 === 2) for (let k = -h + 2; k < h - 1; k += 3) px(g, cx_ + k + (i % 2), y, B.line);
    }
    // 墙面（内缩 band 厚度）
    const bodyTop = y0 + n, bodyH = o.body;
    for (let i = 0; i < n; i++) { const h = inner(i); if (h < 0) continue; hline(g, cx_ - h, y0 + i, h * 2 + 1, W.base); px(g, cx_ - h, y0 + i, W.trim); px(g, cx_ + h, y0 + i, W.trim); }
    // 山墙与屋顶带交界的白线
    // 檐口
    const eh = hw + 1;
    hline(g, cx_ - eh, bodyTop, eh * 2 + 1, B.lo); hline(g, cx_ - eh, bodyTop, 2, B.base); 
    // 主体
    const bh = hw;
    rc(g, cx_ - bh, bodyTop + 1, bh * 2 + 1, bodyH, W.base);
    // 竖木板
    for (let y = y0 + 2; y < bodyTop + 1 + bodyH; y++) {
        const h = y < bodyTop ? inner(y - y0) : bh; if (h < 3) continue;
        for (let x = -h + 2; x < h - 1; x += 3) px(g, cx_ + x, y, W.line);
    }
    hline(g, cx_ - bh, bodyTop + 1, bh * 2 + 1, W.shade);                  // 檐下阴影
    hline(g, cx_ - bh, bodyTop + 2, bh * 2 + 1, W.line);
    // 白色墙角柱
    for (const s of [-1, 1]) { const x = s < 0 ? cx_ - bh : cx_ + bh - 1; rc(g, x, bodyTop + 1, 2, bodyH, P.c1); vline(g, s < 0 ? x : x + 1, bodyTop + 1, bodyH, s < 0 ? P.c1 : P.c2); }
    // 山墙两侧白线（屋顶带内缘）
    for (let i = 0; i < n; i++) { if (inner(i) < 0) continue; px(g, cx_ - inner(i), y0 + i, P.c1); px(g, cx_ + inner(i), y0 + i, P.c2); }
    return { rows, bodyTop, bh, n };
}
export function bigDoors(g: Ctx, x: number, y: number, w: number, h: number, o: DoorColors = {}) {   // 对开大门 + 白 X
    rc(g, x - 1, y - 1, w + 2, h + 1, P.c1); rc(g, x, y, w, h, o.door || P.r3);
    const lw = (w - 1) >> 1;
    for (const lx of [x, x + w - lw]) {
        hline(g, lx, y, lw, o.doorHi || P.r2);
        for (let t = 0; t < h; t++) { const k = Math.round(t * (lw - 1) / (h - 1)); px(g, lx + k, y + t, P.c1); px(g, lx + lw - 1 - k, y + t, P.c1); }
        hline(g, lx, y + h - 1, lw, o.doorLo || P.r4);
    }
    vline(g, x + lw, y, h, P.ink);}
