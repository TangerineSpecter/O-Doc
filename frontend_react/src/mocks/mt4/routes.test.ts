import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveQuantRoute} from '../quant/routes';
import {quantState, resetQuantStateForTests} from '../quant/state';

const request = (path: string, method = 'GET', body?: unknown) => new Request(`http://localhost/api/${path}`, {method, headers: {'Authorization': 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});

test('MT4 local sample supports list, report, ZIP preview and chart without a real backend', async () => {
    resetQuantStateForTests();
    const base = 'quant/local-mt4/mt4/experts/';
    const list = await resolveQuantRoute(request(base)) as {id: string}[];
    assert.equal(list[0].id, 'local-mt4-expert');
    const detail = await resolveQuantRoute(request(`${base}local-mt4-expert/`)) as {backtests: {data: {events?: unknown}}[]};
    assert.equal(detail.backtests[0].data.events, undefined);
    quantState().assets.push({id: 'local-zip-fixture', name: 'report.zip', type: 'archive', mimeType: 'application/zip', size: 1, text: ''});
    const preview = await resolveQuantRoute(request(`${base}local-mt4-expert/preview/`, 'POST', {assetId: 'local-zip-fixture'})) as {hasChart: boolean; report: {source: string}};
    assert.equal(preview.hasChart, true);
    assert.equal(preview.report.source, 'local-demo');
    const chart = await resolveQuantRoute(request(`${base}local-mt4-expert/tests/local-mt4-test/zip-chart/`)) as Response;
    assert.equal(chart.headers.get('content-type'), 'image/gif');
});
