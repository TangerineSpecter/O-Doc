import {getBuilding} from './buildings';
import {drawPlot, drawLockedPlot} from './cropSprites';
import type {WeatherOverlay} from './effects';
import {drawFenceH, drawFenceV} from './fenceSprites';
import {CFG, PLOT_SLOTS, PROPS, SCENE_H, SCENE_W, plotRect, type Rect, type SceneLayout} from './layout';
import {inPond, pondField} from './layout';
import {hash, px, type Ctx, type Sprite} from './pixel';
import {drawBarrel, drawHay, drawLamp, drawScarecrow, drawSign, drawTrough} from './propSprites';
import {drawKoi, drawLily, drawPier, drawReed} from './pondSprites';
import {drawResident} from './residentSprite';
import {P} from './palette';
import {YOUNG_PREFIX, type SceneSimulation} from './simulation';
import {drawTree} from './treeSprites';
import type {SceneSelection, SceneState} from './types';

/** 一帧绘制后的可点选区域，按前后顺序排列（越靠后越在上层）。focus 是悬停时四角括号描边的范围。 */
export interface HitBox {box: Rect; focus: Rect; selection: SceneSelection}
export interface SceneFrame {
    ground: HTMLCanvasElement;
    state: SceneState;
    sim: SceneSimulation;
    weather: WeatherOverlay;
    layout: SceneLayout;
    hover: SceneSelection | null;
}
interface Item {y: number; draw: () => void; hit?: HitBox}

const sameSelection = (a: SceneSelection | null, b: SceneSelection) => !!a && a.kind === b.kind && a.id === b.id;

/** 以内容左上角定位（描边外扩 1px）。 */
const blit = (g: Ctx, s: Sprite, x: number, y: number) => g.drawImage(s.c, x - 1, y - 1);
const place = (g: Ctx, s: Sprite, x: number, y: number) => g.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay));
const spriteBox = (s: Sprite, x: number, y: number, pad = 0): Rect => ({x: Math.round(x - s.ax) - pad, y: Math.round(y - s.ay) - pad, w: s.c.width + pad * 2, h: s.c.height + pad * 2});

function star(g: Ctx, x: number, y: number, big: boolean) {
    g.fillStyle = P.c1;
    if (big) { g.fillRect(x, y - 2, 1, 5); g.fillRect(x - 2, y, 5, 1); g.fillStyle = P.y2; g.fillRect(x, y, 1, 1); }
    else { g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 1, y, 3, 1); }
}

