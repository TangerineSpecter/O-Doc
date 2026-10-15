// 像素绘制基础工具：所有农场美术都在离屏 canvas 上逐像素绘制，再转成 Pixi 纹理。
export type Color = number;
export type Palette = Record<string, Color | undefined>;

const css = (c: Color, a = 1) => `rgba(${c >> 16 & 255},${c >> 8 & 255},${c & 255},${a})`;

export class Pix {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    constructor(readonly w: number, readonly h: number) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = w; this.canvas.height = h;
        this.ctx = this.canvas.getContext('2d', {willReadFrequently: true})!;
        this.ctx.imageSmoothingEnabled = false;
    }
    rect(x: number, y: number, w: number, h: number, c: Color, a = 1) {
        if (w <= 0 || h <= 0) return this;
        this.ctx.fillStyle = css(c, a); this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
        return this;
    }
    px(x: number, y: number, c: Color, a = 1) {return this.rect(x, y, 1, 1, c, a);}
    /** 横线、竖线快捷方式。 */
    hline(x: number, y: number, w: number, c: Color) {return this.rect(x, y, w, 1, c);}
    vline(x: number, y: number, h: number, c: Color) {return this.rect(x, y, 1, h, c);}
    /** 像素椭圆；color 可为函数，按相对位置返回明暗色。 */
    ellipse(cx: number, cy: number, rx: number, ry: number, c: Color | ((dx: number, dy: number) => Color | null), a = 1) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
                if (dx * dx + dy * dy > 1) continue;
                const color = typeof c === 'function' ? c(dx, dy) : c;
                if (color !== null) this.px(x, y, color, a);
            }
        return this;
    }
    /** 按字符图绘制，'.' 或未定义字符为透明。 */
    map(rows: string[], pal: Palette, ox = 0, oy = 0, flip = false) {
        rows.forEach((row, y) => [...row].forEach((ch, i) => {
            const c = pal[ch];
            if (c !== undefined) this.px(ox + (flip ? row.length - 1 - i : i), oy + y, c);
        }));
        return this;
    }
    line(x0: number, y0: number, x1: number, y1: number, c: Color) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= n; i++) this.px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
        return this;
    }
    /** 给不透明像素加 1px 外描边。 */
    outline(c: Color) {
        const img = this.ctx.getImageData(0, 0, this.w, this.h), d = img.data;
        const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && d[(y * this.w + x) * 4 + 3] > 200;
        const marks: number[] = [];
        for (let y = 0; y < this.h; y++)
            for (let x = 0; x < this.w; x++)
                if (d[(y * this.w + x) * 4 + 3] === 0 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) marks.push(x, y);
        for (let i = 0; i < marks.length; i += 2) this.px(marks[i], marks[i + 1], c);
        return this;
    }
    /** 在已有像素之下补画（用于描边后再加投影）。 */
    under(draw: (p: Pix) => void) {
        this.ctx.globalCompositeOperation = 'destination-over';
        draw(this);
        this.ctx.globalCompositeOperation = 'source-over';
        return this;
    }
    mirror() {
        const p = new Pix(this.w, this.h);
        p.ctx.translate(this.w, 0); p.ctx.scale(-1, 1); p.ctx.drawImage(this.canvas, 0, 0);
        p.ctx.setTransform(1, 0, 0, 1, 0, 0);
        return p;
    }
    draw(src: Pix, x: number, y: number) {this.ctx.drawImage(src.canvas, Math.round(x), Math.round(y)); return this;}
}

/** 确定性哈希噪声，保证每次绘制的地表一致。 */
export const hash = (x: number, y: number, seed = 0) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
/** 平滑值噪声，用于草地和水面的大块明暗。 */
export const noise = (x: number, y: number, scale: number, seed = 0) => {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
