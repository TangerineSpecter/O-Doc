import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {fishingOverview, fishingTrip} from '../src/mocks/agentWorld/adventure.ts';

const location = new URL('http://localhost/?mockState=populated');
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
const originalItems = fishingOverview.items;
const originalActive = fishingOverview.active;
const [first, second] = fishingOverview.residents;
fishingOverview.items = [first, second].flatMap(resident => Array.from({length: 22}, (_, index) => ({
    ...fishingTrip, id: `${resident.id}-${index}`, actorId: resident.id, actorName: resident.name,
})));
fishingOverview.active = [{...fishingTrip, id: 'active-other', actorId: first.id, endedAt: null, status: 'active'}];
const server = setupServer(...localHandlers, unhandledLocalApi);
server.listen({onUnhandledRequest: 'error'});
after(() => {
    server.close();
    fishingOverview.items = originalItems;
    fishingOverview.active = originalActive;
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
});
const get = async (query = '') => {
    const response = await fetch(`http://localhost/api/settings/agent-world/fishing/?${query}`);
    return {status: response.status, ...(await response.json())};
};

test('filter applies before pagination and total counts only the selected resident', async () => {
    const all = await get();
    assert.equal(all.data.total, 44);
    assert.ok(all.data.items.every(row => row.actorId === first.id));
    for (const key of ['actorId', 'actor_id']) {
        const firstPage = await get(`${key}=${second.id}&page=1`);
        assert.equal(firstPage.status, 200);
        assert.equal(firstPage.data.total, 22);
        assert.equal(firstPage.data.items.length, 20);
        assert.ok(firstPage.data.items.every(row => row.actorId === second.id));
        const lastPage = await get(`${key}=${second.id}&page=2`);
        assert.equal(lastPage.data.items.length, 2);
        assert.equal(lastPage.data.page, 2);
        assert.ok(lastPage.data.items.every(row => row.actorId === second.id));
        assert.equal(lastPage.data.active.length, 0);
    }
});

test('filtered empty, slow and error states remain local', async () => {
    location.search = '?mockState=empty';
    const empty = await get(`actorId=${second.id}`);
    assert.equal(empty.status, 200);
    assert.equal(empty.data.total, 0);
    assert.deepEqual(empty.data.items, []);
    assert.deepEqual(empty.data.active, []);
    location.search = '?mockState=error';
    assert.equal((await get(`actorId=${second.id}`)).status, 503);
    location.search = '?mockState=slow';
    const started = performance.now();
    const slow = await get(`actorId=${second.id}`);
    assert.ok(performance.now() - started >= 1700);
    assert.equal(slow.status, 200);
    assert.equal(slow.data.total, 22);
    location.search = '?mockState=populated';
});
