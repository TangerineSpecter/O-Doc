import assert from 'node:assert/strict';
import test from 'node:test';

import {cropKinds} from '../../../types/api/farm.ts';
import type {FarmPlot, FarmState} from '../../../types/api/farm.ts';
import {dayPeriod, plotStage, toSceneState} from './sceneModel.ts';

const rules = {name: '作物', growthSeconds: 100, seedPrice: 1, yield: 1, salePrice: 1};
const plot = (id: string, grown?: number, extra: Partial<FarmPlot> = {}): FarmPlot => ({
    id, wateredUntil: 0, crop: grown === undefined ? null : {kind: 'tomato', grown, checkedAt: 0, plantedAt: 0, rules}, ...extra,
});
const farm = (patch: Partial<FarmState['state']> = {}, top: Partial<FarmState> = {}): FarmState => ({
    id: 'f1', actorName: '可莉', appearance: {style: 2, palette: 3}, balance: '0', revision: 1,
    serverTime: '2026-10-18T04:00:00Z', weather: 'sun', hour: 12, currentAction: null, inventory: [],
    state: {plots: [], buildings: {}, animals: [], ...patch}, ...top,
}) as FarmState;

test('every crop keeps its identity at each growth stage', () => {
    for (const [grown, stage] of [[0, 'seedling'], [35, 'growing'], [100, 'ripe']] as const) {
        const scene = toSceneState(farm({plots: cropKinds.map((kind, slot) => ({
            id: String(slot), wateredUntil: 0,
            crop: {kind, grown, checkedAt: 0, plantedAt: 0, rules},
        }))}));
        assert.deepEqual(scene.plots.map(p => p.crop), [...cropKinds]);
        for (const p of scene.plots) assert.equal(p.stage, stage, `${p.crop}: ${stage}`);
    }
});

test('scene plots follow their ids when the response is unordered', () => {
    const plots = cropKinds.map((kind, slot) => ({
        id: String(slot), wateredUntil: 0,
        crop: {kind, grown: 100, checkedAt: 0, plantedAt: 0, rules},
    }));
    const scene = toSceneState(farm({plots: plots.reverse()}));
    assert.deepEqual(scene.plots.map(p => [p.id, p.crop]), cropKinds.map((kind, slot) => [String(slot), kind]));
});

test('plot stage follows the growth thresholds', () => {
    assert.equal(plotStage(undefined), 'empty');
    assert.equal(plotStage(plot('0')), 'empty');
    assert.equal(plotStage(plot('0', 0)), 'seedling');
    assert.equal(plotStage(plot('0', 34)), 'seedling');
    assert.equal(plotStage(plot('0', 35)), 'growing');
    assert.equal(plotStage(plot('0', 99)), 'growing');
    assert.equal(plotStage(plot('0', 100)), 'ripe');
});

test('day period marks night and twilight tints', () => {
    assert.deepEqual(dayPeriod(2), {night: true, tint: 'none'});
    assert.deepEqual(dayPeriod(20), {night: true, tint: 'none'});
    assert.deepEqual(dayPeriod(6), {night: false, tint: 'dawn'});
    assert.deepEqual(dayPeriod(12), {night: false, tint: 'none'});
    assert.deepEqual(dayPeriod(18), {night: false, tint: 'dusk'});
});

test('scene state exposes 16 slots and marks unowned plots', () => {
    const scene = toSceneState(farm({plots: [plot('0', 100), plot('3')]}));
    assert.equal(scene.plots.length, 16);
    assert.deepEqual(scene.plots.filter(p => p.owned).map(p => p.id), ['0', '3']);
    assert.equal(scene.plots[0].stage, 'ripe');
    assert.equal(scene.plots[1].owned, false);
    assert.equal(scene.plots[1].stage, 'empty');
});

test('wet plots honour the server flag, the watering time and rain', () => {
    const now = Date.parse('2026-10-18T04:00:00Z') / 1000;
    const wet = (state: FarmState) => toSceneState(state).plots[0].wet;
    assert.equal(wet(farm({plots: [plot('0', 10, {wateredUntil: now + 60})]})), true);
    assert.equal(wet(farm({plots: [plot('0', 10, {wateredUntil: now - 60})]})), false);
    assert.equal(wet(farm({plots: [plot('0', 10, {wet: false, wateredUntil: now + 60})]})), false);
    assert.equal(wet(farm({plots: [plot('0', 10)]}, {weather: 'rain'})), true);
    assert.equal(toSceneState(farm({}, {weather: 'rain'})).plots[5].wet, false);
});

test('buildings clamp to level 0-3 and young animals need two adults', () => {
    const animal = (id: string, kind: 'chicken' | 'sheep', building: 'coop' | 'barn') => ({id, kind, building}) as FarmState['state']['animals'][number];
    const scene = toSceneState(farm({
        buildings: {coop: {level: 9, capacity: 8}, barn: {level: -1, capacity: 0}},
        animals: [animal('a', 'chicken', 'coop'), animal('b', 'chicken', 'coop'), animal('c', 'sheep', 'barn')],
    }));
    assert.equal(scene.coop, 3);
    assert.equal(scene.barn, 0);
    assert.equal(scene.animals.length, 3);
    assert.ok(scene.chicks > 0);
    assert.equal(scene.lambs, 0);
    assert.deepEqual(scene.look, {style: 2, palette: 3});
    const empty = toSceneState(farm());
    assert.equal(empty.coop, 0);
    assert.equal(empty.chicks, 0);
});
