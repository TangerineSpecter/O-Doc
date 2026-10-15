import {Pix} from './canvas';
import {P} from './palette';
import type {CropKind} from '../../../types/api/farm';

// 作物：16×24 画布，植株根部在 y=21。阶段 0 幼苗共用，阶段 1 区分高矮，阶段 2 每种作物独立造型。
export const CROP_W = 16, CROP_H = 24, CROP_ROOT = 21;
const TALL = new Set<CropKind>(['corn', 'sunflower', 'wheat', 'rice', 'tomato', 'cucumber']);

const shade = (hi: number, mid: number, lo: number, dark: number) => (dx: number, dy: number) => {
    const v = dx + dy;
    return v < -.7 ? hi : v < -.05 ? mid : v < .7 ? lo : dark;
};
const leafy = shade(P.leaf4, P.leaf3, P.leaf2, P.leaf1);
const deep = shade(P.leaf3, P.leaf2, P.leaf1, P.leaf0);

function bush(p: Pix, cx: number, cy: number, rx: number, ry: number, light = true) {
    p.ellipse(cx, cy, rx, ry, light ? leafy : deep);
}
function stalk(p: Pix, x: number, top: number, color: number = P.leaf1) {p.vline(x, top, CROP_ROOT - top + 1, color);}
function leaf(p: Pix, x: number, y: number, dir: 1 | -1, len = 3) {
    for (let i = 0; i < len; i++) p.px(x + dir * i, y - (i > 1 ? 1 : 0), i === 0 ? P.leaf2 : P.leaf3);
}
function berry(p: Pix, x: number, y: number, c: number, hi: number) {
    p.rect(x, y, 2, 2, c); p.px(x, y, hi);
}

