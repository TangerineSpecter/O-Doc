import {PixelPainter} from './pixelPainter';
import type {PotionArtProfile} from './potionVisuals';

/** Draws a compact 32 px pixel-art potion sprite matching the adventure loot materials. */
export function drawPotionArt(ctx: CanvasRenderingContext2D, profile: PotionArtProfile) {
    ctx.clearRect(0, 0, 32, 32);
    const g = new PixelPainter(ctx);
    const {color, shadow, light, cork, corkLight} = profile;

    g.ellipse(16, 29, 9, 1, '#cbd9d0');

    // Stopper and narrow neck.
    g.rect(11, 2, 10, 6, '#4d4144');
    g.rect(13, 3, 6, 4, cork);
    g.rect(13, 3, 5, 1, corkLight);
    g.rect(12, 8, 8, 5, '#4d4144');
    g.rect(14, 8, 4, 4, '#d9e4d9');
    g.rect(14, 8, 2, 3, '#f0f2d9');

    // Bottle shoulders and glass body.
    g.polygon([12, 11, 20, 11, 20, 12, 24, 14, 26, 18, 26, 25, 23, 29, 9, 29, 6, 25, 6, 18, 8, 14], '#4d4144');
    g.polygon([12, 13, 20, 13, 20, 14, 23, 15, 24, 19, 24, 25, 22, 27, 10, 27, 8, 25, 8, 19, 9, 15], '#d9e4d9');
    g.polygon([12, 13, 15, 13, 15, 17, 10, 19, 9, 24, 8, 22, 9, 16], '#f0f2d9');

    // Potion fill stays below the shoulders; its hue identifies healing vs. mana.
    g.polygon([10, 21, 13, 20, 19, 20, 22, 21, 23, 24, 21, 27, 11, 27, 9, 24], shadow);
    g.polygon([11, 22, 14, 21, 19, 21, 22, 22, 22, 24, 20, 26, 12, 26, 10, 24], color);
    g.rect(12, 22, 5, 1, light);
    g.rect(19, 23, 2, 2, shadow);

    // Crisp glass glints and neck band keep the tiny silhouette readable.
    g.rect(11, 13, 2, 2, '#f4f1d8');
    g.rect(9, 17, 1, 4, '#f4f1d8');
    g.rect(22, 16, 1, 3, '#a8c6c1');
    g.rect(12, 12, 8, 1, '#8b7660');
    g.rect(13, 11, 6, 1, light);
}
