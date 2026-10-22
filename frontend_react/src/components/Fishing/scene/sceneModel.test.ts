import assert from 'node:assert/strict';
import test from 'node:test';
import type {FishingEvent, FishingTrip} from '../../../types/api/fishing';
import {cueFromEvent, FishingEventCursor, toFishingSceneState} from './sceneModel';
const event = (id: string, data: FishingEvent['data'], kind = 'cast'): FishingEvent => ({id, data, kind, createdAt: '2026-10-22T12:00:00+08:00'});
const caught = event('caught', {catch: {fishId: 'moon_king', name: '镜月鱼王', king: true, weight: 12.3, experience: 100, caughtAt: '2026-10-22T12:00:00+08:00'}}, 'duel_end');

test('初次打开不把旧收获当成实时捕获；刷新重复事件只播放一次', () => {
    const cursor = new FishingEventCursor();
    const old = event('old', {outcome: {kind: 'empty'}});
    assert.deepEqual(cursor.consume([old]), []);
    assert.equal(cursor.consume([caught, old])[0].fishId, 'moon_king');
    assert.deepEqual(cursor.consume([caught, old]), []);
});
test('按接口的逐竿顺序播放，不按相同时间或哈希 id 排序', () => {
    const cursor = new FishingEventCursor(); cursor.consume([]);
    const earlier = event('z', {outcome: {kind: 'empty'}});
    const later = event('a', {outcome: {kind: 'escaped'}});
    assert.deepEqual(cursor.consume([later, earlier]).map(cue => cue.id), ['z', 'a']);
});
test('鱼王成功优先使用真实捕获；空竿、脱钩和准备不伪造鱼', () => {
    assert.equal(cueFromEvent(caught)?.kind, 'catch');
    assert.equal(cueFromEvent(event('loss', {result: 'escaped'}, 'duel_end'))?.kind, 'escaped');
    assert.equal(cueFromEvent(event('wait', {}, 'depart')), null);
    assert.equal(cueFromEvent(event('king', {outcome: {kind: 'king'}})), null);
    assert.equal(cueFromEvent(event('junk', {outcome: {kind: 'junk', name: '旧靴子'}}))?.fishId, undefined);
});
test('无出钓、未授权、准备、鱼王及最终返程状态独立呈现', () => {
    assert.equal(toFishingSceneState(undefined, 'lake').mode, 'idle');
    const trip: FishingTrip = {id: 't', actorId: 'a', actorName: '钓手', status: 'active', authorized: false, plan: {spot: 'river', baits: []}, casts: 0, carried: [], duel: null, error: '', reason: '', catches: [], experience: 0, departedAt: null, deadline: null, createdAt: '', endedAt: null};
    assert.equal(toFishingSceneState(trip).mode, 'paused');
    assert.equal(toFishingSceneState({...trip, status: 'preparing'}).mode, 'preparing');
    assert.equal(toFishingSceneState({...trip, status: 'duel', authorized: true}).mode, 'duel');
    assert.equal(toFishingSceneState({...trip, status: 'completed'}).mode, 'returned');
    assert.equal(toFishingSceneState({...trip, plan: {spot: 'unknown', baits: []}}).spot, 'pond');
});