const MATURE: Record<CropKind, (p: Pix) => void> = {
    radish: p => {
        bush(p, 8, 13, 5, 3.5);
        p.ellipse(8, 18.5, 3.2, 2.8, (dx, dy) => dx + dy < -.4 ? 0xff8a9a : dx + dy < .6 ? 0xe04a5a : 0xa82a40);
        p.px(8, 21, 0xf6e9e0);
    },
    potato: p => {
        bush(p, 8, 16, 6.5, 4.5);
        for (const [x, y] of [[5, 13], [10, 12], [8, 15], [12, 15]]) {p.px(x, y, P.white); p.px(x + 1, y, 0xd8c8f0);}
        p.ellipse(4, 20, 2, 1.4, 0xc9945a); p.ellipse(12, 20, 2, 1.4, 0xb07c48);
    },
    corn: p => {
        stalk(p, 8, 4);
        leaf(p, 7, 17, -1, 4); leaf(p, 9, 14, 1, 4); leaf(p, 7, 10, -1, 3); leaf(p, 9, 19, 1, 3);
        p.rect(9, 8, 3, 6, P.yellow); p.vline(9, 8, 6, 0xe0a82a); p.px(11, 8, 0xfff0a0);
        p.rect(9, 13, 3, 2, P.leaf2); p.px(12, 10, P.leaf3);
        p.rect(7, 2, 3, 2, 0xc89a4a); p.px(6, 1, 0xc89a4a); p.px(10, 1, 0xc89a4a);
    },
    peanut: p => {
        bush(p, 8, 17, 6.5, 3.5);
        for (const [x, y] of [[4, 15], [9, 14], [12, 16], [7, 17]]) p.px(x, y, P.yellow);
        p.ellipse(5, 21, 1.6, 1, 0xd9b07a); p.ellipse(11, 21, 1.6, 1, 0xd9b07a);
    },
    soybean: p => {
        bush(p, 8, 15, 5.5, 5, false);
        for (const [x, y] of [[4, 13], [11, 12], [7, 17], [12, 17], [5, 18]]) {p.rect(x, y, 1, 3, 0xbcd862); p.px(x, y, 0xe0f08a);}
    },
    strawberry: p => {
        bush(p, 8, 17, 6.5, 3.5);
        for (const [x, y] of [[3, 18], [7, 19], [11, 18]]) {
            p.rect(x, y, 3, 3, 0xe03a4a); p.px(x + 1, y + 3, 0xe03a4a); p.px(x, y, 0xff7a7a);
            p.px(x + 1, y + 1, 0xffe08a); p.px(x + 2, y + 2, 0xffe08a); p.px(x + 1, y - 1, P.leaf3);
        }
    },
    pumpkin: p => {
        bush(p, 5, 14, 4, 2.5, false); bush(p, 12, 13, 3.5, 2.5, false);
        p.ellipse(8, 18, 6.5, 3.8, (dx, dy) => dx + dy < -.6 ? 0xffb05a : dx + dy < .5 ? P.orange : 0xc2601e);
        p.vline(6, 15, 6, 0xc2601e); p.vline(10, 15, 6, 0xc2601e);
        p.rect(8, 13, 2, 2, P.leaf1); p.px(9, 12, P.leaf2);
    },
    sunflower: p => {
        stalk(p, 8, 9); leaf(p, 7, 16, -1, 4); leaf(p, 9, 13, 1, 4);
        p.ellipse(8, 6, 5, 5, (dx, dy) => dx + dy < -.5 ? 0xfff07a : dx + dy < .6 ? P.yellow : 0xe8a82a);
        p.ellipse(8, 6, 2.4, 2.4, (dx, dy) => dx + dy < 0 ? 0x8a5a2a : 0x5a3820);
        p.px(7, 5, 0xb07a3a);
    },
    wheat: p => {
        for (const [x, top] of [[3, 9], [5, 7], [8, 6], [11, 8], [13, 10]]) {
            p.vline(x, top + 4, CROP_ROOT - top - 3, 0xc8a44a);
            p.rect(x, top, 1, 4, 0xf2cf6a); p.px(x - 1, top + 1, 0xe0b04a); p.px(x + 1, top + 2, 0xe0b04a); p.px(x, top - 1, 0xfff0a0);
        }
        leaf(p, 5, 17, -1, 3); leaf(p, 11, 16, 1, 3);
    },
    rice: p => {
        for (const [x, top, dir] of [[4, 8, -1], [7, 6, 1], [10, 7, 1], [12, 9, -1]] as const) {
            p.vline(x, top, CROP_ROOT - top + 1, P.leaf2);
            for (let i = 0; i < 4; i++) p.px(x + dir * (1 + (i > 1 ? 1 : 0)), top + i, i % 2 ? 0xe8d070 : 0xd4b84a);
        }
        bush(p, 8, 19, 5, 2, false);
    },
    tomato: p => {
        p.vline(12, 3, 19, P.wood2); p.px(12, 3, P.wood3);
        bush(p, 7.5, 12, 5, 8);
        for (const [x, y] of [[4, 9], [8, 13], [5, 16], [9, 7], [9, 17]]) {
            p.ellipse(x + 1, y + 1, 1.6, 1.6, 0xe0402e); p.px(x, y, 0xff9a7a);
        }
    },
    cabbage: p => {
        p.ellipse(8, 17, 7, 4.5, deep);
        p.ellipse(8, 16, 4.5, 3.6, (dx, dy) => dx + dy < -.4 ? 0xe2f6a8 : dx + dy < .5 ? 0xb6e07a : 0x86c25a);
        p.line(8, 14, 6, 18, 0x86c25a); p.line(8, 14, 10, 18, 0x86c25a);
    },
    cucumber: p => {
        p.vline(3, 4, 18, P.wood2); p.vline(13, 4, 18, P.wood2); p.hline(3, 6, 11, P.wood1);
        bush(p, 8, 12, 5, 6, false);
        for (const [x, y] of [[5, 13], [10, 10], [8, 16]]) {p.rect(x, y, 2, 5, 0x2f7a35); p.vline(x, y, 5, 0x4ea845); p.px(x + 1, y + 2, 0xa6e07a);}
    },
    eggplant: p => {
        bush(p, 8, 12, 6, 4.5, false);
        for (const [x, y] of [[4, 14], [9, 15]]) {
            p.ellipse(x + 1.5, y + 3, 1.9, 3, (dx, dy) => dx + dy < -.3 ? 0xa070d0 : 0x5a2a7a);
            p.rect(x, y, 3, 1, P.leaf1); p.px(x + 1, y - 1, P.leaf2);
        }
    },
    chili: p => {
        bush(p, 8, 13, 6, 5);
        for (const [x, y] of [[4, 13], [8, 16], [11, 12], [6, 9]]) {
            p.rect(x, y, 2, 3, 0xe0302e); p.px(x + 1, y + 3, 0xe0302e); p.px(x, y, 0xff8a6a); p.px(x, y - 1, P.leaf1);
        }
    },
    onion: p => {
        for (const x of [4, 6, 8, 10, 12]) p.vline(x, 8 + (x % 4), 12 - (x % 4), x % 4 ? P.leaf2 : P.leaf3);
        p.ellipse(6, 19, 2.8, 2.4, (dx, dy) => dx + dy < -.3 ? 0xfff6e0 : 0xe8d6a8);
        p.ellipse(11, 19.5, 2.4, 2, (dx, dy) => dx + dy < -.3 ? 0xf8e0ef : 0xd8a8c8);
    },
};

export function crop(kind: CropKind, phase: number) {
    const p = new Pix(CROP_W, CROP_H);
    if (phase === 0) {
        p.vline(8, 18, 4, P.leaf2);
        p.rect(5, 17, 3, 2, P.leaf3); p.px(5, 17, P.leaf4); p.rect(9, 16, 3, 2, P.leaf3); p.px(11, 16, P.leaf4);
    } else if (phase === 1) {
        if (TALL.has(kind)) {stalk(p, 8, 11, P.leaf2); leaf(p, 7, 17, -1, 3); leaf(p, 9, 14, 1, 3); bush(p, 8, 11, 2.5, 2.5);}
        else bush(p, 8, 17.5, 4.5, 3.5);
    } else MATURE[kind](p);
    p.outline(0x163020);
    return p;
}
