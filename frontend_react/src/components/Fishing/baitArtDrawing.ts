import {PixelPainter} from '../Combat/art/pixelPainter';
import {drawFishArt} from './fishArtDrawing';
import {getFishArtProfile} from './fishVisuals';

const ink = '#4d4548';
const baitIds = new Set(['worm', 'dough', 'corn', 'minnow', 'shrimp']);
export const baitArtKey = (id: string) => id.replace(/^bait\./, '');

/** 与鱼类、药剂共用整数像素画笔，所有鱼饵绘制在透明 32×32 底图上。 */
export function drawBaitArt(ctx: CanvasRenderingContext2D, id: string) {
    const key = baitArtKey(id);
    if (!baitIds.has(key)) return false;
    ctx.clearRect(0, 0, 32, 32);
    const g = new PixelPainter(ctx);
    if (key === 'worm') {
        const points = [[9, 25], [6, 22], [6, 17], [10, 14], [14, 15], [17, 20], [21, 21], [25, 18], [25, 13], [22, 10], [24, 6]];
        // Round pixel stamps keep the same pose while avoiding square-cut ends and joints.
        const stroke = (color: string, inset: number) => {
            for (let i = 1; i < points.length; i++) {
                const [x, y] = points[i - 1], [tx, ty] = points[i];
                const steps = Math.max(Math.abs(tx - x), Math.abs(ty - y));
                for (let step = 0; step <= steps; step++) {
                    const t = step / steps;
                    const radius = i === 1 ? 2 + t : i === points.length - 1 ? 3 - t : 3;
                    g.ellipse(x + (tx - x) * t, y + (ty - y) * t, radius - inset, radius - inset, color);
                }
            }
        };
        stroke(ink, 0);
        stroke('#c97983', 1);
        for (const [x, y] of [[6, 17], [10, 14], [14, 15], [18, 20], [23, 19], [25, 14], [23, 10]]) g.rect(x, y - 1, 1, 1, '#efb2a9');
        for (const [x, y] of [[6, 18], [10, 14], [16, 19], [22, 20], [24, 13], [22, 9]]) g.rect(x, y, 2, 1, '#9a5a6b');
    } else if (key === 'dough') {
        g.polygon([10, 10, 16, 7, 22, 9, 26, 14, 27, 21, 24, 25, 17, 27, 9, 25, 5, 21, 5, 16], ink);
        g.polygon([10, 12, 16, 9, 21, 11, 24, 15, 25, 20, 22, 24, 16, 25, 9, 23, 7, 20, 7, 16], '#d7ba87');
        g.polygon([10, 12, 16, 9, 21, 11, 23, 15, 23, 19, 19, 22, 10, 21, 7, 18], '#eedbb0');
        g.line(10, 15, 13, 12, '#fff0cd', 2); g.rect(14, 11, 4, 1, '#fff0cd');
        g.rect(16, 15, 4, 1, '#b69a71'); g.rect(14, 16, 2, 2, '#b69a71');
        g.rect(20, 20, 2, 1, '#b69a71'); g.rect(10, 21, 3, 1, '#b69a71');
    } else if (key === 'corn') {
        g.polygon([14, 4, 20, 4, 24, 8, 24, 15, 20, 23, 14, 27, 8, 24, 8, 18, 10, 10], ink);
        g.polygon([14, 6, 19, 6, 22, 9, 22, 15, 18, 22, 13, 25, 10, 23, 10, 18, 12, 10], '#dca544');
        for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
            const x = 14 + col * 3 - Math.floor(row / 2), y = 8 + row * 3;
            g.rect(x, y, 2, 2, col === 0 ? '#ffe49b' : '#f4c85e');
        }
        g.polygon([6, 17, 10, 20, 15, 28, 9, 28, 5, 24, 4, 18], ink);
        g.polygon([6, 20, 9, 22, 12, 27, 9, 26, 6, 23], '#8fac69');
        g.polygon([14, 27, 19, 19, 26, 16, 28, 16, 26, 23, 21, 27], ink);
        g.polygon([17, 25, 20, 21, 26, 18, 24, 23, 20, 25], '#7f9f61');
        g.line(18, 25, 24, 20, '#b8ca83');
    } else if (key === 'minnow') {
        drawFishArt(ctx, getFishArtProfile('dace'));
    } else {
        // A curled shrimp with a clear open centre, segmented shell and thin antennae.
        g.polygon([24, 9, 19, 6, 13, 6, 8, 9, 5, 14, 5, 21, 9, 26, 16, 28, 22, 26, 26, 21, 23, 18, 19, 21, 15, 22, 11, 19, 11, 14, 15, 11, 21, 13, 25, 13], ink);
        g.polygon([22, 10, 18, 8, 13, 8, 9, 11, 7, 15, 7, 20, 10, 24, 16, 26, 21, 24, 24, 21, 23, 20, 19, 23, 14, 24, 9, 20, 9, 13, 14, 9, 20, 11], '#d68677');
        g.polygon([19, 8, 13, 8, 9, 11, 7, 15, 7, 19, 9, 21, 9, 13, 14, 9, 20, 11], '#f2b2a0');
        for (const [x, y] of [[10, 11], [8, 16], [11, 22], [17, 24]]) g.rect(x, y, 3, 1, '#ad675f');
        g.rect(21, 10, 2, 2, ink); g.rect(21, 10, 1, 1, '#fff0d5');
        g.line(24, 10, 28, 7, ink); g.line(28, 7, 28, 4, ink);
        g.line(24, 12, 29, 12, ink); g.line(29, 12, 30, 9, ink);
        for (const x of [11, 16, 21]) g.line(x, 26, x - 1, 29, '#95665e');
    }
    return true;
}
