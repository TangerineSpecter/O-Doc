import {P} from './palette';
import {cx, fromMap, mirror, mk, outline, px, trim, vline, type Canvas, type Ctx, type Sprite} from './pixel';

export type HenType = 'hen' | 'henB' | 'henY';
export type AnimalType = 'cow' | 'sheep' | 'lamb' | 'chick' | HenType;
/** leg：行走两帧；head：1 为低头吃草/啄食；dir：1 朝右，-1 朝左。 */
export interface AnimalFrame {leg: number; head: number; blink: boolean; dir: 1 | -1}

const put = (g: Ctx, c: Canvas, x: number, y: number) => g.drawImage(c, x, y);

/* ---------- 牛 ---------- */
const cowLG = (blink: boolean) => ({ w: P.c1, g: P.c2, d: P.w4, D: P.w3, p: P.pk, n: P.r1, e: blink ? P.c2 : P.dk, h: P.y1 });
const COW_BODY = ['.wwwwwwwwwwww.',
                                    'wwwDDwwwwwddww',
                                    'wwDDDDwwwddddw',
                                    'wwwDDwwwwwddww',
                                    'wwwwwwwdddwwww',
                                    'wwwwwwwwddwwww',
                                    'gwwwwwwwwwwwwg',
                                    '.gggggggggggg.'];
const COW_HEAD = ['.h..h..',
                                    'dwwwww.',
                                    'dwwewww',
                                    '.wwwwww',
                                    '.wwwwww',
                                    '..ppppp',
                                    '..pnppp',
                                    '...ppp.'];
function buildCow(f: AnimalFrame): Canvas {
    const lg = cowLG(f.blink), c = mk(24, 17), g = cx(c), by = 4;
    const L = f.leg ? { bn: 2, bf: 4, fn: 8, ff: 11 } : { bn: 1, bf: 5, fn: 9, ff: 10 };
    const leg = (x: number, far: boolean) => { put(g, fromMap(['dd', 'dd', 'kk'], { d: far ? P.c3 : P.c2, k: P.w4 }), 2 + x, by + 8); };
    vline(g, 1, by + 1, 5, P.w4); px(g, 1, by + 6, P.w3);                 // 尾巴
    leg(L.bf, true); leg(L.ff, true);
    put(g, fromMap(COW_BODY, lg), 2, by);
    leg(L.bn, false); leg(L.fn, false);
    px(g, 7, by + 8, P.pk); px(g, 8, by + 8, P.pk);
    put(g, fromMap(COW_HEAD, lg), 2 + 11 + (f.head ? 1 : 0), f.head ? by + 1 : by - 3);
    return c;
}

/* ---------- 羊 / 小羊 ---------- */
const shLG = (blink: boolean) => ({ w: P.c1, g: P.c2, G: P.c3, f: P.sk, F: P.w2, e: blink ? P.w2 : P.dk, E: P.w3, p: P.pk });
const SHEEP_BODY = ['..www.www.ww.',
                                        '.wwwwwwwwwwww',
                                        'wwwgwwwwgwwww',
                                        'wwwwwwwwwwwww',
                                        'wwgwwwwwwwgww',
                                        'wwwwwwgwwwwww',
                                        '.gwwwwwwwwwg.',
                                        '..GgGgGgGgG..'];
const SHEEP_HEAD = ['.www..',
                                        'wwwwEE',
                                        'wffffE',
                                        'ffefff',
                                        '.ffffp',
                                        '..FFF.'];
