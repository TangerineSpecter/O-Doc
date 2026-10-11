import type {BattleBackgroundArt} from '../art/battleBackgroundArt';

/** Match the display grid to the hero's pixels; do not blur the actor or its FX. */
export async function loadPixelBattleBackground(art:BattleBackgroundArt) {
    const image=new Image();image.src=art.src;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=art.logicalWidth;canvas.height=art.logicalHeight;
    const context=canvas.getContext('2d')!;context.imageSmoothingEnabled=false;
    context.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}
