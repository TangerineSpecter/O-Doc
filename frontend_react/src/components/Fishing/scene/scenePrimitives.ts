import {rc, hash, type Ctx, type Sprite} from '../../Farm/scene/pixel';

export const SCENE_WIDTH = 576;
export const SCENE_HEIGHT = 324;
export const WATER_EDGE = 208;
export function stamp(g: Ctx, s: Sprite, x: number, y: number, scale = 2) {
    g.drawImage(s.c, Math.round(x - s.ax * scale), Math.round(y - s.ay * scale), s.c.width * scale, s.c.height * scale);
}
export function pixelLine(g: Ctx, x: number, y: number, endX: number, endY: number, color: string, size = 1) {
    const steps = Math.max(Math.abs(endX - x), Math.abs(endY - y), 1);
    for (let i = 0; i <= steps; i++) rc(g, Math.round(x + (endX - x) * i / steps), Math.round(y + (endY - y) * i / steps), size, size, color);
}
export const shoreX = (y: number) => WATER_EDGE + Math.round((Math.sin(y / 42) * 13 + Math.cos(y / 23) * 6) / 3) * 3;
export function reeds(g: Ctx, x: number, y: number) {
    for (let i = 0; i < 5; i++) {
        const h = 14 + hash(x, i) * 16;
        pixelLine(g, x + i * 4, y, x + i * 4 - 3, y - h, '#547c4b', 2);
        pixelLine(g, x + i * 4, y - 2, x + i * 4 + 4, y - h / 2, '#8fa653');
        if (i % 2 === 0) rc(g, x + i * 4 - 4, y - h, 4, 8, '#986a43');
    }
}
export function pier(g: Ctx) {
    rc(g, 169, 192, 138, 37, '#4e8589');
    rc(g, 166, 172, 136, 39, '#704f38');
    for (let x = 168; x < 300; x += 12) {
        rc(g, x, 173, 10, 32, '#bd8954');
        rc(g, x, 173, 10, 2, '#f1cc87');
        rc(g, x, 178, 2, 21, '#d7a86c');
        rc(g, x + 5, 179 + (x % 3), 1, 16, '#a3754a');
        rc(g, x + 3, 175, 2, 1, '#7a593e');
        rc(g, x + 3, 202, 2, 1, '#7a593e');
    }
    rc(g, 166, 206, 136, 4, '#94633e');
    for (const x of [170, 229, 292]) for (const y of [172, 209]) {
        rc(g, x, y, 6, 13, '#78583c'); rc(g, x, y, 2, 11, '#bc8d58');
        rc(g, x - 1, y - 2, 8, 4, '#ecc78a'); rc(g, x + 1, y - 1, 4, 1, '#c49b64');
    }
}