/** 悬停描边：四个角各画一对 3px 的像素括号。 */
function drawFocus(g: Ctx, r: Rect) {
    g.fillStyle = P.c1;
    for (const [cx, cy, dx, dy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
        g.fillRect(cx, cy, 3 * dx > 0 ? 3 : -3, 1);
        g.fillRect(cx, cy, 1, 3 * dy > 0 ? 3 : -3);
    }
}

function fences(g: Ctx, layout: SceneLayout): Item[] {
    const items: Item[] = [], add = (y: number, draw: () => void) => items.push({y, draw});
    const F = CFG.field, S = CFG.southField;
    add(F.y + 13, () => blit(g, drawFenceH(F.w), F.x, F.y));
    const gateX = F.gateX ?? 0, gateW = F.gateW ?? 0, rightX = gateX + gateW;
    add(F.y + F.h, () => blit(g, drawFenceH(gateX - F.x), F.x, F.y + F.h - 13));
    add(F.y + F.h, () => blit(g, drawFenceH(F.x + F.w - rightX), rightX, F.y + F.h - 13));
    add(F.y + F.h - 1, () => blit(g, drawFenceV(F.h - 13), F.x - 1, F.y + 12));
    add(F.y + F.h - 1, () => blit(g, drawFenceV(F.h - 13), F.x + F.w - 4, F.y + 12));
    if (layout === 'southField') {
        add(S.y + S.h, () => blit(g, drawFenceH(S.w), S.x, S.y + S.h - 13));
        add(S.y + S.h - 1, () => blit(g, drawFenceV(S.h - 13), S.x - 1, S.y + 12));
        add(S.y + S.h - 1, () => blit(g, drawFenceV(S.h - 13), S.x + S.w - 4, S.y + 12));
    }
    for (const pen of [CFG.coopPen, CFG.barnPen]) {
        const bot = pen.y + pen.h - 13;
        add(pen.y + 13, () => blit(g, drawFenceH(pen.w), pen.x, pen.y));
        add(bot + 13, () => blit(g, drawFenceH(pen.w), pen.x, bot));
        add(bot + 11, () => blit(g, drawFenceV(pen.gate[0] - (pen.y + 12)), pen.x - 1, pen.y + 12));
        add(bot + 12, () => blit(g, drawFenceV(bot - pen.gate[1] + 1), pen.x - 1, pen.gate[1]));
        add(bot + 12, () => blit(g, drawFenceV(bot - (pen.y + 12) + 1), pen.x + pen.w - 4, pen.y + 12));
    }
    return items;
}

function plots(g: Ctx, f: SceneFrame): Item[] {
    const {state, sim, layout} = f, items: Item[] = [];
    const slots = layout === 'southField' ? PLOT_SLOTS : 8;
    for (let i = 0; i < slots; i++) {
        const r = plotRect(i), p = state.plots[i];
        const selection: SceneSelection = {kind: 'plot', id: p.id};
        items.push({
            y: r.y + r.h,
            draw: () => {
                const s = p.owned ? drawPlot(p.stage, {crop: p.crop, wet: state.rain || p.wet}) : drawLockedPlot();
                g.drawImage(s.c, r.x - s.ox, r.y - s.oy);
                if (p.owned && p.stage === 'ripe') {
                    const ph = ((sim.tickN >> 2) + i * 3) % 8;
                    if (ph < 2) star(g, r.x + r.w - 2 + (i % 2 ? -18 : 0), r.y - 5, ph === 0);
                    else if (ph === 4 || ph === 5) star(g, r.x + 5 + (i % 3) * 5, r.y - 1 + (i % 2) * 2, ph === 4);
                }
            },
            hit: p.owned ? {box: {x: r.x - 2, y: r.y - 6, w: r.w + 4, h: r.h + 8}, focus: {x: r.x - 2, y: r.y - 2, w: r.w + 3, h: r.h + 3}, selection} : undefined,
        });
    }
    return items;
}

function buildings(g: Ctx, f: SceneFrame): Item[] {
    const {state} = f, items: Item[] = [];
    for (const kind of ['coop', 'barn'] as const) {
        const s = getBuilding(kind, kind === 'coop' ? state.coop : state.barn, state.night), a = CFG[kind];
        const box = spriteBox(s, a.x, a.y);
        items.push({y: a.y, draw: () => place(g, s, a.x, a.y), hit: {box, focus: {x: box.x, y: box.y, w: box.w - 1, h: box.h - 1}, selection: {kind: 'building', id: kind}}});
    }
    return items;
}

function props(g: Ctx, f: SceneFrame): Item[] {
    const {state, layout} = f, night = state.night, items: Item[] = [];
    const add = (y: number, draw: () => void) => items.push({y, draw});
    // 围场内的草垛、食槽、水槽和木桶
    add(34, () => place(g, drawHay(2), 209, 34)); add(40, () => place(g, drawTrough('feed'), 234, 40)); add(70, () => place(g, drawTrough('water'), 208, 70));
    add(134, () => place(g, drawHay(2), 207, 135)); add(197, () => place(g, drawTrough('feed'), 219, 197)); add(197, () => place(g, drawBarrel(), 305, 197));
    for (const [k, x, y] of PROPS.signs) add(y, () => place(g, drawSign(k), x, y));
    for (const [x, y] of PROPS.lamps) add(y, () => place(g, drawLamp(night), x, y));
    if (layout !== 'pond') return items;
    for (const [k, x, y] of [...PROPS.pond.trees, ...PROPS.pond.bushes]) add(y, () => place(g, drawTree(k), x, y));
    for (const [x, y] of PROPS.pond.lamps) add(y, () => place(g, drawLamp(night), x, y));
    add(CFG.pier.y + 34, () => { const s = drawPier(night); g.drawImage(s.c, CFG.pier.x - s.ax, CFG.pier.y); });
    add(PROPS.pond.scarecrow[1], () => place(g, drawScarecrow(), PROPS.pond.scarecrow[0], PROPS.pond.scarecrow[1]));
    for (const [x, y] of PROPS.pond.reeds) add(y, () => place(g, drawReed(), x, y));
    return items;
}

function creatures(g: Ctx, f: SceneFrame): Item[] {
    const {sim, state} = f, items: Item[] = [];
    for (const c of sim.critters) {
        const s = c.sprite(), box = spriteBox(s, c.x, c.y, 2);
        const selectable = c.id !== null && !c.id.startsWith(YOUNG_PREFIX);
        items.push({
            y: c.y,
            draw: () => place(g, s, c.x, c.y),
            hit: selectable ? {box, focus: {x: box.x + 1, y: box.y + 1, w: box.w - 3, h: box.h - 3}, selection: {kind: 'animal', id: c.id as string}} : undefined,
        });
    }
    const r = sim.resident;
    items.push({y: r.y, draw: () => place(g, drawResident(r.dir, {leg: r.leg}, state.look), r.x, r.y)});
    return items;
}

/** 池塘水面：睡莲、锦鲤、闪光和雨点涟漪（仅池塘布局）。 */
function drawPond(g: Ctx, sim: SceneSimulation) {
    const t = sim.tickN;
    for (const [x, y, flower] of [[44, 172, 1], [60, 182, 0], [96, 170, 1], [100, 180, 0], [34, 184, 0]]) g.drawImage(drawLily(!!flower).c, x - 4, y - 4);
    for (const [cxk, cyk, rx, ry, sp, ph] of [[60, 174, 22, 6, 0.011, 0], [100, 162, 10, 4, 0.016, 2]]) {
        const a = t * sp + ph, x = cxk + Math.cos(a) * rx, y = cyk + Math.sin(a * 2) * ry, dir = -Math.sin(a) > 0 ? 1 : -1;
        if (inPond(Math.round(x), Math.round(y))) g.drawImage(drawKoi(dir).c, Math.round(x) - 4, Math.round(y) - 2);
    }
    for (let i = 0; i < 14; i++) {
        const x = 24 + Math.floor(hash(i, 1, 61) * 92), y = 134 + Math.floor(hash(i, 2, 61) * 58);
        if (pondField(x, y) < .75 && ((t + i * 7) % 24) < 3) px(g, x, y, P.c1);
    }
    g.fillStyle = P.a1;
    for (const r of sim.ripples) {
        const rr = 1 + r.t * .8;
        for (let a = 0; a < 16; a++) {
            const x = Math.round(r.x + Math.cos(a / 16 * 6.283) * rr * 1.6), y = Math.round(r.y + Math.sin(a / 16 * 6.283) * rr * .7);
            if (inPond(x, y)) g.fillRect(x, y, 1, 1);
        }
    }
}

/** 画完整的一帧，返回本帧可点选区域供鼠标命中检测使用。 */
export function drawScene(g: Ctx, f: SceneFrame): HitBox[] {
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, SCENE_W, SCENE_H);
    g.drawImage(f.ground, 0, 0);
    if (f.layout === 'pond') drawPond(g, f.sim);
    const items = [...fences(g, f.layout), ...plots(g, f), ...buildings(g, f), ...props(g, f), ...creatures(g, f)];
    // 稳定排序：纵坐标小的先画，同一纵坐标保持加入顺序。
    items.sort((a, b) => a.y - b.y);
    const hits: HitBox[] = [];
    for (const it of items) { it.draw(); if (it.hit) hits.push(it.hit); }
    const hovered = f.hover ? hits.find(h => sameSelection(f.hover, h.selection)) : undefined;
    if (hovered) drawFocus(g, hovered.focus);
    f.weather.drawShade(g);
    f.weather.drawDynamic(g, f.state, f.sim, f.layout);
    return hits;
}
