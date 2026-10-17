import {P} from './palette';
import {hash, hline, px, rc, vline, type Ctx} from './pixel';

export interface RoofColors {hi: string; base: string; lo: string; line: string}

/* ---------- 复用的形状 / 材质 ---------- */
/** 木板墙：竖板纹理 + 左亮右暗 + 底部阴影 */
export function planks(g: Ctx, x: number, y: number, w: number, h: number, c: string[] = [P.w1, P.w2, P.w3, P.w4], step = 4) {
  rc(g, x, y, w, h, c[1]);
  for (let i = step - 1; i < w; i += step) vline(g, x + i, y, h, c[2]);
  hline(g, x, y, w, c[0]);
  hline(g, x, y + h - 1, w, c[2]);
  vline(g, x + w - 1, y, h, c[2]);
  // 木节
  for (let i = 1; i < w - 2; i += step) { if (hash(i, y, 7) > 0.55) px(g, x + i, y + 2 + Math.floor(hash(i, h, 3) * (h - 4)), c[2]); }
}
/** 梯形瓦屋顶（45°/s 斜率），每行带瓦片纹。cols:{hi,base,lo,line} */
export function roofTrap(g: Ctx, x: number, y: number, w: number, h: number, s: number, cols: RoofColors) {
  for (let i = 0; i < h; i++) {
    const inset = (h - 1 - i) * s, x0 = x + inset, w0 = w - inset * 2;
    if (w0 <= 0) continue;
    const row = i === h - 1 ? cols.lo : cols.base;
    hline(g, x0, y + i, w0, row);
    if (i === 0) hline(g, x0, y + i, w0, cols.hi);
    else if (i < h - 1) {
      const off = (i % 2) * 2;
      for (let k = x0 + off; k < x0 + w0; k += 4) px(g, k, y + i, cols.line);
      // 每行下沿一条暗线，增强瓦片分层
      if (i % 2 === 1) for (let k = x0; k < x0 + w0; k++) if (((k + i) & 3) !== 0) px(g, k, y + i, cols.line);
      px(g, x0, y + i, cols.hi);               // 左侧受光
      px(g, x0 + w0 - 1, y + i, cols.lo);      // 右侧阴影
    }
  }
}
/** 灯笼（小）— lit 时高亮 */
export function lantern(g: Ctx, x: number, y: number, lit: boolean) {
  px(g, x + 1, y, P.ink);
  rc(g, x, y + 1, 3, 3, lit ? P.y2 : P.o1);
  px(g, x + 1, y + 2, lit ? P.c1 : P.y1);
  px(g, x, y + 4, P.ink); px(g, x + 1, y + 4, P.ink); px(g, x + 2, y + 4, P.ink);
}
