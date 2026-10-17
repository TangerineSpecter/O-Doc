import assert from 'node:assert/strict';
import test from 'node:test';

import {MAX_CATCH_UP_MS, RAIN_FRAME_MS, TICK_MS, drainTicks, frameInterval, nextDue} from './pacing.ts';

test('drainTicks carries the remainder so 10 ticks per second hold at any frame rate', () => {
    let acc = 0, total = 0;
    for (let i = 0; i < 60; i++) { const r = drainTicks(acc, 1000 / 60); acc = r.acc; total += r.ticks; }
    assert.equal(total, 10);
    acc = 0; total = 0;
    for (let i = 0; i < 1000 / RAIN_FRAME_MS; i++) { const r = drainTicks(acc, RAIN_FRAME_MS); acc = r.acc; total += r.ticks; }
    assert.equal(total, 10);
});

test('drainTicks caps the catch-up after a long pause and ignores negative time', () => {
    assert.equal(drainTicks(0, 60_000).ticks, MAX_CATCH_UP_MS / TICK_MS);
    assert.deepEqual(drainTicks(30, -50), {acc: 30, ticks: 0});
});

test('frameInterval is faster only while it rains', () => {
    assert.equal(frameInterval(true), RAIN_FRAME_MS);
    assert.equal(frameInterval(false), TICK_MS);
    assert.ok(RAIN_FRAME_MS < TICK_MS);
});

test('nextDue keeps a fixed cadence and re-aligns after falling behind', () => {
    assert.equal(nextDue(1000, 1010, 40), 1040);
    assert.equal(nextDue(1000, 1100, 40), 1140);
    assert.equal(nextDue(1000, 1040, 40), 1080);
});
