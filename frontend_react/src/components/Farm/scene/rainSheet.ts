import {SCENE_H, SCENE_W} from './layout';
import {cx, mk, type Canvas, type Ctx} from './pixel';
import {RAIN_LAYERS, streakPixels, tilesFor, type RainLayerSpec} from './rainPattern';

interface Sheet {spec: RainLayerSpec; canvas: Canvas}

/** 把一层雨丝图案平铺成一张比画面大一块图案的整图：窗口在整图上整数滑动，任何位置都与平铺无缝一致。 */
function buildSheet(spec: RainLayerSpec): Sheet {
    const tile = mk(spec.tileW, spec.tileH), tg = cx(tile);
    tg.fillStyle = spec.color; tg.globalAlpha = spec.alpha;
    for (const [x, y] of streakPixels(spec)) tg.fillRect(x, y, 1, 1);
    const w = tilesFor(SCENE_W, spec.tileW) * spec.tileW, h = tilesFor(SCENE_H, spec.tileH) * spec.tileH;
    const canvas = mk(w, h), g = cx(canvas);
    for (let y = 0; y < h; y += spec.tileH) for (let x = 0; x < w; x += spec.tileW) g.drawImage(tile, x, y);
    return {spec, canvas};
}

/** 雨幕：每层一次 drawImage（整数偏移的窗口），按真实时间滑动；没有逐滴的状态与计算。 */
export class RainSheets {
    private readonly sheets = RAIN_LAYERS.map(buildSheet);

    draw(g: Ctx, ms: number) {
        for (const {spec, canvas} of this.sheets) {
            const sx = Math.floor((ms / 1000 * spec.drift) % spec.tileW), sy = spec.tileH - 1 - Math.floor((ms / 1000 * spec.fall) % spec.tileH);
            g.drawImage(canvas, sx, sy, SCENE_W, SCENE_H, 0, 0, SCENE_W, SCENE_H);
        }
    }
}
