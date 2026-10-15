import type {BuildingKind} from '../../types/api/farm';
import {cellKey, type Cell} from './pathfinding';

// 农场地图以 24×16 个 32px 格子布局；地块坐标由 pathfinding.plotCell 固定。
export const WIDTH = 768, HEIGHT = 512, TILE = 32;

export interface Rect {x: number; y: number; w: number; h: number}

/** 菜园围栏范围（像素），16 个地块位于其中。 */
export const GARDEN: Rect = {x: 72, y: 104, w: 272, h: 272};
/** 主路：竖路贯穿中部，横路在底部通往左侧入口。 */
export const PATHS: Rect[] = [
    {x: 11 * TILE, y: 0, w: 2 * TILE, h: 14 * TILE},
    {x: 0, y: 12 * TILE, w: 13 * TILE, h: 2 * TILE},
    {x: 13 * TILE, y: 4 * TILE, w: 3 * TILE, h: TILE},
    {x: 13 * TILE, y: 9 * TILE, w: 3 * TILE, h: TILE},
    {x: 13 * TILE, y: 12 * TILE, w: 3 * TILE, h: 2 * TILE},
];
export const POND: Rect = {x: 528, y: 368, w: 208, h: 104};

export interface BuildingSpot {lot: Rect; front: Cell; pen: Rect; animalTop: number; animalBottom: number}
export const BUILDINGS: Record<BuildingKind, BuildingSpot> = {
    barn: {lot: {x: 14 * TILE, y: 2 * TILE, w: 64, h: 64}, front: {x: 14, y: 4}, pen: {x: 528, y: 52, w: 208, h: 124}, animalTop: 76, animalBottom: 136},
    coop: {lot: {x: 14 * TILE, y: 7 * TILE, w: 64, h: 64}, front: {x: 14, y: 9}, pen: {x: 528, y: 212, w: 208, h: 124}, animalTop: 236, animalBottom: 296},
};

/** 装饰树木（左上角像素坐标），沿地图边缘形成树林。 */
export const TREES: [number, number][] = [
    [-26, -34], [30, -40], [92, -30], [156, -38], [218, -32], [282, -40],
    [430, -36], [490, -42],
    [-34, 48], [-30, 132], [-36, 214], [-34, 284],
    [-22, 448], [44, 456], [112, 446], [182, 458], [250, 450], [318, 460], [386, 452], [454, 462],
    [740, 172], [742, 300], [716, 450], [600, 462],
];

export const START: Cell = {x: 12, y: 12};

export function obstacles(): Set<string> {
    const set = new Set<string>();
    const tiles: [number, number, number, number][] = [[14, 2, 2, 2], [14, 7, 2, 2], [16, 11, 7, 4], [16, 1, 7, 5], [16, 6, 7, 5]];
    for (const [left, top, w, h] of tiles)
        for (let x = left; x < left + w; x++) for (let y = top; y < top + h; y++) set.add(cellKey({x, y}));
    return set;
}
