import assert from 'node:assert/strict';
import test from 'node:test';

import {SCENE_H, SCENE_W} from './layout.ts';
import {RAIN_LAYERS, streakPixels, tilesFor, type RainLayerSpec} from './rainPattern.ts';

test('every layer yields one streak per grid cell, inside the tile and without duplicates', () => {
    for (const spec of RAIN_LAYERS) {
        const pixels = streakPixels(spec), keys = new Set(pixels.map(p => p.join()));
        assert.equal(keys.size, pixels.length);
        assert.ok(pixels.length >= spec.cols * spec.rows * spec.minLen);
        assert.ok(pixels.length <= spec.cols * spec.rows * spec.maxLen);
        for (const [x, y] of pixels) {
            assert.ok(Number.isInteger(x) && Number.isInteger(y));
            assert.ok(x >= 0 && x < spec.tileW && y >= 0 && y < spec.tileH);
        }
    }
});

test('the pattern is deterministic for a seed and differs between seeds', () => {
    const a = streakPixels(RAIN_LAYERS[0]), b = streakPixels(RAIN_LAYERS[0]);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, streakPixels({...RAIN_LAYERS[0], seed: RAIN_LAYERS[0].seed + 1}));
});

test('streaks that cross the tile edge wrap around so tiles join seamlessly', () => {
    const spec: RainLayerSpec = {tileW: 8, tileH: 4, cols: 1, rows: 1, minLen: 4, maxLen: 4, color: '#fff', alpha: 1, fall: 10, drift: 1, seed: 3};
    const pixels = streakPixels(spec);
    assert.equal(pixels.length, 4);
    assert.equal(new Set(pixels.map(([, y]) => y)).size, 4); // 长度等于图案高度：每一行恰好一个点
});

test('far layer is slower than the near layer and the whole scene stays dense but sparse enough to read as rain', () => {
    const [far, near] = RAIN_LAYERS;
    assert.ok(far.fall < near.fall && far.drift < near.drift);
    const tiles = (SCENE_W * SCENE_H) / (far.tileW * far.tileH);
    const streaks = RAIN_LAYERS.reduce((n, s) => n + s.cols * s.rows, 0) * tiles;
    assert.ok(streaks >= 80 && streaks <= 160, `streaks=${streaks}`);
});

test('tilesFor adds one tile of slack beyond the scene', () => {
    assert.equal(tilesFor(324, 162), 3);
    assert.equal(tilesFor(216, 108), 3);
    assert.equal(tilesFor(216, 100), 4);
});
