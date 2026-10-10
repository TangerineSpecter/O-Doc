import {Container, Graphics, Sprite} from 'pixi.js';
import type {Texture} from 'pixi.js';

export type SlimeBackdrop = 'cave' | 'plain';

/** Shared SVG scenery also renders in the atlas, without another WebGL context. */
export function createSlimeStage(backdrop: SlimeBackdrop, caveTexture?: Texture) {
    const stage = new Container();
    if (backdrop === 'plain') {
        stage.addChild(new Graphics().rect(-1200, -900, 2400, 1800).fill(0xf8fbfc));
        stage.addChild(new Graphics().ellipse(0, 22, 250, 55).fill(0xeef4f5)
            .ellipse(0, 22, 250, 55).stroke({color: 0xe1eaec, width: 2}));
        return stage;
    }
    stage.addChild(new Graphics().rect(-1200, -900, 2400, 1800).fill(0xf0f5f1));
    if (caveTexture) {
        const cave = new Sprite(caveTexture);
        cave.position.set(-320, -311);
        cave.width = 640;
        cave.height = 420;
        stage.addChild(cave);
    }
    return stage;
}
