import {P} from './palette';
import {fromMap, mirror, outline, trim, type Canvas, type Sprite} from './pixel';

export type ResidentFacing = 'down' | 'up' | 'side';
export type ResidentDirection = ResidentFacing | 'left';
/** 居民外观：与农场设置里的 style（帽子/发色）和 palette（背带裤配色）一一对应，各 0–3。 */
export interface ResidentLook {style: number; palette: number}

// 设计稿的默认居民为草帽 + 蓝色背带裤（style 0 / palette 1）；其余组合只替换配色，保持同一轮廓。
const HATS = [
    {h: P.y2, H: P.y1, j: P.y3, r: P.r2},
    {h: P.w3, H: P.w2, j: P.w4, r: P.pk},
    {h: P.l3, H: P.l2, j: P.l4, r: P.y2},
    {h: P.dk, H: P.k3, j: P.dk, r: P.r2},
];
const OVERALLS = [
    {b: P.o1, B: P.o2},
    {b: P.b2, B: P.b3},
    {b: P.l3, B: P.l4},
    {b: P.pu, B: '#6f4f9a'},
];
const pick = <T,>(list: T[], i: number): T => list[Math.min(list.length - 1, Math.max(0, i | 0))];
function legend(look: ResidentLook): Record<string, string> {
    return {...pick(HATS, look.style), ...pick(OVERALLS, look.palette), s: P.sk, S: P.w2, e: P.dk, a: P.w4, c: P.c1, C: P.c2, k: P.w4, m: P.pk};
}

const RES_TOP: Record<ResidentFacing, string[]> = {
    down: ['....hhhh....',
                  '...hHHHHh...',
                  '..jrrrrrrj..',
                  '.jjjjjjjjjj.',
                  '...aSssSa...',
                  '...assssa...',
                  '...aseesa...',
                  '...asmmsa...',
                  '....ssss....',
                  '...cbbbbc...',
                  '..scbbbbcs..',
                  '..sCbbbbCs..',
                  '....bbbb....'],
    up:   ['....hhhh....',
                  '...hHHHHh...',
                  '..jrrrrrrj..',
                  '.jjjjjjjjjj.',
                  '...aaaaaa...',
                  '...aaaaaa...',
                  '...aaaaaa...',
                  '...aaaaaa...',
                  '....aaaa....',
                  '...CbbbbC...',
                  '..sCbbbbCs..',
                  '..sCbbbbCs..',
                  '....bbbb....'],
    side: ['....hhhh....',
                  '...hHHHHh...',
                  '..jrrrrrrjj.',
                  '.jjjjjjjjjjj',
                  '...aaSsss...',
                  '...aasses...',
                  '...aassss...',
                  '...aasmms...',
                  '....asss....',
                  '....cbbc....',
                  '....cbbbs...',
                  '....CbbbCs..',
                  '....bbbb....']
};
const RES_LEGS: Record<ResidentFacing, string[][]> = {
    down: [['...BB..BB...', '...kk..kk...'], ['...BB.BB....', '..kk...kk...']],
    up:   [['...BB..BB...', '...kk..kk...'], ['...BB.BB....', '..kk...kk...']],
    side: [['....BBB.....', '....kkkk....'], ['...BB..BB...', '..kk...kk...']]
};
function buildResident(dir: ResidentFacing, f: {leg: number}, look: ResidentLook): Canvas {
    const rows = RES_TOP[dir].concat(RES_LEGS[dir][f.leg | 0]);
    return fromMap(rows, legend(look));
}
const residentCache: Record<string, Sprite> = {};
/** 居民精灵：side 朝右，dir 为 'left' 时自动翻转；结果按朝向、步伐和外观缓存。 */
export function drawResident(dir: ResidentDirection, f: {leg?: number}, look: ResidentLook): Sprite {
    const flip = dir === 'left', d: ResidentFacing = flip ? 'side' : dir, leg = (f.leg ?? 0) | 0;
    const key = `${dir}${leg}-${look.style}-${look.palette}`;
    if (residentCache[key]) return residentCache[key];
    const o = trim(outline(buildResident(d, {leg}, look)));
    return (residentCache[key] = flip ? mirror(o) : o);
}
