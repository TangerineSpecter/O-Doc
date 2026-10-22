import {Graphics} from 'pixi.js';

interface Shard {x: number; y: number; vx: number; vy: number; floorY: number; color: number; size: number; bounces: number; settled: boolean}

/** The approved template's full-color burst and bouncing debris, in actor-local pixels. */
export class MeadowShatter extends Graphics {
    private shards: Shard[] = [];
    private age = 0;
    private colors: readonly string[] = [];
    private lastAge = 0;

    start(pixels: ImageData, lift: number, colors: readonly string[]) {
        this.shards = []; this.age = this.lastAge = 0; this.colors = colors;
        for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
            const i = (y * 128 + x) * 4;
            if (pixels.data[i + 3] < 128) continue;
            const angle = Math.atan2(y - 62, x - 64) + (Math.random() - .5) * .55;
            const speed = 45 + Math.random() * 135 + (128 - y) * .45;
            this.shards.push({x: x - 64, y: y - 118 + lift,
                vx: Math.cos(angle) * speed + (Math.random() - .5) * 40,
                vy: Math.sin(angle) * speed - 35 - Math.random() * 55,
                floorY: -12 + Math.random() * 26,
                color: (pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2],
                size: Math.random() < .65 ? 2 : 3, bounces: 2 + Math.floor(Math.random() * 2), settled: false});
        }
    }
    reset() { this.shards = []; this.age = this.lastAge = 0; this.clear(); }
    sample(time: number) {
        // Only the scene's active playback clock advances physics; redraw/pause is stable.
        let remaining = Math.max(0, time - this.lastAge);
        while (remaining > 0) {
            const dt = Math.min(remaining, 1 / 60); remaining -= dt;
            for (const sh of this.shards) {
                if (sh.settled) continue;
                sh.vy += 260 * dt; sh.vx *= 1 - .6 * dt;
                sh.x += sh.vx * dt; sh.y += sh.vy * dt;
                if (sh.y >= sh.floorY && sh.vy > 0) {
                    sh.y = sh.floorY;
                    if (sh.bounces > 0 && Math.abs(sh.vy) > 18) {
                        sh.bounces--; sh.vy = -sh.vy * (.36 + Math.random() * .15); sh.vx *= .68;
                    } else { sh.settled = true; sh.vx = sh.vy = 0; }
                }
            }
        }
        this.lastAge = time; this.age = time; this.clear();
        if (time < .5) {
            const p = time / .5;
            for (let n = 0; n < 180; n++) {
                const a = n / 180 * Math.PI * 2;
                this.rect(Math.round(Math.cos(a) * (14 + 98 * p)), Math.round(-2 + Math.sin(a) * (3 + 21 * p)), 2, 1);
            }
            this.fill({color: this.colors[0], alpha: 1 - p});
        }
        // Group colors to keep the dense burst within a small number of draw batches.
        const groups = new Map<number, Shard[]>();
        for (const sh of this.shards) { const group = groups.get(sh.color) ?? []; group.push(sh); groups.set(sh.color, group); }
        for (const [color, shards] of groups) {
            for (const sh of shards) this.rect(Math.round(sh.x), Math.round(sh.y), sh.size, sh.size);
            this.fill(color);
        }
    }
    get shake() { return Math.max(0, 16 - this.age * 34); }
}
