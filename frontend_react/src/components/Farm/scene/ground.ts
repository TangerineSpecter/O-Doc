import {P} from './palette';
import {cx, hash, hline, mk, px, rc, rng, type Canvas, type Ctx} from './pixel';
import {drawFlower, drawTuft, type FlowerKind} from './treeSprites';
import {CFG, SCENE_H, SCENE_W, inPath, inPond, plotRect, pondField, type SceneLayout} from './layout';

function cobble(x: number, y: number): string {
    const row = Math.floor((y + 2) / 5), ry = (y + 2) % 5, xo = Math.floor(hash(row, 1, 9) * 8) + row * 3;
    const sx = x + xo, col = Math.floor(sx / 9), rx = ((sx % 9) + 9) % 9, id = hash(col, row, 13);
    if (ry === 4) return P.p3;
    if (rx === 8) return P.p3;
    if (ry === 0 && id > 0.35 && rx > 0 && rx < 7) return P.p1;
    if (id > 0.82 && ry === 1 && rx === 1) return P.p1;
    return P.p2;
}

/* ---------- 地面预渲染 ---------- */
function dirtPatch(g: Ctx, x: number, y: number, rx: number, ry: number) {
    for (let j = -ry - 1; j <= ry + 1; j++) for (let i = -rx - 1; i <= rx + 1; i++) {
        const d = (i / rx) ** 2 + (j / ry) ** 2 + (hash(x + i, y + j, 31) - .5) * .25;
        if (d < 0.78) px(g, x + i, y + j, hash(x + i, y + j, 32) > .86 ? P.p3 : P.p2);
        else if (d < 1.0 && ((i + j) & 1) === 0) px(g, x + i, y + j, P.p2);
    }
}
function pondTile(x: number, y: number): string {
    const f = pondField(x, y);
    // 到岸边的距离近似：f 越接近 1 越靠岸
    if (f > 0.86) return P.a1;
    if (f > 0.7) return ((x + y) & 1) ? P.a1 : P.a2;
    if (f > 0.38) return P.a2;
    if (f > 0.26) return ((x + y) & 1) ? P.a2 : P.a3;
    return P.a3;
}
/** 地面层：草地、石板路、泥地、池塘与散落的花草，只在布局变化时重建。 */
export function buildGround(layout: SceneLayout): Canvas {
    const c = mk(SCENE_W, SCENE_H), g = cx(c), W = SCENE_W, H = SCENE_H;
    rc(g, 0, 0, W, H, P.g1);
    // 草地斑点（抖动）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const r = hash(x, y, 1), blotch = hash(x >> 3, y >> 3, 2);
        if (r < 0.055 + (blotch > .7 ? .07 : 0)) px(g, x, y, P.g2);
        else if (r > 0.965 - (blotch < .25 ? .05 : 0)) px(g, x, y, P.g3);
    }
    // 小块草簇：2px 横线对
    for (let i = 0; i < 90; i++) { const x = Math.floor(hash(i, 1, 41) * W), y = Math.floor(hash(i, 2, 41) * H); hline(g, x, y, 2, P.g2); px(g, x + 1, y + 1, P.g2); }
    // 路
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPath(x, y, layout)) {
        const edge = !inPath(x - 1, y, layout) || !inPath(x + 1, y, layout) || !inPath(x, y - 1, layout) || !inPath(x, y + 1, layout);
        px(g, x, y, edge ? P.p4 : cobble(x, y));
    }
    // 地面泥土块（建筑门口 / 饲槽下）
    const cp = CFG.coop, bp = CFG.barn;
    dirtPatch(g, cp.x, cp.y + 10, 26, 6); dirtPatch(g, 224, 50, 11, 6); dirtPatch(g, bp.x, bp.y + 10, 34, 8); dirtPatch(g, 222, 202, 12, 4);
    // 田地内土路 + 门口
    // 池塘
    if (layout === 'pond') for (let y = 120; y < 200; y++) for (let x = 0; x < 134; x++) {
        if (inPond(x, y)) px(g, x, y, pondTile(x, y));
        else {
            // 池沿：外 2px
            let near = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && inPond(x + dx, y + dy)) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)));
            if (near === 1) px(g, x, y, hash(x, y, 8) > .6 ? P.k2 : P.p3);
            else if (near === 2 && hash(x, y, 9) > .45) px(g, x, y, P.p2);
        }
    }
    // 池塘静态高光 & 深色波纹
    if (layout === 'pond') for (let i = 0; i < 40; i++) { const x = 20 + Math.floor(hash(i, 1, 51) * 98), y = 132 + Math.floor(hash(i, 2, 51) * 64); if (inPond(x, y) && inPond(x + 3, y) && pondField(x, y) < .8) { hline(g, x, y, 3, P.a1); } }
    // 栅栏缺口地面 & 其它花草（避开路/池塘/地块/围栏内部）
    const blocked = (x: number, y: number) => {
        if (inPath(x, y, layout) || inPath(x - 2, y, layout) || inPath(x + 2, y, layout) || inPath(x, y - 2, layout) || inPath(x, y + 2, layout)) return true;
        if (layout === 'pond' && pondField(x, y) < 1.35) return true;
        if (x > 2 && x < 164 && y > 4 && y < 110) return true;                    // 农田内
        if (layout === 'southField' && x > 2 && x < 164 && y > 117) return true;  // 南侧农田内
        const cpn = CFG.coopPen, bpn = CFG.barnPen;
        if (x > cpn.x - 2 && x < cpn.x + cpn.w + 2 && y < cpn.y + cpn.h + 4) return true;
        if (x > bpn.x - 2 && y > bpn.y - 2) return true;
        return false;
    };
    const rnd = rng(20261018);
    for (let i = 0; i < 160; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); if (!blocked(x, y)) { const t = drawTuft(); g.drawImage(t.c, x - t.ax, y - t.ay); } }
    const FL: FlowerKind[] = ['white', 'orange', 'purple', 'pink', 'yellow'];
    for (let i = 0; i < 70; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); if (!blocked(x, y)) { const f = drawFlower(FL[i % 5]); g.drawImage(f.c, x - f.ax, y - f.ay); } }
    // 田地和围栏内部的小花草（南侧农田仅在 southField 布局存在）
    const fields: [number, number, number, number][] = [[22, 82, 0, 8]];
    if (layout === 'southField') fields.push([128, 70, 8, 16]);
    for (const [top, span, from, to] of fields) for (let i = 0; i < 40; i++) {
        const x = 8 + Math.floor(rnd() * 156), y = top + Math.floor(rnd() * span);
        let ok = true;
        for (let k = from; k < to; k++) { const r = plotRect(k); if (x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 10 && y < r.y + r.h + 3) ok = false; }
        if (!ok || inPath(x, y, layout)) continue;
        if (i % 4 === 0) { const f = drawFlower(FL[i % 5]); g.drawImage(f.c, x - f.ax, y - f.ay); } else { const t = drawTuft(); g.drawImage(t.c, x - t.ax, y - t.ay); }
    }
    for (const pen of [CFG.coopPen, CFG.barnPen]) for (let i = 0; i < 22; i++) { const x = pen.x + 6 + Math.floor(rnd() * (pen.w - 14)), y = pen.y + 18 + Math.floor(rnd() * (pen.h - 34)); const t = drawTuft(); g.drawImage(t.c, x - t.ax, y - t.ay); }
    return c;}
