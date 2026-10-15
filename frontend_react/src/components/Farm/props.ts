import {Graphics} from 'pixi.js';
import {BUILDINGS, GARDEN, type Rect} from './layout';

// 静态小摆件：路牌、草垛、水槽、石头和灌木，让各区域有明确用途感。
export function props() {
    const g = new Graphics();
    signpost(g, 30, 348);
    mailbox(g, 424, 348);
    const barn = BUILDINGS.barn.pen, coop = BUILDINGS.coop.pen;
    hay(g, barn.x + barn.w - 40, barn.y + 18); hay(g, barn.x + barn.w - 62, barn.y + 26);
    trough(g, barn.x + 22, barn.y + barn.h - 30, 0x7cc0d6);
    trough(g, coop.x + 22, coop.y + coop.h - 30, 0xe2c071);
    nest(g, coop.x + coop.w - 40, coop.y + 20);
    for (const [x, y] of [[418, 30], [700, 20], [496, 342], [430, 180]]) rock(g, x, y);
    for (const [x, y] of [[GARDEN.x - 2, GARDEN.y - 30], [GARDEN.x + GARDEN.w - 30, GARDEN.y - 30], [456, 334], [482, 196]]) bush(g, x, y);
    return g;
}

const shadow = (g: Graphics, r: Rect) => g.rect(r.x, r.y, r.w, r.h).fill({color: 0x000000, alpha: .14});

function signpost(g: Graphics, x: number, y: number) {
    shadow(g, {x: x + 4, y: y + 28, w: 30, h: 3});
    g.rect(x + 16, y + 10, 4, 20).fill(0x7a5536);
    g.rect(x, y, 36, 16).fill(0x7a5536); g.rect(x + 2, y + 2, 32, 12).fill(0xc99a62); g.rect(x + 2, y + 2, 32, 2).fill(0xe0b67f);
    // 简化的箭头与文字线条。
    g.rect(x + 6, y + 7, 18, 2).fill(0x7a5536); g.rect(x + 24, y + 5, 2, 6).fill(0x7a5536); g.rect(x + 26, y + 6, 2, 4).fill(0x7a5536);
}

function mailbox(g: Graphics, x: number, y: number) {
    shadow(g, {x: x, y: y + 24, w: 16, h: 3});
    g.rect(x + 6, y + 10, 3, 15).fill(0x7a5536);
    g.rect(x, y, 16, 11).fill(0x3f6e91); g.rect(x + 1, y + 1, 14, 3).fill(0x5d8fb3); g.rect(x + 13, y - 4, 2, 6).fill(0xd8564a); g.rect(x + 13, y - 4, 4, 3).fill(0xd8564a);
}

function hay(g: Graphics, x: number, y: number) {
    shadow(g, {x: x + 2, y: y + 16, w: 22, h: 3});
    g.rect(x, y, 24, 16).fill(0xc79a3f); g.rect(x + 1, y + 1, 22, 4).fill(0xe7c66a);
    g.rect(x + 7, y, 2, 16).fill(0x9e7a35); g.rect(x + 16, y, 2, 16).fill(0x9e7a35);
    for (let i = 0; i < 5; i++) g.rect(x + 2 + i * 4, y + 8 + (i % 2) * 3, 2, 1).fill(0xf0d58a);
}

function trough(g: Graphics, x: number, y: number, fill: number) {
    shadow(g, {x: x + 2, y: y + 10, w: 30, h: 3});
    g.rect(x, y, 32, 10).fill(0x7a5536); g.rect(x + 2, y + 2, 28, 4).fill(fill); g.rect(x + 2, y + 2, 28, 1).fill(0xffffff);
    g.rect(x + 2, y + 8, 3, 3).fill(0x5d402a); g.rect(x + 27, y + 8, 3, 3).fill(0x5d402a);
}

function nest(g: Graphics, x: number, y: number) {
    shadow(g, {x: x, y: y + 10, w: 24, h: 3});
    g.rect(x, y + 3, 24, 8).fill(0xc79a3f); g.rect(x + 2, y + 2, 20, 3).fill(0xe7c66a);
    g.rect(x + 6, y - 1, 5, 5).fill(0xf6efdc); g.rect(x + 12, y, 5, 5).fill(0xf1dfb8);
}

function rock(g: Graphics, x: number, y: number) {
    shadow(g, {x: x + 1, y: y + 8, w: 14, h: 2});
    g.rect(x, y + 2, 14, 7).fill(0x9a9a8c); g.rect(x + 2, y, 9, 3).fill(0xb3b3a4); g.rect(x + 3, y + 1, 4, 1).fill(0xd2d2c4);
}

function bush(g: Graphics, x: number, y: number) {
    shadow(g, {x: x + 2, y: y + 18, w: 28, h: 4});
    g.rect(x, y + 6, 32, 14).fill(0x5f8f41); g.rect(x + 4, y + 2, 24, 6).fill(0x5f8f41);
    g.rect(x + 6, y + 4, 10, 6).fill(0x77a851); g.rect(x + 18, y + 8, 8, 4).fill(0x77a851);
    g.rect(x + 8, y + 10, 2, 2).fill(0xf2a6b8); g.rect(x + 22, y + 14, 2, 2).fill(0xf6f1e3);
}
