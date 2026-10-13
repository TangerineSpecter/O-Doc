import type {PlayerRectPainter} from './playerBaseDrawing';
import type {PlayerHandAnchors} from './playerHandRegistration';

function drawHand(graphics: PlayerRectPainter, gripping: boolean, anchor: {x: number; y: number}) {
    const x = anchor.x - 21;
    const y = anchor.y - 21;
    // Three stepped widths round the knuckles without smooth curves. Both
    // fists share the same size; gripping is expressed by the folded thumb.
    graphics.rect(x+14,y,14,7)
        .rect(x+7,y+7,28,7)
        .rect(x,y+14,42,14)
        .rect(x+7,y+28,28,7)
        .rect(x+14,y+35,14,7).fill(0x39282d);
    graphics.rect(x+14,y+7,14,7)
        .rect(x+7,y+14,28,14)
        .rect(x+14,y+28,14,7).fill(0xffd7b0);
    graphics.rect(x+14,y+7,14,7)
        .rect(x+7,y+14,14,7).fill(0xffe4c5);
    graphics.rect(x+28,y+21,7,7)
        .rect(x+14,y+28,14,7).fill(0xe8ac91);
    if (gripping) {
        graphics.rect(x+14,y+21,14,7).fill(0xc58d79);
        graphics.rect(x+7,y+21,14,7).fill(0xffe4c5);
    } else {
        graphics.rect(x+21,y+21,7,7).fill(0xf1b89a);
    }
}

/** Draw one wrist-mounted fist so the combat editor can move each hand independently. */
export function drawPlayerHand(graphics: PlayerRectPainter, gripping: boolean) {
    graphics.clear();
    drawHand(graphics, gripping, {x: 0, y: 0});
}

/** Static reference art uses the same fists at the registered battle wrists. */
export function drawPlayerHands(graphics: PlayerRectPainter, holding: boolean, anchors: PlayerHandAnchors) {
    graphics.clear();
    drawHand(graphics, false, anchors.left);
    drawHand(graphics, holding, anchors.right);
}
