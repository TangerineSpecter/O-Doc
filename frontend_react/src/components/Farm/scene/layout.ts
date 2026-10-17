import {hash} from './pixel';
import type {TreeKind} from './treeSprites';
import type {SignIcon} from './propSprites';
import {PLOT_H, PLOT_W} from './cropSprites';

/**
 * 场景布局：所有坐标均为 324×216 逻辑像素，要调整位置只改这里。
 * 游戏最多 16 块地（ID 0–15，每次扩建 4 块）。设计稿只画了前 8 块（北侧农田）；
 * 拥有超过 8 块地时进入 'southField' 布局：南侧增加第二块农田承载 8–15 号地，并取代池塘区域。
 */
export type SceneLayout = 'pond' | 'southField';
export const SCENE_W = 324, SCENE_H = 216;
export const PLOT_SLOTS = 16;
export interface Rect {x: number; y: number; w: number; h: number}
export interface Pen {x: number; y: number; w: number; h: number; gate: [number, number]}
export interface FieldFence {x: number; y: number; w: number; h: number; gateX?: number; gateW?: number}
export interface RoutePoint {x: number; y: number; wait?: number}

export const CFG = {
    // 北侧农田：栅栏外框 + 8 块地(4×2)；gateX/gateW 为下沿缺口。
    field: {x: 4, y: 6, w: 157, h: 101, gateX: 75, gateW: 16} as FieldFence,
    // 南侧农田（仅 southField 布局）：上沿敞开通向横路，只有左右和下沿栅栏。
    southField: {x: 4, y: 119, w: 157, h: 96} as FieldFence,
    plots: {x0: 13, y0: 28, dx: 37, dy: 34, southY0: 135},
    // 石板路：竖路 + 横路
    pathV: {x: 172, w: 14}, pathH: {y: 112, h: 14, x2: 172},
    // 鸡舍围栏 / 牛羊舍围栏（栅栏外框；gate = 左侧缺口的 y 范围）
    coopPen: {x: 190, y: 4, w: 130, h: 85, gate: [38, 58]} as Pen,
    barnPen: {x: 190, y: 98, w: 130, h: 117, gate: [166, 190]} as Pen,
    // 建筑锚点 = 底边中点（等级变化时保持不动）
    coop: {x: 280, y: 60},
    barn: {x: 264, y: 170},
    // 动物活动区（脚底坐标范围，x1,y1,x2,y2）
    coopZone: [200, 30, 312, 74] as [number, number, number, number],
    barnZone: [200, 120, 312, 197] as [number, number, number, number],
    // 设计稿里各级幼崽数量（下标为等级）。成年动物来自真实农场数据，幼崽仅为装饰，见 sceneModel。
    coopYoung: [0, 0, 2, 3],
    barnYoung: [0, 0, 1, 1],
    pier: {x: 77, y: 134},
};

/** 居民巡逻路线（脚底坐标）；wait 为到达后停留的 tick 数。 */
export const ROUTE: RoutePoint[] = [
    {x: 181, y: 14}, {x: 181, y: 119}, {x: 120, y: 119}, {x: 83, y: 119}, {x: 83, y: 104}, {x: 83, y: 92, wait: 22},
    {x: 20, y: 92}, {x: 83, y: 92}, {x: 150, y: 92, wait: 22}, {x: 83, y: 92}, {x: 83, y: 60}, {x: 83, y: 92, wait: 22},
    {x: 83, y: 104}, {x: 83, y: 119}, {x: 20, y: 119, wait: 22}, {x: 120, y: 119}, {x: 181, y: 119}, {x: 181, y: 205}, {x: 181, y: 119},
];
/** southField 布局下，在第 13 个路点（回到横路）之后插入的南侧农田巡视。 */
export const ROUTE_SOUTH: RoutePoint[] = [
    {x: 83, y: 131}, {x: 83, y: 198}, {x: 24, y: 198, wait: 22}, {x: 83, y: 198}, {x: 142, y: 198, wait: 22}, {x: 83, y: 198}, {x: 83, y: 131},
];
export const ROUTE_SOUTH_AFTER = 13;

/** 拥有 8 号以后的地块时使用南侧农田布局。 */
export const layoutFor = (plots: {owned: boolean}[]): SceneLayout => plots.slice(8).some(p => p.owned) ? 'southField' : 'pond';

export function plotRect(slot: number): Rect {
    const {x0, y0, dx, dy, southY0} = CFG.plots, row = (slot / 4) | 0;
    return {x: x0 + (slot % 4) * dx, y: row < 2 ? y0 + row * dy : southY0 + (row - 2) * dy, w: PLOT_W, h: PLOT_H};
}

/* ---------- 池塘形状 ---------- */
const POND_E = [[62, 170, 42, 22], [88, 160, 28, 15], [38, 176, 18, 12]];
export function pondField(x: number, y: number): number {
    let m = 9;
    for (const [ex, ey, rx, ry] of POND_E) m = Math.min(m, ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2);
    return m + (hash(x >> 1, y >> 1, 77) - 0.5) * 0.16;
}
export const inPond = (x: number, y: number) => pondField(x, y) < 1;

export function inPath(x: number, y: number, layout: SceneLayout): boolean {
    const v = CFG.pathV, h = CFG.pathH;
    const j1 = hash(y >> 1, 1, 5) < .3 ? 1 : 0, j2 = hash(y >> 1, 2, 5) < .3 ? 1 : 0;
    if (x >= v.x + j1 && x < v.x + v.w - j2) return true;
    const k1 = hash(x >> 1, 3, 5) < .3 ? 1 : 0, k2 = hash(x >> 1, 4, 5) < .3 ? 1 : 0;
    if (x < h.x2 + 1 && y >= h.y + k1 && y < h.y + h.h - k2) return true;
    // 桥头小路（仅池塘布局）
    if (layout === 'pond' && x >= 70 + (hash(y, 1, 5) < .3 ? 1 : 0) && x < 84 && y >= 126 && y < 142) return true;
    // 田地门口小径
    if (x >= 77 + (hash(y, 7, 5) < .3 ? 1 : 0) && x < 89 && y >= 100 && y < 112) return true;
    return false;
}

/** 静态摆件：[种类, x, y(脚底)]。 */
export type Placed<K> = [K, number, number];
export const PROPS = {
    // 两种布局共有：路牌与路旁路灯
    signs: [['wheat', 98, 111], ['egg', 168, 70], ['cow', 168, 160]] as Placed<SignIcon>[],
    lamps: [[166, 138], [166, 190]] as [number, number][],
    // 池塘布局独有：左下角的池塘、树林和灌木；southField 布局下这片区域让位给第二块农田
    pond: {
        trees: [['orange', 140, 158], ['green', 152, 208], ['small', 128, 210], ['pine', 8, 212], ['small', 34, 213], ['pine', 7, 140], ['orange', 106, 210], ['green', 6, 196]] as Placed<TreeKind>[],
        bushes: [['bush', 130, 184], ['berry', 132, 142], ['bush', 148, 190], ['berry', 22, 208], ['bush', 62, 209], ['berry', 120, 200], ['bush', 160, 150]] as Placed<TreeKind>[],
        lamps: [[40, 130], [128, 130]] as [number, number][],
        reeds: [[118, 168], [116, 184], [20, 160], [30, 192], [108, 194], [30, 150], [66, 146]] as [number, number][],
        scarecrow: [152, 176] as [number, number],
    },
};
