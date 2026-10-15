import {Pix, type Palette} from './canvas';
import {P} from './palette';

// 动物：身体、头、腿分开绘制，待机/走路/进食通过部件位移组合。画面朝右，朝左时由场景镜像。
export type AnimalMode = 'idle' | 'walk' | 'eat';
interface Spec {
    w: number; h: number; foot: number;
    body: string[]; bodyAt: [number, number];
    head: string[]; headIdle: [number, number]; headEat: [number, number];
    legs: number[]; legH: number; legW: number; legColor: number; hoof?: number;
    pal: Palette;
}

const SPECS: Record<'chicken' | 'cow' | 'sheep', Spec> = {
    chicken: {
        w: 16, h: 14, foot: 12,
        body: [
            'W........',
            'WW..WWW..',
            'WWWWWWWWW',
            'WWwwwWWWW',
            '.WWwwWWWW',
            '..WWWWWWw',
            '...wwwww.',
        ],
        bodyAt: [2, 4],
        head: ['.RR..', 'RWWW.', 'WWEWY', 'WWWYY', '.rW..'],
        headIdle: [7, 0], headEat: [9, 5],
        legs: [4, 7], legH: 2, legW: 1, legColor: 0xf2b33d,
        pal: {W: 0xfaf6ea, w: 0xd8cdb8, R: 0xe04a4a, r: 0xb83a3a, Y: 0xf2b33d, E: P.ink},
    },
    cow: {
        w: 26, h: 18, foot: 16,
        body: [
            '..WWWWWWWWWWWW..',
            '.WWKKKWWWWWKKWWW',
            'TWKKKKWWWWWKKKWW',
            'TWWKKWWWWWWWKWWW',
            'T.WWWWWWWKKWWWWW',
            '..WWWWWWKKKWWWWw',
            '..wWWWWWWKWWWWw.',
            '...wwwPPwwwwww..',
        ],
        bodyAt: [2, 6],
        head: ['h.....h', 'hKWWWKh', 'KKWWWKK', '.WEWEW.', '.WWWWW.', '.PPPPP.', '.PpPpP.'],
        headIdle: [15, 1], headEat: [16, 7],
        legs: [3, 6, 11, 14], legH: 3, legW: 2, legColor: 0xf7f3ec, hoof: 0x2e2a33,
        pal: {W: 0xf7f3ec, w: 0xd6cfc4, K: 0x2e2a33, T: 0x2e2a33, P: 0xf2a0a8, p: 0x8a3a4a, h: 0xf0e0b0, E: P.ink},
    },
    sheep: {
        w: 22, h: 15, foot: 13,
        body: [
            '...WW.WW.WW...',
            '.WWWWWWWWWWWW.',
            'WWWwWWWWWwWWWW',
            'WWWWWWwWWWWWWW',
            'WwWWWWWWWWWwWW',
            '.WWWwWWWWWWWW.',
            '..wWWWwwWWWw..',
        ],
        bodyAt: [2, 5],
        head: ['.WWW..', 'WWWWD.', 'DDDDDD', 'DWDDWD', '.DDDD.', '..DD..'],
        headIdle: [13, 2], headEat: [14, 6],
        legs: [4, 6, 11, 13], legH: 2, legW: 1, legColor: 0x3a3040,
        pal: {W: 0xf6f1e6, w: 0xd9cfbf, D: 0x3a3040, E: P.ink},
    },
};

export function animal(kind: keyof typeof SPECS, mode: AnimalMode, frame: number) {
    const s = SPECS[kind], p = new Pix(s.w, s.h);
    const walking = mode === 'walk', bob = walking ? frame % 2 : mode === 'idle' && frame === 2 ? 1 : 0;
    const [bx, by] = s.bodyAt, legTop = by + s.body.length - 1;
    s.legs.forEach((lx, i) => {
        const lift = walking && (i + frame) % 2 === 0 ? 1 : 0;
        const h = s.legH - lift;
        p.rect(bx + lx, legTop, s.legW, h, s.legColor);
        if (s.hoof) p.rect(bx + lx, legTop + h - 1, s.legW, 1, s.hoof);
    });
    p.map(s.body, s.pal, bx, by + bob);
    const [hx, hy] = mode === 'eat' ? s.headEat : s.headIdle;
    p.map(s.head, s.pal, hx, hy + (mode === 'eat' ? frame % 2 : bob));
    if (mode === 'eat') p.px(hx + s.head[0].length - 1, s.foot - 1, P.grass3);
    p.outline(P.ink);
    p.under(q => q.ellipse(s.w / 2, s.foot, s.w / 2 - 2, 1.8, 0x000000, .25));
    return p;
}
export const animalFoot = (kind: keyof typeof SPECS) => ({x: SPECS[kind].w / 2, y: SPECS[kind].foot});
