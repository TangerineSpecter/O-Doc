import {rng} from './pixel';

/**
 * 雨幕图案：下雨时不逐滴绘制，而是把一小块可无缝平铺的雨丝图案预渲染成一张小图，
 * 由浏览器合成器整体平移（见 rainOverlay.ts），JS 在雨中不做任何逐帧工作。
 * 远景层雨丝短、淡、慢，近景层长、亮、快，两层视差叠出纵深。
 */
export interface RainLayerSpec {
    tileW: number; tileH: number;
    /** 图案切成 cols×rows 个格子，每格一条雨丝，位置在格内抖动，分布均匀又不规整。 */
    cols: number; rows: number;
    minLen: number; maxLen: number;
    color: string; alpha: number;
    /** 下落速度与向左漂移速度，像素/秒（逻辑像素）。 */
    fall: number; drift: number;
    seed: number;
}

/** 由远到近。每块 162×108，场景（324×216）里每层平铺 2×2 块，共约 128 条雨丝。 */
export const RAIN_LAYERS: readonly RainLayerSpec[] = [
    {tileW: 162, tileH: 108, cols: 5, rows: 4, minLen: 3, maxLen: 4, color: '#a9cbe8', alpha: .55, fall: 36, drift: 4, seed: 17},
    {tileW: 162, tileH: 108, cols: 4, rows: 3, minLen: 4, maxLen: 6, color: '#e8f6ff', alpha: .9, fall: 66, drift: 6, seed: 29},
];

export const SPLASH_TICKS = 3; // 水花寿命：中心点 → 两侧点 → 两侧点

/** 图案里所有点亮的像素 [x, y]：每条雨丝竖直排列，最后一格向左偏一像素；越出图案边缘的部分绕回另一侧，保证平铺无缝。 */
export function streakPixels(spec: RainLayerSpec): [number, number][] {
    const r = rng(spec.seed), cw = spec.tileW / spec.cols, ch = spec.tileH / spec.rows, out: [number, number][] = [];
    const wrap = (v: number, n: number) => ((v % n) + n) % n;
    for (let row = 0; row < spec.rows; row++) for (let col = 0; col < spec.cols; col++) {
        const x = Math.floor((col + r()) * cw), y = Math.floor((row + r()) * ch);
        const len = spec.minLen + Math.floor(r() * (spec.maxLen - spec.minLen + 1));
        for (let i = 0; i < len; i++) out.push([wrap(x - (i === len - 1 ? 1 : 0), spec.tileW), wrap(y + i, spec.tileH)]);
    }
    return out;
}

/** 覆盖 sceneSize 逻辑像素的画面并允许平移一整块图案所需的平铺块数。 */
export const tilesFor = (sceneSize: number, tileSize: number) => Math.ceil(sceneSize / tileSize) + 1;
