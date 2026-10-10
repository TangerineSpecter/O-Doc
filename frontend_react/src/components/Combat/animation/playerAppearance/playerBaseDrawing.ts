export interface PlayerRectPainter {
    clear(): PlayerRectPainter;
    rect(x:number,y:number,width:number,height:number): PlayerRectPainter;
    fill(color:number): PlayerRectPainter;
}

/** Shared by the lightweight atlas still and the Pixi actor. */
export function drawPlayerBase(base:PlayerRectPainter) {
    base.rect(114,324,147,147).rect(101,352,26,90).rect(249,352,26,90).fill(0x392d34);
    base.rect(174,306,39,30).fill(0xffd7b0);
    base.rect(127,336,121,121).rect(114,364,26,65).rect(248,364,13,65).fill(0xf4e4bd);
    base.rect(140,349,82,26).fill(0xfff2d7).rect(127,429,121,26).fill(0xcbb68d);
    base.rect(114,455,147,48).fill(0x49343c).rect(127,455,52,35).rect(196,455,52,35).fill(0x665044);
}
