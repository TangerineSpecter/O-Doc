import {P} from './palette';
import {hash, hline, mk, cx, px, rc, vline} from './pixel';
import {lantern, planks, roofTrap} from './shapes';
import {finish, hayBale, stoneStrip, win, type BuildingSprite} from './buildingParts';

export function buildCoop1(lit: boolean): BuildingSprite {  // 小木屋 + 茅草顶
    const c = mk(36, 30), g = cx(c);
    planks(g, 7, 15, 22, 13);
    roofTrap(g, 3, 6, 30, 10, 1, { hi: P.y1, base: P.y2, lo: P.y3, line: P.y3 });
    for (let i = 0; i < 22; i++) { const x = 7 + Math.floor(hash(i, 1, 2) * 20), y = 8 + Math.floor(hash(i, 2, 2) * 6); px(g, x, y, hash(i, 3, 2) > .5 ? P.y1 : P.y3); }
    hline(g, 7, 16, 22, P.w3);                                  // 屋檐阴影
    rc(g, 14, 19, 8, 9, P.w3); rc(g, 15, 21, 6, 7, lit ? P.y3 : P.ink); hline(g, 16, 20, 4, lit ? P.y3 : P.ink); px(g, 14, 19, P.w2); hline(g, 14, 19, 8, P.w4);
    px(g, 17, 26, P.c1); px(g, 18, 26, P.c1); px(g, 17, 25, P.c2); hline(g, 15, 27, 6, P.y2);   // 门内稻草+蛋
    hline(g, 14, 28, 8, P.w1); hline(g, 14, 29, 8, P.w3); px(g, 14, 28, P.w2);                // 小坡道
    hline(g, 30, 28, 5, P.y3); hline(g, 30, 27, 5, P.y2); hline(g, 31, 26, 3, P.y1); px(g, 32, 25, P.y1); px(g, 29, 28, P.y2);
    return finish(c, [{ x: 18, y: 24, r: 14 }], { w: 26, h: 8 });
}
export function buildCoop2(lit: boolean): BuildingSprite {  // 红顶 + 窗 + 产蛋箱 + 小围栏
    const c = mk(50, 38), g = cx(c);
    planks(g, 11, 18, 30, 17);
    rc(g, 11, 18, 2, 17, P.c2); vline(g, 12, 18, 17, P.c3); rc(g, 39, 18, 2, 17, P.c2); vline(g, 40, 18, 17, P.c3);
    hline(g, 11, 18, 30, P.w3);
    roofTrap(g, 7, 6, 38, 12, 1, { hi: P.r1, base: P.r2, lo: P.r4, line: P.r3 });
    rc(g, 23, 9, 6, 4, P.c1); rc(g, 24, 10, 4, 2, P.ink); px(g, 23, 12, P.c3); px(g, 28, 12, P.c3);   // 屋顶通气窗
    win(g, 29, 22, 9, 8, lit); hline(g, 28, 30, 11, P.c3); px(g, 30, 29, P.r2); px(g, 31, 29, P.y2); px(g, 33, 29, P.l2); px(g, 35, 29, P.r2);
    rc(g, 15, 23, 10, 12, P.c1); rc(g, 16, 25, 8, 10, P.ink); hline(g, 17, 24, 6, P.ink); vline(g, 24, 23, 12, P.c3);
    hline(g, 17, 34, 6, P.y2); px(g, 19, 33, P.c1); px(g, 20, 33, P.c1); px(g, 19, 32, P.c2);
    hline(g, 15, 35, 10, P.w1); hline(g, 15, 36, 10, P.w3);
    // 产蛋箱
    planks(g, 41, 27, 7, 8, [P.w1, P.w2, P.w3, P.w4], 3);
    roofTrap(g, 40, 24, 9, 4, 1, { hi: P.r1, base: P.r2, lo: P.r4, line: P.r3 });
    rc(g, 42, 29, 5, 5, P.ink); hline(g, 42, 33, 5, P.y2); hline(g, 43, 32, 3, P.y1); px(g, 44, 31, P.c1); px(g, 45, 31, P.c1);
    // 白色小围栏
    for (let i = 0; i < 3; i++) { const x = 1 + i * 3; rc(g, x, 30, 2, 6, P.c1); px(g, x, 29, P.c1); px(g, x + 1, 30, P.c2); vline(g, x + 1, 31, 5, P.c3); }
    hline(g, 1, 32, 8, P.c2); hline(g, 1, 34, 8, P.c3);
    // 食盆
    rc(g, 29, 36, 8, 2, P.w3); hline(g, 29, 36, 8, P.w2); hline(g, 30, 35, 6, P.y2); px(g, 32, 35, P.y1); px(g, 34, 35, P.y3);
    return finish(c, [{ x: 33, y: 26, r: 18 }, { x: 20, y: 30, r: 10 }], { w: 36, h: 8 });
}
export function buildCoop3(lit: boolean): BuildingSprite {  // 豪华：石基 + 半木结构 + 青石板屋顶 + 老虎窗 + 风向标 + 灯笼
    const c = mk(64, 54), g = cx(c);
    // 风向标（公鸡）+ 屋脊金顶（先画，底部被屋顶遮挡）
    vline(g, 32, 4, 7, P.w4); hline(g, 29, 7, 7, P.w4); px(g, 29, 6, P.w4); px(g, 35, 6, P.w4);
    rc(g, 30, 1, 5, 3, P.y2); hline(g, 30, 1, 5, P.y1); px(g, 35, 1, P.y2); px(g, 36, 2, P.o2); px(g, 34, 0, P.r2); px(g, 35, 0, P.r2);
    px(g, 29, 0, P.y3); px(g, 29, 1, P.y3); px(g, 30, 0, P.y3); px(g, 30, 3, P.y3); px(g, 31, 3, P.y3); px(g, 34, 3, P.y3);
    // 石基
    stoneStrip(g, 7, 43, 50, 5);
    // 墙身（灰泥 + 半木）
    rc(g, 9, 25, 46, 18, P.c1); hline(g, 9, 42, 46, P.c2); vline(g, 54, 25, 18, P.c2);
    for (const bx of [9, 21, 42, 53]) { rc(g, bx, 25, 2, 18, P.w4); vline(g, bx, 25, 18, P.w3); }
    hline(g, 9, 25, 46, P.w4); hline(g, 9, 26, 46, P.w3); hline(g, 9, 41, 46, P.w4);
    // 左右墙板：斜撑
    for (let i = 0; i < 6; i++) { px(g, 12 + i, 39 - i * 2, P.w3); px(g, 12 + i, 40 - i * 2, P.w4); }
    for (let i = 0; i < 6; i++) { px(g, 49 - i, 39 - i * 2, P.w3); px(g, 49 - i, 40 - i * 2, P.w4); }
    // 屋顶（青石板）
    roofTrap(g, 3, 11, 58, 14, 2, { hi: P.b1, base: P.b2, lo: P.b3, line: P.b3 });
    rc(g, 29, 9, 6, 3, P.y2); hline(g, 29, 9, 6, P.y1); hline(g, 29, 11, 6, P.y3);           // 金色屋脊
    // 老虎窗
    rc(g, 24, 12, 16, 3, P.b1);
    roofTrap(g, 24, 11, 16, 5, 1, { hi: P.b1, base: P.b1, lo: P.b3, line: P.b2 });
    hline(g, 28, 11, 8, P.y2);
    rc(g, 27, 16, 10, 8, P.c1); win(g, 29, 17, 6, 6, lit, P.w4, false); vline(g, 32, 18, 4, P.w4);
    rc(g, 26, 16, 1, 8, P.w4); rc(g, 37, 16, 1, 8, P.w4);
    // 双开拱门
    rc(g, 24, 28, 16, 15, P.w4); rc(g, 25, 29, 14, 14, P.w2);
    planks(g, 26, 30, 6, 13, [P.w1, P.w2, P.w3, P.w4], 3); planks(g, 32, 30, 6, 13, [P.w1, P.w2, P.w3, P.w4], 3); vline(g, 32, 30, 13, P.ink);
    px(g, 26, 30, P.w4); px(g, 37, 30, P.w4); px(g, 25, 29, P.w4); px(g, 38, 29, P.w4); hline(g, 28, 29, 8, P.w4);
    px(g, 31, 37, P.y2); px(g, 33, 37, P.y2);
    // 蛋形匾额
    rc(g, 30, 26, 5, 3, P.c2); hline(g, 31, 26, 3, P.c1); px(g, 32, 27, P.y2); px(g, 33, 27, P.y2);
    // 窗户 + 花槽
    win(g, 12, 30, 8, 8, lit, P.w4); win(g, 44, 30, 8, 8, lit, P.w4);
    for (const fx of [11, 43]) { rc(g, fx, 38, 10, 3, P.w3); hline(g, fx, 38, 10, P.w2); for (let i = 0; i < 10; i++) { px(g, fx + i, 37, [P.l2, P.r2, P.l2, P.y2, P.pk][i % 5]); if (i % 2 == 0) px(g, fx + i, 36, [P.r2, P.y2, P.pk, P.r3, P.y1][(i / 2) % 5]); } }
    // 灯笼
    px(g, 22, 28, P.w4); px(g, 41, 28, P.w4); lantern(g, 20, 29, lit); lantern(g, 41, 29, lit);
    // 台阶
    hline(g, 23, 43, 18, P.w1); hline(g, 22, 44, 20, P.w2); hline(g, 22, 45, 20, P.w3); hline(g, 21, 46, 22, P.w2); hline(g, 21, 47, 22, P.w4);
    // 左侧产蛋架
    planks(g, 1, 36, 8, 11, [P.w1, P.w2, P.w3, P.w4], 4);
    roofTrap(g, 0, 33, 10, 4, 1, { hi: P.b1, base: P.b2, lo: P.b3, line: P.b3 });
    rc(g, 2, 39, 6, 3, P.ink); hline(g, 2, 41, 6, P.y2); px(g, 4, 40, P.c1); px(g, 5, 40, P.c1);
    rc(g, 2, 43, 6, 3, P.ink); hline(g, 2, 45, 6, P.y2); px(g, 3, 44, P.c1);
    // 右侧草垛
    hayBale(g, 55, 40, 8, 7); hayBale(g, 56, 34, 7, 6);
    return finish(c, [{ x: 21, y: 32, r: 18 }, { x: 42, y: 32, r: 18 }, { x: 16, y: 34, r: 12 }, { x: 48, y: 34, r: 12 }, { x: 32, y: 20, r: 14 }], { w: 50, h: 10 });
}