import {P} from './palette';

export type Canvas = HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;
/** 预渲染精灵：ax/ay 为锚点（通常是脚底或底边中点）。 */
export interface Sprite {c: Canvas; ax: number; ay: number}

/** 新建关闭平滑的离屏画布；opaque 表示内容始终铺满不透明像素，浏览器可跳过透明混合。 */
export function mk(w: number, h: number, opaque = false): Canvas {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    cx(c, opaque).imageSmoothingEnabled = false;
    return c;
}
export function cx(c: Canvas, opaque = false): Ctx {
    const g = opaque ? c.getContext('2d', {alpha: false}) : c.getContext('2d');
    if (!g) throw new Error('当前浏览器不支持 Canvas 2D');
    return g;
}
export function px(g: Ctx, x: number, y: number, c: string) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }
export function rc(g: Ctx, x: number, y: number, w: number, h: number, c: string) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
export function hline(g: Ctx, x: number, y: number, w: number, c: string) { rc(g, x, y, w, 1, c); }
export function vline(g: Ctx, x: number, y: number, h: number, c: string) { rc(g, x, y, 1, h, c); }
/** 像素椭圆（无抗锯齿）。 */
export function ell(g: Ctx, x0: number, y0: number, rx: number, ry: number, c: string) {
    g.fillStyle = c;
    for (let j = -ry; j <= ry; j++) { const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry + 0.5))) + 0.5); g.fillRect(x0 - w, y0 + j, w * 2 + 1, 1); }
}

/** 确定性伪随机：同样的坐标始终得到同样的纹理，刷新不会闪烁。 */
export function hash(x: number, y: number, s = 0): number {
    let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function rng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** 字符地图转画布；legend 为字符到颜色，'.' 和空格为透明。 */
export function fromMap(rows: string[], legend: Record<string, string>): Canvas {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const c = mk(w, h), g = cx(c);
    for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        const col = legend[ch];
        if (!col) throw new Error(`像素图例缺少字符 ${ch}`);
        px(g, x, y, col);
    }
    return c;
}

/** 自动 1px 外描边（4 邻域），四周各扩 1px；colFn 可按相邻像素换色（叶子用深绿描边）。 */
export function outline(src: Canvas, col: string = P.ink, colFn: ((r: number, g: number, b: number) => string) | null = null): Canvas {
    const w = src.width, h = src.height, out = mk(w + 2, h + 2), g = cx(out);
    const d = cx(src).getImageData(0, 0, w, h).data;
    const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
        if (alpha(x, y) > 0) continue;
        let hit: number | null = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (alpha(x + dx, y + dy) > 0) { hit = (x + dx + (y + dy) * w) * 4; break; }
        if (hit !== null) px(g, x + 1, y + 1, colFn ? colFn(d[hit], d[hit + 1], d[hit + 2]) : col);
    }
    g.drawImage(src, 1, 1);
    return out;
}
export function flipH(src: Canvas): Canvas {
    const c = mk(src.width, src.height), g = cx(c);
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
}

/** 裁掉多余透明边，锚点为底边中点。 */
export function trim(c: Canvas): Sprite {
    const d = cx(c).getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const o = mk(x1 - x0 + 1, y1 - y0 + 1);
    cx(o).drawImage(c, -x0, -y0);
    return {c: o, ax: o.width >> 1, ay: o.height - 1};
}
/** 水平镜像精灵并同步锚点。 */
export function mirror(s: Sprite): Sprite { return {c: flipH(s.c), ax: s.c.width - 1 - s.ax, ay: s.ay}; }
