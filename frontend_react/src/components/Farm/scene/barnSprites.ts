import {P} from './palette';
import {hash, hline, mk, cx, px, rc, vline} from './pixel';
import {lantern, roofTrap} from './shapes';
import {bigDoors, finish, gableBarn, hayBale, stoneStrip, win, type BuildingSprite} from './buildingParts';

export function buildBarn1(lit: boolean): BuildingSprite {  // 开放式草棚，堆着干草
    const c = mk(54, 40), g = cx(c);
    // 内墙
    rc(g, 7, 14, 40, 22, P.s3); for (let i = 3; i < 40; i += 5) vline(g, 7 + i, 14, 22, P.sw2);
    rc(g, 7, 14, 40, 4, P.ink); hline(g, 7, 18, 40, P.sw2);
    // 地面干草
    rc(g, 7, 31, 40, 5, P.y2); for (let i = 0; i < 40; i++) { const h = hash(i, 9, 1); if (h > .6) px(g, 7 + i, 31 + Math.floor(h * 10) % 5, P.y1); else if (h < .22) px(g, 7 + i, 32 + Math.floor(h * 40) % 4, P.y3); }
    hline(g, 7, 31, 40, P.y1);
    // 草垛（右）
    hayBale(g, 33, 26, 12, 9); hayBale(g, 36, 19, 10, 8);
    // 木槽（左）
    rc(g, 10, 29, 17, 6, P.w3); hline(g, 10, 29, 17, P.w1); hline(g, 10, 30, 17, P.w2); hline(g, 10, 34, 17, P.w4); vline(g, 10, 29, 6, P.w2); vline(g, 26, 29, 6, P.w4);
    hline(g, 11, 28, 15, P.y2); hline(g, 12, 27, 11, P.y1); px(g, 15, 26, P.y1); px(g, 19, 26, P.y2); px(g, 22, 27, P.y2);
    // 柱子 + 斜撑
    for (const x of [3, 48]) { rc(g, x, 12, 4, 25, P.w2); vline(g, x, 12, 25, P.w1); vline(g, x + 3, 12, 25, P.w3); hline(g, x - 1, 36, 6, P.w4); }
    for (let i = 0; i < 6; i++) { px(g, 7 + i, 13 + i, P.w3); px(g, 7 + i, 14 + i, P.w4); px(g, 46 - i, 13 + i, P.w3); px(g, 46 - i, 14 + i, P.w4); }
    // 屋顶（木瓦），屋檐外挑
    roofTrap(g, 0, 3, 54, 10, 2, { hi: P.w1, base: P.w3, lo: P.w4, line: P.w4 });
    for (let i = 0; i < 4; i++) { px(g, 44 + i * 2, 13 + (i % 2), P.y2); px(g, 45 + i * 2, 14, P.y3); }   // 屋檐挂的干草
    px(g, 27, 13, P.ink); vline(g, 27, 14, 3, P.w4); lantern(g, 26, 17, lit);
    return finish(c, [{ x: 27, y: 19, r: 22 }], { w: 40, h: 8 });
}
export function buildBarn2(lit: boolean): BuildingSprite {  // 红色谷仓
    const c = mk(66, 54), g = cx(c), cxx = 33;
    const W = { base: P.r2, trim: P.c1, line: P.r3, shade: P.r4 };
    const B = { hi: P.k1, base: P.k2, lo: P.k3, line: P.k3 };
    const info = gableBarn(g, cxx, 6, { up: 9, lo: 9, hw0: 3, body: 22, band: B, wall: W, btUp: 6, btLo: 3 });
    // 阁楼窗
    const wy = 6 + 7;
    rc(g, cxx - 5, wy, 10, 9, P.c1); rc(g, cxx - 4, wy + 1, 8, 8, P.ink); rc(g, cxx - 4, wy + 6, 8, 3, P.y2); hline(g, cxx - 4, wy + 6, 8, P.y1); px(g, cxx - 2, wy + 5, P.y1); px(g, cxx + 1, wy + 5, P.y2);
    hline(g, cxx - 5, wy, 10, P.c2);
    // 吊货梁
    rc(g, cxx, 1, 7, 2, P.w3); hline(g, cxx, 1, 7, P.w1); vline(g, cxx + 6, 3, 4, P.c3); px(g, cxx + 6, 7, P.k3); px(g, cxx + 5, 7, P.k3);
    vline(g, cxx - 1, 2, 4, P.w4);
    // 大门
    const by = info.bodyTop + 1;
    bigDoors(g, cxx - 10, by + 5, 20, 17);
    // 侧窗
    win(g, cxx - 25, by + 7, 8, 8, lit); win(g, cxx + 18, by + 7, 8, 8, lit);
    // 石基
    stoneStrip(g, cxx - 28, by + 22, 57, 4);
    // 干草/桶
    hayBale(g, cxx + 21, by + 17, 8, 7);
    return finish(c, [{ x: cxx - 21, y: by + 11, r: 14 }, { x: cxx + 22, y: by + 11, r: 14 }, { x: cxx, y: wy + 5, r: 12 }], { w: 58, h: 10 });
}
export function buildBarn3(lit: boolean): BuildingSprite {  // 大型谷仓：筒仓 + 钟楼 + 侧棚 + 灯笼
    const c = mk(104, 76), g = cx(c), bx = 51;
    // ---------- 筒仓（左，先画被谷仓遮一点）
    const sx = 1, sw = 18, st = 22, sb = 66;
    rc(g, sx, st, sw, sb - st, P.k2);
    rc(g, sx, st, 4, sb - st, P.k1); rc(g, sx + 4, st, 3, sb - st, P.k1); vline(g, sx + 7, st, sb - st, P.k2);
    rc(g, sx + sw - 5, st, 5, sb - st, P.k3); vline(g, sx + sw - 6, st, sb - st, P.k2);
    for (let y = st + 4; y < sb; y += 7) { hline(g, sx, y, sw, P.k3); hline(g, sx, y + 1, sw, P.k2); px(g, sx, y, P.k2); }
    px(g, sx + 2, st + 8, P.c1); px(g, sx + 2, st + 9, P.c1);
    // 圆顶
    for (let i = 0; i < 9; i++) { const w = Math.round(Math.sqrt(1 - ((8 - i) / 9) ** 2) * (sw / 2 + 1)); const x0 = sx + sw / 2 - w; hline(g, x0, st - 9 + i, w * 2, i < 3 ? P.b1 : P.b2); px(g, x0, st - 9 + i, P.b1); px(g, x0 + w * 2 - 1, st - 9 + i, P.b3); if (i > 5) hline(g, x0 + 2, st - 9 + i, w * 2 - 2, P.b2); }
    rc(g, sx + sw / 2 - 1, st - 12, 2, 4, P.y2); px(g, sx + sw / 2 - 1, st - 12, P.y1); px(g, sx + sw / 2 - 1, st - 13, P.y3);
    hline(g, sx - 1, st, sw + 2, P.b3);
    // 筒仓门 + 梯子
    rc(g, sx + 7, sb - 8, 5, 8, P.w4); rc(g, sx + 8, sb - 7, 3, 7, P.ink); px(g, sx + 8, sb - 8, P.w4);
    vline(g, sx + sw - 3, st + 6, sb - st - 6, P.w3); vline(g, sx + sw - 1, st + 6, sb - st - 6, P.w3); for (let y = st + 8; y < sb - 4; y += 3) hline(g, sx + sw - 3, y, 3, P.w4);
    // 筒仓底座
    stoneStrip(g, sx - 1, sb - 3, sw + 2, 3);
    // ---------- 主谷仓
    const W = { base: P.r2, trim: P.c1, line: P.r3, shade: P.r4 };
    const B = { hi: P.b1, base: P.b2, lo: P.b3, line: P.b3 };
    const y0 = 17;
    const info = gableBarn(g, bx, y0, { up: 9, lo: 9, hw0: 3, body: 26, band: B, wall: W, btUp: 6, btLo: 4 });
    // 钟楼 (cupola)
    rc(g, bx - 5, 5, 11, 10, P.c1); hline(g, bx - 5, 14, 11, P.c3); vline(g, bx + 5, 5, 10, P.c2);
    win(g, bx - 3, 7, 7, 6, lit, P.w4, false); vline(g, bx, 8, 4, P.w4);
    roofTrap(g, bx - 8, 1, 17, 5, 2, { hi: P.b1, base: P.b2, lo: P.b3, line: P.b3 });
    vline(g, bx, 0, 2, P.y3); px(g, bx, 0, P.y2);
    // 阁楼双开小门（左开着，露出干草）
    const hy = y0 + 9;
    rc(g, bx - 8, hy, 16, 12, P.c1); rc(g, bx - 7, hy + 1, 14, 11, P.ink);
    rc(g, bx - 7, hy + 7, 7, 5, P.y2); hline(g, bx - 7, hy + 7, 7, P.y1); px(g, bx - 5, hy + 6, P.y1); px(g, bx - 3, hy + 6, P.y2);
    rc(g, bx + 1, hy + 1, 6, 11, P.r3); hline(g, bx + 1, hy + 1, 6, P.r2); for (let t = 0; t < 10; t++) px(g, bx + 1 + Math.round(t * 5 / 9), hy + 1 + t, P.c1);
    vline(g, bx, hy + 1, 11, P.c3);
    // 大门（更大 + 拱形白框）+ 灯笼
    const by = info.bodyTop + 1;
    bigDoors(g, bx - 11, by + 6, 22, 20);
    hline(g, bx - 12, by + 4, 24, P.c1); hline(g, bx - 10, by + 3, 20, P.c1); hline(g, bx - 10, by + 4, 20, P.c2);
    px(g, bx - 12, by + 5, P.c1); px(g, bx + 11, by + 5, P.c1);
    lantern(g, bx - 16, by + 8, lit); lantern(g, bx + 14, by + 8, lit);
    // 窗（带蓝色百叶窗）
    for (const wxx of [-24, 19]) { win(g, bx + wxx, by + 8, 6, 9, lit); rc(g, bx + wxx - 2, by + 8, 2, 9, P.b2); rc(g, bx + wxx + 6, by + 8, 2, 9, P.b2); vline(g, bx + wxx - 2, by + 8, 9, P.b1); vline(g, bx + wxx + 7, by + 8, 9, P.b3); }
    // 右侧棚屋
    const wx = bx + info.bh + 1, wy = by + 6;
    rc(g, wx - 1, wy, 19, 20, P.r2); for (let x = wx + 1; x < wx + 16; x += 3) vline(g, x, wy + 1, 19, P.r3);
    hline(g, wx - 1, wy, 19, P.r4); rc(g, wx + 16, wy, 2, 20, P.c1); vline(g, wx + 17, wy, 20, P.c2);
    roofTrap(g, wx - 3, wy - 7, 23, 8, 2, { hi: P.b1, base: P.b2, lo: P.b3, line: P.b3 });
    win(g, wx + 2, wy + 5, 8, 8, lit); lantern(g, wx + 12, wy + 6, lit);
    stoneStrip(g, wx - 1, wy + 20, 19, 4);
    // 石基（主体）
    stoneStrip(g, bx - info.bh, by + 26, info.bh * 2 + 1, 4);
    // 门前干草 + 桶
    hayBale(g, bx + 17, by + 20, 8, 9);
    return finish(c, [{ x: bx - 15, y: by + 9, r: 20 }, { x: bx + 16, y: by + 9, r: 20 }, { x: bx, y: 10, r: 14 }, { x: bx, y: hy + 6, r: 12 }, { x: bx - 20, y: by + 12, r: 14 }, { x: bx + 30, y: by + 12, r: 14 }], { w: 94, h: 12 });
}