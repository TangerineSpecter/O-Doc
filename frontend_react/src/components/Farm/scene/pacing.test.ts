import assert from 'node:assert/strict';
import test from 'node:test';

import {FRAME_MS, MAX_CATCH_UP_MS, TICK_MS, drainTicks, lerp, nextDue, tickAlpha} from './pacing.ts';

test('drainTicks carries the remainder so 10 ticks per second hold at any frame rate', () => {
    let acc = 0, total = 0;
    for (let i = 0; i < 60; i++) { const r = drainTicks(acc, 1000 / 60); acc = r.acc; total += r.ticks; }
    assert.equal(total, 10);
    acc = 0; total = 0;
    for (let i = 0; i < 1000 / FRAME_MS; i++) { const r = drainTicks(acc, FRAME_MS); acc = r.acc; total += r.ticks; }
    assert.equal(total, 10);
});

test('drainTicks caps the catch-up after a long pause and ignores negative time', () => {
    assert.equal(drainTicks(0, 60_000).ticks, MAX_CATCH_UP_MS / TICK_MS);
    assert.deepEqual(drainTicks(30, -50), {acc: 30, ticks: 0});
});

test('frames are shorter than a tick so positions are interpolated between ticks', () => {
    assert.ok(FRAME_MS < TICK_MS);
});

test('tickAlpha is the fraction of the current tick and stays within 0–1', () => {
    assert.equal(tickAlpha(0), 0);
    assert.equal(tickAlpha(TICK_MS / 2), .5);
    assert.equal(tickAlpha(TICK_MS * 3), 1);
    assert.equal(tickAlpha(-5), 0);
});

test('lerp blends the previous and current position', () => {
    assert.equal(lerp(10, 20, 0), 10);
    assert.equal(lerp(10, 20, .25), 12.5);
    assert.equal(lerp(10, 20, 1), 20);
});

test('nextDue keeps a fixed cadence and re-aligns after falling behind', () => {
    assert.equal(nextDue(1000, 1010, 40), 1040);
    assert.equal(nextDue(1000, 1100, 40), 1140);
    assert.equal(nextDue(1000, 1040, 40), 1080);
});
