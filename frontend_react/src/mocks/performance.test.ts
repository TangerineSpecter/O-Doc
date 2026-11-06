import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import JSZip from 'jszip';
import {resetPerformanceMock, resolvePerformanceRoute, simulatePerformanceActivity} from './performance';
import type {PerformanceEvent, PerformanceOverview, PerformancePolicy, PerformanceSample} from '../types/performance';

beforeEach(resetPerformanceMock);
const base = 'http://localhost/api/system/performance/';
const call = (path: string, method = 'GET', body?: object) => resolvePerformanceRoute(new Request(base + path, {
    method, ...(body ? {body: JSON.stringify(body), headers: {'Content-Type': 'application/json'}} : {}),
}), null);
type Samples = {rows: PerformanceSample[]; total: number; page: number};

test('sample pagination and aggregate amounts agree with generated records', async () => {
    const first = await call('samples/?kind=request&page=1') as Samples;
    const second = await call('samples/?kind=request&page=2') as Samples;
    const overview = await call('overview/') as PerformanceOverview;
    assert.equal(first.rows.length, 20); assert.equal(second.rows.length, 4);
    assert.equal(first.total, 24);
    const rows = [...first.rows, ...second.rows];
    assert.equal(new Set(rows.map(row => row.id)).size, 24);
    assert.equal(overview.byKind.request?.totalMs, rows.reduce((sum, row) => sum + row.durationMs, 0));
    assert.equal(overview.byKind.request?.errors, rows.filter(row => row.status === 'failed').length);
});

test('clear stays empty until explicit activity and never resurrects deleted IDs', async () => {
    const old = (await call('samples/?kind=request') as Samples).rows[0];
    const clearedAt = Date.now() / 1000;
    await call('clear/', 'POST');
    for (let index = 0; index < 3; index++) assert.equal((await call('samples/?kind=request') as Samples).total, 0);
    const missing = await call(`samples/${old.id}/`) as Response;
    assert.equal(missing.status, 404);
    assert.equal(simulatePerformanceActivity(), true);
    const fresh = await call('samples/?kind=request') as Samples;
    assert.equal(fresh.total, 1);
    assert.notEqual(fresh.rows[0].id, old.id);
    assert.ok(new Date(fresh.rows[0].created).getTime() / 1000 >= clearedAt);
    assert.equal((await call(`samples/${old.id}/`) as Response).status, 404);
});

test('paused collection cannot generate records and enabling permits new activity', async () => {
    await call('policy/', 'PUT', {enabled: false});
    await call('clear/', 'POST');
    assert.equal(simulatePerformanceActivity(), false);
    assert.equal((await call('samples/?kind=request') as Samples).total, 0);
    const policy = await call('policy/', 'PUT', {enabled: true}) as PerformancePolicy;
    assert.equal(policy.enabled, true);
    assert.equal(simulatePerformanceActivity(), true);
    assert.equal((await call('samples/?kind=request') as Samples).total, 1);
});

test('new activity uses current thresholds without reclassifying old samples', async () => {
    await call('policy/', 'PUT', {taskMs: 1000000, sqlCount: 100, sqlTotalMs: 1000000});
    simulatePerformanceActivity();
    const overview = await call('overview/') as PerformanceOverview;
    assert.equal(overview.byKind.task?.count, 25);
    assert.equal(overview.byKind.task?.slow, 24);
});

test('diagnostic download is an actual ZIP for the selected record', async () => {
    const id = (await call('samples/?kind=sql') as Samples).rows[0].id;
    const response = await call(`samples/${id}/report/`) as Response;
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    assert.deepEqual(Object.keys(zip.files).sort(), ['evidence.json', 'manifest.json', 'report.md']);
    const detail = JSON.parse(await zip.file('evidence.json')!.async('string')) as {event: PerformanceEvent};
    assert.equal(detail.event.kind, 'sql'); assert.equal(detail.event.id, id);
});

test('unimplemented performance routes still reach the fail-closed 501 fallback', async () => {
    assert.equal(await call('not-provided/'), undefined);
});
