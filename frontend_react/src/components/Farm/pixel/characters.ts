import {Pix, type Palette} from './canvas';
import {P} from './palette';

// 农夫角色：24×22 画布，脚底中心位于 (12, 20)。style 决定发型/帽子，palette 决定上衣颜色。
export const PERSON_W = 24, PERSON_H = 22, PERSON_FOOT = {x: 12, y: 20};
export type Facing = 'down' | 'up' | 'left' | 'right';
export type Work = 'plant' | 'water' | 'harvest' | 'feed';

const HAIR: [number, number][] = [[0x6b3e26, 0x4a2a1c], [0xf0c05a, 0xc8913a], [0x2e2440, 0x1c1628], [0xd0603a, 0x9e4128]];
const SHIRT: [number, number][] = [[0xef6b4a, 0xbd4634], [0x4a9be8, 0x3070b8], [0x5cbf5a, 0x3b9142], [0xa070e0, 0x744bb5]];

const DOWN = [
    '....HHHHHH....',
    '...HHHHHHHH...',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '..HhSSSSSShH..',
    '..HSSSSSSSSH..',
    '..HSESSSSESH..',
    '..hSESSSSESh..',
    '...SMSSSSMS...',
    '....sSSSSs....',
    '...COCCCCOC...',
    '..CCOCCCCOCC..',
    '..CCOOOOOOCC..',
    '..CcOOOOOOcC..',
    '..SoOOOOOOoS..',
    '...oOOOOOOo...',
];
const UP = [
    '....HHHHHH....',
    '...HHHHHHHH...',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '..HHHHHHHHHH..',
    '..HhHHHHHHhH..',
    '..hhHHHHHHhh..',
    '...shhhhhhs...',
    '....sSSSSs....',
    '...COCCCCOC...',
    '..CCCOCCOCCC..',
    '..CCCCOOCCCC..',
    '..CcOOOOOOcC..',
    '..SoOOOOOOoS..',
    '...oOOOOOOo...',
];
const SIDE = [
    '....HHHHHH....',
    '...HHHHHHHH...',
    '...HHHHHHHHH..',
    '...HHHHHHHHH..',
    '...HHhSSSSSS..',
    '...HHSSSSSSS..',
    '...HhSSSSESS..',
    '...hhSSSSESS..',
    '....hSSSSMS...',
    '.....sSSSs....',
    '.....CCOCC....',
    '.....CCOCC....',
    '.....COOOC....',
    '.....cOOOO....',
    '.....SOOOO....',
    '.....oOOOo....',
];

const OX = 5, OY = 1; // 字符图在画布中的偏移

function palette(style: number, shirt: number): Palette {
    const [h, hs] = HAIR[style % 4], [c, cs] = SHIRT[shirt % 4];
    return {H: h, h: hs, S: 0xf7cfa6, s: 0xe0a37e, E: P.ink, M: 0xf29a8a, C: c, c: cs, O: 0x3e5a99, o: 0x2d4275};
}

function legs(p: Pix, facing: Facing, frame: number, bob: number) {
    const denim = 0x3e5a99, boot = 0x4a2f28;
    const y = OY + 16 + bob;
    if (facing === 'left' || facing === 'right') {
        const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
        for (const [x, s] of [[OX + 6, -swing], [OX + 8, swing]] as const) {
            p.rect(x + s, y, 2, 2, denim); p.rect(x + s, y + 2, 3, 1, boot);
        }
        return;
    }
    const lift = (leg: number) => (frame === 1 && leg === 0) || (frame === 3 && leg === 1) ? 1 : 0;
    for (const [leg, x] of [[0, OX + 4], [1, OX + 8]] as const) {
        const l = lift(leg);
        p.rect(x, y, 2, 2 - l, denim); p.rect(x, y + 2 - l, 2, 1, boot);
    }
}

