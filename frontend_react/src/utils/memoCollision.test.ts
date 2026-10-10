import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionCount, drawMemos, replaceMemo} from './memoCollision.ts';
import type {MemoItem} from '../types/api/memo.ts';
const pool = Array.from({length: 10}, (_, i) => ({memoId: String(i), content: `想法${i}`, tag: ''} as MemoItem));
test('distinct samples respect the provided filtered pool', () => {
    const cards = drawMemos(pool.slice(2, 7), 5, [], () => .5);
    assert.equal(new Set(cards.map(c => c.memoId)).size, 5);
    assert.ok(cards.every(c => ['2','3','4','5','6'].includes(c.memoId)));
});
test('retained cards survive redraw and shortage is honest', () => {
    assert.equal(drawMemos(pool, 3, [pool[1]], () => .2)[0].memoId, '1');
    assert.equal(drawMemos(pool.slice(0, 2), 5).length, 2);
    assert.equal(drawMemos([], 3).length, 0);
});
test('invalid preferences return the three-card default', () => {
    for (const value of [null, 'NaN', '2', '100']) assert.equal(collisionCount(value), 3);
    assert.equal(collisionCount('5'), 5);
});
test('single replacement respects locks and never repeats a drawn card', () => {
    const cards=pool.slice(0,3);
    assert.equal(replaceMemo(pool,cards,'0',['0']),cards);
    const next=replaceMemo(pool,cards,'1',['0'],()=>0);
    assert.deepEqual(next.map(card=>card.memoId),['0','3','2']);
    assert.equal(replaceMemo(cards,cards,'1',[]),cards);
});
