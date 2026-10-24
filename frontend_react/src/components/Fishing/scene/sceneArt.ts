import {cx, ell, hash, mk, rc, type Ctx} from '../../Farm/scene/pixel';
import {drawTree, drawFlower, drawTuft} from '../../Farm/scene/treeSprites';
import {drawBarrel, drawLamp, drawSign} from '../../Farm/scene/propSprites';
import {drawFenceH} from '../../Farm/scene/fenceSprites';
import type {FishingSpot} from './sceneModel';
import {palettes} from './spotPalettes';
import {buildExpansionBackground, drawAtmosphere} from './sceneExpansionArt';
import {SCENE_WIDTH, SCENE_HEIGHT, WATER_EDGE, shoreX, stamp, reeds, pier} from './scenePrimitives';
export {SCENE_WIDTH, SCENE_HEIGHT, stamp, pixelLine} from './scenePrimitives';

export function buildFishingBackground(spot: FishingSpot): HTMLCanvasElement {
    if (spot !== 'pond' && spot !== 'river' && spot !== 'lake') return buildExpansionBackground(spot);
    const c = mk(SCENE_WIDTH, SCENE_HEIGHT, true), g = cx(c), p = palettes[spot];
    rc(g, 0, 0, SCENE_WIDTH, SCENE_HEIGHT, p.water);
    for (let y = 0; y < SCENE_HEIGHT; y += 3) {
        const edge = shoreX(y);
        rc(g, 0, y, edge, 3, p.grass);
        rc(g, edge, y, 10, 3, p.sand);
        rc(g, edge + 10, y, 4, 3, p.light);
        rc(g, edge + 14, y, 9, 3, '#80b9b2');
        if (spot === 'river') rc(g, 552 - (edge - WATER_EDGE), y, 40, 3, p.sand);
    }
    // 小径连着岸边的栈桥，草地噪点只铺在陆地上。
    for (let i = 0; i < 1500; i++) {
        const x = Math.floor(hash(i, 5) * 218), y = Math.floor(hash(i, 8) * SCENE_HEIGHT);
        if (x < shoreX(y) - 6) rc(g, x, y, 2, 2, i % 3 ? '#c7d69a' : p.dark);
    }
    rc(g, 112, 0, 30, SCENE_HEIGHT, p.sand);
    rc(g, 113, 170, 65, 35, p.sand);
    for (let y = 2; y < SCENE_HEIGHT; y += 12) {
        rc(g, 114, y, 26, 1, '#c3b988'); rc(g, 114 + (y % 24 ? 12 : 0), y, 1, 11, '#c3b988');
        rc(g, 116, y + 2, 8, 1, '#eee0b5');
    }
    for (let i = 0; i < 24; i++) {
        const x = 14 + hash(i, 12) * 180, y = 25 + hash(i, 15) * 295;
        if (x < 102 || (x > 150 && (y < 135 || y > 245))) stamp(g, i % 3 ? drawTuft() : drawFlower(i % 2 ? 'white' : 'yellow'), x, y);
    }
    stamp(g, drawFenceH(42), 8, 148); stamp(g, drawFenceH(40), 10, 254);
    const trees: [number, number, 'green' | 'pine' | 'orange' | 'bush'][] = [
        [22, 61, 'green'], [66, 45, 'green'], [93, 88, 'pine'], [27, 114, 'orange'],
        [171, 60, 'green'], [188, 100, 'bush'], [23, 306, 'pine'], [66, 328, 'green'],
        [175, 320, 'green'], [199, 290, 'bush'], [65, 227, 'bush'],
    ];
    trees.forEach(([x, y, kind]) => {
        ell(g, x + 4, y, kind === 'bush' ? 17 : 25, 5, p.dark);
        stamp(g, drawTree(spot === 'river' && kind === 'orange' ? 'pine' : kind), x, y);
    });
    stamp(g, drawSign('fish'), 161, 157); stamp(g, drawLamp(spot === 'lake'), 147, 249);
    stamp(g, drawBarrel(), 91, 174);
    // 休息长椅。
    rc(g, 35, 177, 45, 5, '#805b3d'); rc(g, 35, 184, 45, 5, '#b78756');
    rc(g, 37, 174, 41, 3, '#e6bf7c'); rc(g, 38, 190, 3, 9, '#805b3d'); rc(g, 73, 190, 3, 9, '#805b3d');
    pier(g);
    for (const [x, y] of [[210, 63], [204, 134], [221, 273], [192, 318]]) reeds(g, x, y);
    // 水岸石块、睡莲与远处小岛为不同钓点提供识别。
    for (const [x, y] of [[245, 49], [493, 271], [526, 77]]) {
        if (spot === 'river') {ell(g, x, y, 15, 6, '#578d9e'); ell(g, x, y - 4, 12, 6, '#999d91'); ell(g, x - 3, y - 6, 7, 3, '#d0cdb4');}
        else {ell(g, x, y, 12, 3, p.deep); ell(g, x, y - 2, 9, 3, '#72965d'); rc(g, x, y - 5, 3, 3, '#bad18b'); if (spot === 'pond') {rc(g, x - 4, y - 6, 5, 3, '#efd0c8'); rc(g, x - 2, y - 8, 2, 3, '#fff0da');}}
    }
    if (spot === 'lake') {
        ell(g, 485, 40, 48, 14, '#b8bfa1');
        stamp(g, drawTree('pine'), 477, 39); stamp(g, drawTree('pine'), 508, 45);
    }
    return c;
}
export function drawWater(g: Ctx, spot: FishingSpot, seconds: number) {
    const p = palettes[spot];
    for (let i = 0; i < 65; i++) {
        const x = 245 + (hash(i, 32) * 305 + seconds * (spot === 'stream' ? 13 : spot === 'river' ? 7 : 1.7)) % 305;
        const y = 12 + hash(i, 31) * 302;
        const width = 3 + Math.round(hash(i, 16) * 10);
        g.globalAlpha = 0.18 + (Math.sin(seconds * 1.3 + i) + 1) * 0.14;
        rc(g, x, y, width, 1, p.light);
        if (i % 5 === 0) rc(g, x + 3, y + 3, width / 2, 1, p.light);
    }
    g.globalAlpha = 0.16;
    for (let i = 0; i < 4; i++) {
        const x = 345 + Math.sin(seconds * 0.11 + i * 2) * 65, y = 75 + i * 62;
        ell(g, Math.round(x), y, 6, 2, '#235766'); rc(g, x - 9, y - 2, 3, 4, '#235766');
    }
    g.globalAlpha = 1;
    drawAtmosphere(g, spot, seconds);
}
