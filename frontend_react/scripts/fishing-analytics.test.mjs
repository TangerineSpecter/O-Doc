import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {analytics} from '../src/mocks/agentWorld/social.ts';
import {day} from '../src/mocks/agentWorld/residents.ts';
const location = new URL('http://localhost/?mockState=populated');
const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
const server = setupServer(...localHandlers, unhandledLocalApi);
server.listen({onUnhandledRequest: 'error'});
after(() => {server.close(); if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location');});
const get = async (query = '') => {
    const response = await fetch(`http://localhost/api/settings/agent-world/analytics/?start_date=${day}&end_date=${day}&${query}`);
    return {status: response.status, ...(await response.json())};
};
test('fishing analytics filters residents and dates', async () => {
    const all = await get();
    assert.equal(all.status, 200);
    assert.equal(all.data.fishingComparison.length, analytics.residents.length);
    const result = await get(`actor_id=${analytics.residents[1].id}`);
    assert.equal(result.data.fishingComparison.length, 1);
    assert.equal(result.data.fishingComparison[0].id, analytics.residents[1].id);
    const outside = await fetch('http://localhost/api/settings/agent-world/analytics/?start_date=2000-01-01&end_date=2000-01-01');
    assert.ok((await outside.json()).data.fishingComparison.every(row => row.catches === 0 && row.ordinaryCatchRate === null));
});
test('empty, loading and error requests stay in local handlers', async () => {
    location.search = '?mockState=empty';
    assert.deepEqual((await get()).data.fishingComparison, []);
    location.search = '?mockState=slow';
    const start = performance.now();
    assert.equal((await get()).status, 200);
    assert.ok(performance.now() - start >= 1700);
    location.search = '?mockState=error';
    assert.equal((await get()).status, 503);
    location.search = '?mockState=populated';
});
