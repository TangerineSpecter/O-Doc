import assert from 'node:assert/strict';
import test from 'node:test';

import {Critter, SPEED} from './critters.ts';
import {CFG, SCENE_H, SCENE_W} from './layout.ts';
import {SPLASH_TICKS} from './rainPattern.ts';
import {RESIDENT_SPEED, SPLASHES_PER_TICK, SceneSimulation} from './simulation.ts';
import type {SceneState} from './types.ts';

const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const weather = (rain: boolean, night = false) => ({rain, night}) as SceneState;

test('rain spawns a fixed number of splashes per tick and each one expires after its lifetime', () => {
    const sim = new SceneSimulation(lcg(1));
    sim.tick(weather(true));
    assert.equal(sim.splashes.length, SPLASHES_PER_TICK);
    assert.ok(sim.splashes.every(s => s.t === SPLASH_TICKS));
    for (let i = 0; i < 30; i++) sim.tick(weather(true));
    assert.equal(sim.splashes.length, SPLASHES_PER_TICK * SPLASH_TICKS, 'steady state: spawn rate × lifetime');
    for (const s of sim.splashes) assert.ok(s.x >= 0 && s.x < SCENE_W && s.y >= 30 && s.y < SCENE_H);
    for (let i = 0; i < SPLASH_TICKS; i++) sim.tick(weather(false));
    assert.equal(sim.splashes.length, 0, 'splashes fade out once the rain stops');
});

test('no splashes or ripples appear in dry weather', () => {
    const sim = new SceneSimulation(lcg(2));
    for (let i = 0; i < 50; i++) sim.tick(weather(false));
    assert.equal(sim.splashes.length, 0);
    assert.equal(sim.ripples.length, 0);
});

test('splashes on the pond water raise ripples that die out', () => {
    const sim = new SceneSimulation(() => 0); // 随机源恒为 0：水花落在 (0, 30)，必定通过概率判断
    sim.tick(weather(true));
    assert.equal(sim.ripples.length, 0, '(0, 30) is not water');
    const rand = lcg(3), wet = new SceneSimulation(rand);
    let rippled = false;
    for (let i = 0; i < 400; i++) { wet.tick(weather(true)); rippled ||= wet.ripples.length > 0; }
    assert.ok(rippled, 'a long rain eventually ripples the pond');
    for (let i = 0; i < 12; i++) wet.tick(weather(false));
    assert.equal(wet.ripples.length, 0);
});

test('the resident walks RESIDENT_SPEED pixels per tick and remembers the previous position', () => {
    const sim = new SceneSimulation(lcg(4)), r = sim.resident;
    sim.tick(weather(false));
    const moved = Math.hypot(r.x - r.px, r.y - r.py);
    assert.ok(Math.abs(moved - RESIDENT_SPEED) < 1e-9, `moved ${moved}`);
    const [x, y] = [r.x, r.y];
    sim.tick(weather(false));
    assert.deepEqual([r.px, r.py], [x, y]);
});

test('drawing positions blend the previous and current tick positions with alpha', () => {
    const sim = new SceneSimulation(lcg(5));
    sim.alpha = 0; assert.equal(sim.at(10, 14), 10);
    sim.alpha = .5; assert.equal(sim.at(10, 14), 12);
    sim.alpha = 1; assert.equal(sim.at(10, 14), 14);
});

test('motionKey only changes when something moves to a different pixel', () => {
    const sim = new SceneSimulation(lcg(6));
    sim.tick(weather(false));
    sim.alpha = 0;
    const first = sim.motionKey();
    sim.alpha = 0;
    assert.equal(sim.motionKey(), first, 'same pixels → same key, the frame can be skipped');
    sim.alpha = 1;
    assert.notEqual(sim.motionKey(), first, 'the resident moved two pixels across the tick');
    sim.tick(weather(false)); sim.tick(weather(false));
    const r = sim.resident; r.wait = 5; r.px = r.x; r.py = r.y; sim.alpha = .3;
    const still = sim.motionKey(); sim.alpha = .9;
    assert.equal(sim.motionKey(), still, 'a resting resident gives a stable key at any alpha');
});

test('animals walk at SPEED per tick and are 2–3× faster than the original design values', () => {
    const original = {cow: 0.32, sheep: 0.34, chick: 0.55, hen: 0.5};
    for (const k of ['cow', 'sheep', 'chick', 'hen'] as const) {
        const ratio = SPEED[k] / original[k];
        assert.ok(ratio >= 2 && ratio <= 3, `${k}: ${ratio}`);
    }
    assert.ok(RESIDENT_SPEED / 0.8 >= 2 && RESIDENT_SPEED / 0.8 <= 3);
    const group: Critter[] = [], hen = new Critter('hen', CFG.coopZone, [], lcg(7), group, 'a');
    group.push(hen);
    let walked = 0;
    for (let i = 0; i < 600 && walked < 20; i++) {
        hen.tick();
        const d = Math.hypot(hen.x - hen.px, hen.y - hen.py);
        if (d > 0 && hen.state === 'walk') { assert.ok(d <= SPEED.hen + 1e-9); walked++; }
    }
    assert.ok(walked >= 20, 'the hen walked');
});