function buildSheep(f: AnimalFrame): Canvas {
    const lg = shLG(f.blink), c = mk(22, 16), g = cx(c), by = 3;
    const L = f.leg ? [2, 5, 8, 11] : [3, 4, 9, 10];
    const leg = (x: number, far: boolean) => put(g, fromMap(['k', 'k', 'k'], { k: far ? P.w3 : P.w4 }), 2 + x, by + 8);
    leg(L[1], true); leg(L[3], true);
    put(g, fromMap(SHEEP_BODY, lg), 2, by);
    leg(L[0], false); leg(L[2], false);
    put(g, fromMap(SHEEP_HEAD, lg), 2 + 10 + (f.head ? 1 : 0), by + (f.head ? 3 : 0));
    return c;
}
const LAMB_BODY = ['.wwwwww.', 'wwgwwwgw', 'wwwwwwww', 'wgwwwwww', '.gwwwwg.', '..GGGG..'];
const LAMB_HEAD = ['.ww..', 'wffEE', 'fefff', '.fffp', '..FF.'];
function buildLamb(f: AnimalFrame): Canvas {
    const lg = shLG(f.blink), c = mk(15, 11), g = cx(c);
    const L = f.leg ? [1, 3, 5, 6] : [1, 2, 6, 7];
    const leg = (x: number, far: boolean) => put(g, fromMap(['k', 'k'], { k: far ? P.w3 : P.w4 }), 1 + x, 7);
    leg(L[1], true); leg(L[3], true);
    put(g, fromMap(LAMB_BODY, lg), 1, 2);
    leg(L[0], false); leg(L[2], false);
    put(g, fromMap(LAMB_HEAD, lg), 1 + 6 + (f.head ? 1 : 0), 2 + (f.head ? 2 : 0));
    return c;
}

/* ---------- 鸡 / 小鸡 ---------- */
const HEN_PAL = {
    hen:  { b: P.c1, h: P.c1, s: P.c2, S: P.c3 },
    henB: { b: P.w3, h: P.w2, s: P.w4, S: P.w4 },
    henY: { b: P.y2, h: P.y1, s: P.y3, S: P.y3 }
};
const HEN_UP = ['.......rr..',
                                '......hbbb.',
                                's.....bbeo.',
                                'ss...hbbbw.',
                                'sbbhhbbbb..',
                                'sbbbbbbbb..',
                                '.sbbbbbbs..',
                                '..ssbbbss..',
                                '...ssss....'];
const HEN_DOWN = ['...........',
                                    's..........',
                                    'ss..hbbr...',
                                    'sbhhbbbbr..',
                                    'sbbbbbbbbe.',
                                    '.sbbbbbbbbo',
                                    '..sbbbbbw..',
                                    '..ssbbbss..',
                                    '...ssss....'];
function buildHen(type: HenType, f: AnimalFrame): Canvas {
    const p = HEN_PAL[type], lg = { b: p.b, h: p.h, s: p.s, S: p.S, r: P.r2, o: P.o1, e: f.blink ? p.b : P.dk, l: P.o2, w: P.r3 };
    const c = mk(13, 13), g = cx(c), by = 1;
    const lx = f.leg ? [3, 7] : [4, 6];
    put(g, fromMap(['l', 'l'], lg), 1 + lx[0], by + 9); put(g, fromMap(['l', 'l'], lg), 1 + lx[1], by + 9);
    put(g, fromMap(f.head ? HEN_DOWN : HEN_UP, lg), 1, by);
    return c;
}
function buildChick(f: AnimalFrame): Canvas {
    const lg = { y: P.y1, Y: P.y2, e: f.blink ? P.y2 : P.dk, o: P.o2 };
    const c = mk(9, 9), g = cx(c);
    px(g, f.leg ? 3 : 4, 7, P.o2); px(g, f.leg ? 6 : 5, 7, P.o2);
    put(g, fromMap(f.head ? ['......', '.yyyy.', 'yYYYYe', 'yYYYYo', '.YYYY.'] : ['..yy..', '.yYYe.', 'yYYYYo', 'yYYYY.', '.YYYY.'], lg), 1, f.head ? 2 : 1);
    return c;
}
const animalCache: Record<string, Sprite> = {};
/** 动物精灵（锚点为脚底中点）；原图朝右，dir 为 -1 时水平翻转。 */
export function drawAnimal(type: AnimalType, frame: Partial<AnimalFrame> = {}): Sprite {
    const f: AnimalFrame = {leg: (frame.leg ?? 0) | 0, head: (frame.head ?? 0) | 0, blink: !!frame.blink, dir: frame.dir === -1 ? -1 : 1};
    const key = type + f.leg + f.head + (f.blink ? 1 : 0) + f.dir;
    if (animalCache[key]) return animalCache[key];
    let raw: Canvas;
    if (type === 'cow') raw = buildCow(f);
    else if (type === 'sheep') raw = buildSheep(f);
    else if (type === 'lamb') raw = buildLamb(f);
    else if (type === 'chick') raw = buildChick(f);
    else raw = buildHen(type, f);
    const o = trim(outline(raw));
    return (animalCache[key] = f.dir === -1 ? mirror(o) : o);
}
