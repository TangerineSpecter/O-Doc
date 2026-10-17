import {P} from './palette';
import {cx, mk, outline, px, rc, vline} from './pixel';
import type {BuildingKind, BuildingSprite} from './buildingParts';
import {buildBarn1, buildBarn2, buildBarn3} from './barnSprites';
import {buildCoop1, buildCoop2, buildCoop3} from './coopSprites';

/** 未建造的空地（Lv0）：四角木桩 + 虚线 + 加号 */
function buildLot(kind: BuildingKind): BuildingSprite {
    const w = kind === 'coop' ? 40 : 56, h = kind === 'coop' ? 24 : 32;
    const c = mk(w, h), g = cx(c);
    rc(g, 1, 1, w - 2, h - 2, P.g2);
    for (let x = 2; x < w - 2; x += 2) { px(g, x, 1, P.c1); px(g, x + (h % 2), h - 2, P.c1); }
    for (let y = 2; y < h - 2; y += 2) { px(g, 1, y, P.c1); px(g, w - 2, y, P.c1); }
    const mx = w >> 1, my = h >> 1; rc(g, mx - 3, my, 7, 1, P.c1); rc(g, mx, my - 3, 1, 7, P.c1);
    for (const [x, y] of [[0, 0], [w - 3, 0], [0, h - 5], [w - 3, h - 5]]) { rc(g, x, y, 3, 5, P.w2); vline(g, x, y, 5, P.w1); vline(g, x + 2, y, 5, P.w3); }
    return { c: outline(c, P.ink), ax: (w + 2) >> 1, ay: h + 1, lights: [], foot: { w: w - 6, h: 6 } };
}

const buildingCache: Record<string, BuildingSprite> = {};
const BUILD: Record<BuildingKind, ((lit: boolean) => BuildingSprite)[]> = {
    coop: [buildCoop1, buildCoop2, buildCoop3],
    barn: [buildBarn1, buildBarn2, buildBarn3],
};
export type BuildingLevel = 0 | 1 | 2 | 3;
/** 建筑精灵：level 0 为未建造空地，1–3 为各级外观；结果按等级和是否点灯缓存。 */
export function getBuilding(kind: BuildingKind, level: BuildingLevel, lit: boolean): BuildingSprite {
    const k = kind + level + (lit ? 'L' : 'D');
    if (!buildingCache[k]) buildingCache[k] = level === 0 ? buildLot(kind) : BUILD[kind][level - 1](lit);
    return buildingCache[k];
}
