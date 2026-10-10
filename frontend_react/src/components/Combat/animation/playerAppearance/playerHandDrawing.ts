import type {PlayerRectPainter} from './playerBaseDrawing';
import type {PlayerHandAnchors} from './playerHandRegistration';

/** Short wrists and chunky fists on the novice's 7 px grid. No stretched arms. */
export function drawPlayerHands(graphics: PlayerRectPainter, holding: boolean, anchors: PlayerHandAnchors) {
    graphics.clear();
    for (const [side, anchor] of Object.entries(anchors)) {
        const gripping = side === 'right' && holding;
        const halfWidth = gripping ? 28 : 21;
        const x = anchor.x - halfWidth;
        const y = anchor.y - 14;
        const width = halfWidth * 2;
        const height = 35;
        // One compact silhouette connects the sleeve to the knuckles. The grip
        // adds one pixel column on each side for the folded thumb and fingers,
        // keeping both palms the same height instead of enlarging the whole fist.
        graphics.rect(x+7,y,width-14,7)
            .rect(x,y+7,width,height-14)
            .rect(x+7,y+height-7,width-14,7).fill(0x39282d);
        graphics.rect(x+7,y+7,width-14,height-14).fill(0xffd7b0);
        graphics.rect(x+7,y+7,width-21,7).fill(0xffe4c5);
        graphics.rect(x+width-14,y+14,7,height-28)
            .rect(x+14,y+height-14,width-28,7).fill(0xe8ac91);
        if (gripping) {
            // Thumb folds across the fingers. Skin shadows, not transparent
            // cuts, describe the grip; the shaft is entirely behind the palm.
            graphics.rect(x+7,y+7,14,14).fill(0xffe4c5);
            graphics.rect(x+14,y+21,14,7).fill(0xe8ac91);
            graphics.rect(x+28,y+14,14,7).fill(0xf1b89a);
        }
    }
}
