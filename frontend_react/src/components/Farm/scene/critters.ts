import {drawAnimal, type AnimalType} from './animalSprites';
import type {Sprite} from './pixel';

/** 活动区 [x1, y1, x2, y2]（脚底坐标）。 */
export type Zone = [number, number, number, number];
/** 障碍矩形 [x1, y1, x2, y2]，动物不会走进去。 */
export type Obstacle = [number, number, number, number];
type CritterKind = 'cow' | 'sheep' | 'chick' | 'hen';
type CritterState = 'idle' | 'graze' | 'walk';

const HALF_WIDTH: Record<AnimalType, number> = {cow: 13, sheep: 12, lamb: 8, hen: 7, henB: 7, henY: 7, chick: 5};
// 每 tick 的行走距离（像素）。设计稿的 0.32–0.55 在 10 tick/秒下只有 3–5 像素/秒，显得迟钝，现提高到约 2.5 倍。
export const SPEED: Record<CritterKind, number> = {cow: 0.8, sheep: 0.85, chick: 1.4, hen: 1.3};
// 迈腿间隔（tick）：走得越快迈腿越勤，但仍保持每秒 2–3 次切换，不会鬼畜。
const STEP_TICKS: Record<CritterKind, number> = {cow: 5, sheep: 4, chick: 3, hen: 3};

/** 围栏里的一只动物：待机、啄食/吃草、闲逛三种状态按 tick 推进。id 为空表示纯装饰的幼崽。 */
export class Critter {
    x = 0; y = 0; tx = 0; ty = 0;
    /** 上一 tick 的位置，绘制时在它与 (x, y) 之间插值。 */
    px = 0; py = 0;
    dir: 1 | -1;
    state: CritterState = 'idle';
    t: number; leg = 0; blink = 0; head = 0; ph = 0;
    readonly hwm: number;
    readonly type: AnimalType;
    readonly id: string | null;
    private readonly obs: Obstacle[];
    private readonly r: () => number;
    private readonly others: Critter[];
    private readonly zone: Zone;
    private readonly kind: CritterKind;
    private readonly speed: number;
    private readonly grazeDur: number;

    constructor(type: AnimalType, zone: Zone, obs: Obstacle[], r: () => number, others: Critter[], id: string | null = null) {
        this.type = type; this.obs = obs; this.r = r; this.others = others; this.id = id;
        const margin = HALF_WIDTH[type] + 2;
        this.hwm = margin - 2;
        this.zone = [zone[0] + margin, zone[1], zone[2] - margin, zone[3]];
        this.kind = type === 'cow' ? 'cow' : type === 'sheep' || type === 'lamb' ? 'sheep' : type === 'chick' ? 'chick' : 'hen';
        this.speed = SPEED[this.kind] * (type === 'lamb' ? 1.1 : 1);
        this.dir = r() > .5 ? 1 : -1;
        this.t = Math.floor(r() * 30);
        for (let i = 0; i < 30; i++) {
            this.x = this.zone[0] + r() * (this.zone[2] - this.zone[0]);
            this.y = this.zone[1] + r() * (this.zone[3] - this.zone[1]);
            if (!this.blocked(this.x, this.y) && this.free(this.x, this.y)) break;
        }
        this.tx = this.x; this.ty = this.y; this.px = this.x; this.py = this.y;
        this.grazeDur = this.kind === 'hen' || this.kind === 'chick' ? 14 : 40;
    }
    private blocked(x: number, y: number) {
        const m = this.hwm;
        for (const o of this.obs) if (x > o[0] - m && x < o[2] + m && y > o[1] && y < o[3]) return true;
        return false;
    }
    private pathClear(x0: number, y0: number, x1: number, y1: number) {
        const n = 10;
        for (let i = 0; i <= n; i++) if (this.blocked(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
        return true;
    }
    private free(x: number, y: number) {
        for (const o of this.others) if (o !== this && Math.abs(o.tx - x) < o.hwm + this.hwm + 6 && Math.abs(o.ty - y) < 11) return false;
        return true;
    }
    private pick() {
        const z = this.zone, r = this.r, mx = this.kind === 'cow' ? 46 : this.kind === 'sheep' ? 38 : 26;
        for (let i = 0; i < 20; i++) {
            const tx = Math.max(z[0], Math.min(z[2], this.x + (r() - .5) * 2 * mx)), ty = Math.max(z[1], Math.min(z[3], this.y + (r() - .5) * 2 * mx * .5));
            if (!this.blocked(tx, ty) && this.pathClear(this.x, this.y, tx, ty) && this.free(tx, ty)) { this.tx = tx; this.ty = ty; return true; }
        }
        return false;
    }
    tick() {
        const r = this.r;
        this.px = this.x; this.py = this.y;
        this.t--; this.ph++;
        if (this.blink > 0) this.blink--; else if (r() < 0.012) this.blink = 2;
        if (this.state === 'idle') {
            this.head = 0;
            if (this.t <= 0) {
                if (r() < 0.35) { this.state = 'graze'; this.t = this.grazeDur + Math.floor(r() * 24); }
                else if (this.pick()) this.state = 'walk';
                else this.t = 20;
            }
        } else if (this.state === 'graze') {
            this.head = this.kind === 'hen' || this.kind === 'chick' ? (this.ph % 8 < 3 ? 0 : 1) : 1;
            if (this.t <= 0) { this.state = 'idle'; this.t = 14 + Math.floor(r() * 40); this.head = 0; }
        } else {
            this.head = 0;
            const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
            if (d < this.speed + .2) { this.state = 'idle'; this.t = 16 + Math.floor(r() * 50); this.leg = 0; }
            else {
                const nx = this.x + dx / d * this.speed, ny = this.y + dy / d * this.speed;
                if (this.blocked(nx, ny)) { this.state = 'idle'; this.t = 10; } else { this.x = nx; this.y = ny; }
                if (Math.abs(dx) > 1) this.dir = dx > 0 ? 1 : -1;
                if (this.ph % STEP_TICKS[this.kind] === 0) this.leg ^= 1;
            }
        }
    }
    sprite(): Sprite {
        return drawAnimal(this.type, {leg: this.state === 'walk' ? this.leg : 0, head: this.head, blink: this.blink > 0, dir: this.dir});
    }
}
