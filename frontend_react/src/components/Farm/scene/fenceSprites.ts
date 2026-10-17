import {P} from './palette';
import {mk, cx, hline, outline, px, rc, vline, type Sprite} from './pixel';

const fenceCache: Record<string, Sprite> = {};

/* ---- 栅栏：整段一次性描边，避免接缝 ---- */
/** 水平栅栏，len 为总长，高 13px，立柱约每 10px 一根；整段一次性描边避免接缝。 */
export function drawFenceH(len: number): Sprite {
    const k = 'fh' + len; if (fenceCache[k]) return fenceCache[k];
    const c = mk(len, 13), g = cx(c);
    for (const ry of [3, 9]) { rc(g, 0, ry, len, 2, P.w2); hline(g, 0, ry, len, P.w1); hline(g, 0, ry + 1, len, P.w3); }
    const n = Math.max(1, Math.round((len - 3) / 10)), step = (len - 3) / n;
    for (let i = 0; i <= n; i++) {
        const x = Math.round(i * step);
        rc(g, x, 0, 3, 13, P.w2); vline(g, x, 0, 13, P.w1); vline(g, x + 2, 0, 13, P.w3); hline(g, x, 0, 3, P.w1); px(g, x, 0, P.w2); px(g, x + 2, 0, P.w2); hline(g, x, 12, 3, P.w4); px(g, x + 1, 2, P.w3);
    }
    return (fenceCache[k] = { c: outline(c), ax: 1, ay: 14 });
}
/** 竖向栅栏（场地侧边）。 */
export function drawFenceV(len: number): Sprite {
    const k = 'fv' + len; if (fenceCache[k]) return fenceCache[k];
    const c = mk(5, len), g = cx(c);
    rc(g, 1, 0, 3, len, P.w2); vline(g, 1, 0, len, P.w1); vline(g, 3, 0, len, P.w3);
    const n = Math.max(1, Math.round((len - 9) / 12)), step = (len - 9) / n;
    for (let i = 0; i <= n; i++) {
        const y = Math.round(i * step);
        rc(g, 0, y, 5, 9, P.w2); vline(g, 0, y, 9, P.w1); vline(g, 4, y, 9, P.w3); hline(g, 0, y, 5, P.w1); hline(g, 0, y + 8, 5, P.w4); hline(g, 1, y + 1, 3, P.w1); px(g, 2, y + 4, P.w3);
    }
    return (fenceCache[k] = { c: outline(c), ax: 3, ay: len + 1 });
}