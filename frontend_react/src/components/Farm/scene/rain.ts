import {SCENE_H, SCENE_W} from './layout';
import type {Ctx} from './pixel';

export interface Drop {x: number; y: number; vy: number; land: number}
export interface Splash {x: number; y: number; age: number}

export const DROP_COUNT = 130; // 雨滴对象池固定大小，落地后原地复用
const DRIFT = 5; // 横向漂移，像素/秒（向左）
const FAR_SPEED = 45; // 低于此速度（像素/秒）的雨滴画成远景淡色
const SPLASH_MS = 200;
const SPLASH_WIDE_MS = 100; // 前半段带中心点，后半段只剩两侧
const MAX_STEP_MS = 250; // 单步最长时间，避免长时间卡顿后雨滴一次飞过整个画面

const landY = (r: () => number) => 30 + r() * (SCENE_H - 32);

/**
 * 雨幕：固定数量的雨滴按真实流逝时间下落，因此无论出帧间隔是 40ms 还是 100ms，雨速一致，
 * 帧率越高雨线越连贯。水花按时间寿命计算。落地回调交给调用方（池塘涟漪）。
 */
export class RainField {
    drops: Drop[] = [];
    splashes: Splash[] = [];

    constructor(r: () => number) {
        for (let i = 0; i < DROP_COUNT; i++) this.drops.push({x: r() * SCENE_W, y: r() * SCENE_H, vy: (3 + r() * 3) * 10, land: landY(r)});
    }

    /** 推进 dtMs 毫秒；r 为随机源；每次落地调用 onLand(x, y)。 */
    step(dtMs: number, r: () => number, onLand?: (x: number, y: number) => void) {
        const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS), s = dt / 1000;
        for (const d of this.drops) {
            d.y += d.vy * s; d.x -= DRIFT * s;
            if (d.y < d.land) continue;
            const x = Math.round(d.x), y = Math.round(d.land);
            this.splashes.push({x, y, age: 0});
            onLand?.(d.x, d.land);
            d.y = -4; d.x = r() * (SCENE_W + 20); d.land = landY(r);
        }
        // 原地压缩存活水花，不产生新数组。
        let n = 0;
        for (const p of this.splashes) { p.age += dt; if (p.age < SPLASH_MS) this.splashes[n++] = p; }
        this.splashes.length = n;
    }

    /** 画雨：按颜色分三批，每批一条路径一次填充（同一批内全部整数坐标矩形）。 */
    draw(g: Ctx) {
        g.save();
        g.beginPath();
        for (const d of this.drops) if (d.vy < FAR_SPEED) { const x = Math.round(d.x), y = Math.round(d.y); g.rect(x, y, 1, 2); g.rect(x - 1, y + 2, 1, 1); }
        g.globalAlpha = .55; g.fillStyle = '#a9cbe8'; g.fill();
        g.beginPath();
        for (const d of this.drops) if (d.vy >= FAR_SPEED) { const x = Math.round(d.x), y = Math.round(d.y); g.rect(x, y, 1, 2); g.rect(x - 1, y + 2, 1, 1); g.rect(x, y - 1, 1, 1); }
        g.globalAlpha = .9; g.fillStyle = '#e8f6ff'; g.fill();
        g.beginPath();
        for (const s of this.splashes) { g.rect(s.x - 1, s.y - 1, 1, 1); g.rect(s.x + 1, s.y - 1, 1, 1); if (s.age < SPLASH_WIDE_MS) g.rect(s.x, s.y, 1, 1); }
        g.globalAlpha = .85; g.fill();
        g.restore();
    }
}
