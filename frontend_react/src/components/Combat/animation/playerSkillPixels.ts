import type {Graphics} from 'pixi.js';

type PixelPalette = Record<string, number>;
export const arcanePalette: PixelPalette = {a: 0x485b9a, b: 0x529ed0, c: 0x9be8ec, d: 0xfff9dd};

// Deliberate low-resolution frames, not detailed art with a pixel filter.
export const magicPearl = [
    '....aa....', '...abba...', '..abccba..', '.abcccdda.',
    'abccccdda.', 'abccddcba.', '.abcccba..', '..abbba...', '...aaa....',
];
export const magicComet = [
    '..........aaa...', '.....aa..abcca..', '..a..bbbabcccda.',
    'abbabccccccccdda', '.bbccccdddcccdda', 'abbabcccccccdda.',
    '..a..bbbabccca..', '.....aa..abba...', '..........aa....',
];
export const magicImpact = [
    '.......c.......', '.......d.......', '......cdc......',
    '...b..cdc..b...', '....bccdccb....', '....ccdddcc....',
    '..bccdddddccb..', 'cdddddddddddddc', '..bccdddddccb..',
    '....ccdddcc....', '....bccdccb....', '...b..cdc..b...',
    '......cdc......', '.......d.......', '.......c.......',
];
export function stampPixels(g: Graphics, rows: readonly string[], palette: PixelPalette,
    x: number, y: number, pixel: number, alpha = 1, facing = 1) {
    const width = Math.max(...rows.map(row => row.length));
    const originX = Math.round(x / pixel) * pixel;
    const originY = Math.round(y / pixel) * pixel;
    for (const [key, color] of Object.entries(palette)) {
        let count = 0;
        rows.forEach((row, iy) => {
            for (let ix = 0; ix < row.length; ix++) {
                if (row[ix] !== key) continue;
                const dx = facing > 0 ? ix - width / 2 : width / 2 - ix - 1;
                g.rect(originX + dx * pixel, originY + (iy - rows.length / 2) * pixel, pixel, pixel);
                count++;
            }
        });
        if (count) g.fill({color, alpha});
    }
}