function headwear(p: Pix, style: number, facing: Facing, bob: number) {
    const y = OY + bob, side = facing === 'left' || facing === 'right';
    const [hair] = HAIR[style % 4];
    if (style === 0) { // 草帽
        p.rect(OX + (side ? 1 : 0), y + 3, side ? 13 : 14, 1, 0xc99a3e);
        p.rect(OX + (side ? 2 : 1), y + 2, side ? 11 : 12, 1, 0xe8c46a);
        p.rect(OX + 3, y - 1, 8, 3, 0xe8c46a); p.rect(OX + 3, y + 1, 8, 1, 0xd04a3a);
        p.rect(OX + 4, y - 1, 3, 1, 0xf8df8a);
    } else if (style === 1) { // 长发
        if (facing === 'down') {p.rect(OX + 2, y + 8, 1, 4, hair); p.rect(OX + 11, y + 8, 1, 4, hair);}
        else if (facing === 'up') p.rect(OX + 3, y + 8, 8, 3, hair);
        else p.rect(OX + 3, y + 8, 2, 4, hair);
    } else if (style === 2) { // 鸭舌帽
        p.rect(OX + 3, y, 8, 3, 0x3e9c6a); p.rect(OX + 4, y, 3, 1, 0x63c08a);
        if (facing === 'down') p.rect(OX + 3, y + 3, 8, 1, 0x2c7450);
        else if (side) p.rect(OX + 9, y + 3, 4, 1, 0x2c7450);
    } else { // 头巾
        p.rect(OX + 2, y + 2, 10, 2, 0xd94a5a); p.px(OX + 4, y + 2, 0xffffff); p.px(OX + 8, y + 3, 0xffffff);
        if (facing !== 'down') p.rect(OX + (facing === 'up' ? 6 : 2), y + 4, 2, 2, 0xd94a5a);
    }
}

function tool(p: Pix, work: Work, frame: number) {
    const up = frame % 2;
    if (work === 'plant') { // 锄头上下挥动
        const top = OY + 5 + up * 3;
        p.line(OX + 15, top, OX + 12, OY + 15, 0x8a5433);
        p.rect(OX + 14, top - 1, 4, 2, 0x9aa0b4); p.px(OX + 17, top + 1, 0x6c7086);
        if (frame === 2) {p.px(OX + 16, OY + 18, P.soil2); p.px(OX + 18, OY + 17, P.soil2);}
    } else if (work === 'water') { // 洒水壶
        const y = OY + 12 - up;
        p.rect(OX + 12, y, 5, 4, 0x5a8fc4); p.rect(OX + 12, y, 5, 1, 0x8fc0ea); p.rect(OX + 17, y + 1, 2, 1, 0x5a8fc4);
        p.px(OX + 13, y - 1, 0x3a6a9c); p.px(OX + 15, y - 1, 0x3a6a9c);
        p.px(OX + 19, y + 2 + frame % 3, P.sky); p.px(OX + 18, y + 4 + (frame + 1) % 3, P.sky);
    } else if (work === 'harvest') { // 竹篮
        const y = OY + 12 + up;
        p.rect(OX - 2, y, 6, 4, 0xc48a3a); p.rect(OX - 2, y, 6, 1, 0xe8bd5c); p.hline(OX - 2, y + 2, 6, 0x9a6a2a);
        p.px(OX - 1, y - 1, 0xe04a4a); p.px(OX + 1, y - 1, 0xf28a3a); p.px(OX + 2, y - 2, 0x58aa48);
    } else { // 撒饲料
        const y = OY + 12;
        p.rect(OX + 12, y, 4, 4, 0xe6d3a0); p.rect(OX + 12, y, 4, 1, 0xc9a774);
        for (let i = 0; i < 3; i++) p.px(OX + 15 + i + frame % 2, y + 5 + (i * 2 + frame) % 4, 0xf2c64a);
    }
}

/** 绘制一帧农夫；work 存在时为朝下的干活姿势。 */
export function person(style: number, shirt: number, facing: Facing, frame: number, work?: Work) {
    const p = new Pix(PERSON_W, PERSON_H);
    const face: Facing = work ? 'down' : facing === 'left' ? 'right' : facing;
    const bob = work ? (frame % 2) : (frame === 1 || frame === 3 ? 1 : 0);
    legs(p, face, work ? 0 : frame, 0);
    p.map(face === 'down' ? DOWN : face === 'up' ? UP : SIDE, palette(style, shirt), OX, OY + bob);
    headwear(p, style, face, bob);
    if (work) tool(p, work, frame);
    p.outline(P.ink);
    p.under(q => q.ellipse(PERSON_FOOT.x, PERSON_FOOT.y, 6, 1.6, 0x000000, .28));
    return facing === 'left' && !work ? p.mirror() : p;
}
