import assert from 'node:assert/strict';
import test from 'node:test';
import type {ECharts} from 'echarts/core';
import {installRelationGraphViewport} from './relationGraphViewport.ts';

function fixture(coordinateType: string | null = 'view', zoom: number = 0.5) {
    const actions: Record<string, unknown>[] = [];
    const listeners = new Map<string, () => void>();
    const series = {
        // Deliberately no getZoom: viewport fitting must use the chart's public option.
        coordinateSystem: coordinateType ? {type: coordinateType, dataToPoint: (point: number[]) => point} : undefined,
        getData: () => ({count: () => 2, getItemLayout: (index: number) => index ? [400, 300] : [100, 100]}),
    };
    const zr = {
        on: (event: string, listener: () => void) => {listeners.set(`zr:${event}`, listener);},
        off: (event: string) => {listeners.delete(`zr:${event}`);},
    };
    const chart = {
        getModel: () => ({getSeriesByIndex: () => series}),
        getViewOfSeriesModel: () => ({_layouting: false}),
        getOption: () => ({series: [{zoom}]}),
        getWidth: () => 1100,
        getHeight: () => 620,
        isDisposed: () => false,
        dispatchAction: (action: Record<string, unknown>) => {actions.push(action);},
        getZr: () => zr,
        on: (event: string, listener: () => void) => {listeners.set(event, listener);},
        off: (event: string) => {listeners.delete(event);},
    };
    return {chart: chart as unknown as ECharts, actions, listeners};
}

test('fits a view without getZoom using the zoom updated in chart options', () => {
    const {chart, actions, listeners} = fixture();
    let fitted = 0;
    const viewport = installRelationGraphViewport(chart, () => {fitted++;});
    assert.equal(actions[0].zoom, 2);
    assert.equal(fitted, 1);
    viewport.fit();
    assert.equal(fitted, 2);
    viewport.dispose();
    assert.equal(listeners.size, 0);
});

test('skips missing or unsupported coordinates instead of invoking graph roam', () => {
    for (const type of [null, 'cartesian2d']) {
        const {chart, actions, listeners} = fixture(type);
        const viewport = installRelationGraphViewport(chart, () => assert.fail('unsupported coordinates must not fit'));
        viewport.fit();
        assert.equal(actions.length, 0);
        viewport.dispose();
        assert.equal(listeners.size, 0);
    }
});

test('invalid zoom values fall back to the initial graph zoom', () => {
    for (const zoom of [NaN, Infinity, 0, -1]) {
        const {chart, actions} = fixture('view', zoom);
        const viewport = installRelationGraphViewport(chart, () => {});
        assert.equal(actions[0].zoom, 1);
        viewport.dispose();
    }
});
