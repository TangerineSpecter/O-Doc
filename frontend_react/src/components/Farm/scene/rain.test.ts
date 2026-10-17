import assert from 'node:assert/strict';
import test from 'node:test';

import {SCENE_H, SCENE_W} from './layout.ts';
import {DROP_COUNT, RainField} from './rain.ts';

const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

test('rain pool has a fixed size and drops stay inside the scene while stepping', () => {
    const rain = new RainField(lcg(1)), r = lcg(2);
    assert.equal(rain.drops.length, DROP_COUNT);
    for (let i = 0; i < 500; i++) {
        rain.step(40, r);
        assert.equal(rain.drops.length, DROP_COUNT);
        for (const d of rain.drops) assert.ok(d.y >= -4 && d.y <= SCENE_H + 8 && d.x >= -40 && d.x <= SCENE_W + 20);
    }
    assert.ok(rain.splashes.length < DROP_COUNT, 'splashes expire instead of piling up');
});

test('fall distance depends on elapsed time, not on frame rate', () => {
    const fall = (stepMs: number) => {
        const rain = new RainField(lcg(7));
        for (const d of rain.drops) d.land = 1e6; // 不落地，只看下落距离
        for (let t = 0; t < 400; t += stepMs) rain.step(stepMs, lcg(3));
        return rain.drops.map(d => d.y);
    };
    const a = fall(40), b = fall(100);
    a.forEach((y, i) => assert.ok(Math.abs(y - b[i]) < 1e-6));
});

test('a drop that lands reports its position, spawns a splash and is recycled at the top', () => {
    const rain = new RainField(lcg(5)), landed: [number, number][] = [];
    for (const other of rain.drops) other.land = 1e6;
    const d = rain.drops[0];
    d.x = 100; d.y = 59; d.vy = 40; d.land = 60;
    rain.step(100, () => .5, (x, y) => landed.push([x, y]));
    assert.deepEqual(landed.map(([, y]) => y), [60]);
    assert.ok(Math.abs(landed[0][0] - 100) < 1);
    assert.deepEqual(rain.splashes.map(s => [s.x, s.y]), [[100, 60]]);
    assert.equal(d.y, -4);
    assert.ok(d.land >= 30 && d.land < SCENE_H);
});

test('splashes live 200ms in total', () => {
    const rain = new RainField(lcg(5));
    for (const d of rain.drops) d.land = 1e6;
    rain.splashes.push({x: 10, y: 10, age: 0});
    rain.step(150, () => .5);
    assert.equal(rain.splashes.length, 1);
    rain.step(60, () => .5);
    assert.equal(rain.splashes.length, 0);
});

test('a long stall is clamped so drops do not skip across the scene', () => {
    const rain = new RainField(lcg(9));
    for (const d of rain.drops) d.land = 1e6;
    const before = rain.drops.map(d => d.y);
    rain.step(60_000, () => .5);
    rain.drops.forEach((d, i) => assert.ok(d.y - before[i] <= d.vy * 0.25 + 1e-9));
});
