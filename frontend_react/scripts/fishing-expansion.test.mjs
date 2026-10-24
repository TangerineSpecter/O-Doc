import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {fishingCatalog, fishingOverview, fishingTrips, fishingInventory} from '../src/mocks/agentWorld/fishing.ts';
import {fishingSpots} from '../src/components/Fishing/spotVisuals.ts';
import {fishArtIdForName, getFishArtProfile} from '../src/components/Fishing/fishVisuals.ts';
import {toFishingSpot} from '../src/components/Fishing/scene/sceneModel.ts';
import {inventory, listings, transactions} from '../src/mocks/agentWorld/production.ts';

const location = new URL('http://localhost/?mockState=populated');
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
const server = setupServer(...localHandlers, unhandledLocalApi);
server.listen({onUnhandledRequest: 'error'});
after(() => {
    server.close();
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
});

test('all fifty stable IDs have their own art and matching ten scene identities', () => {
    const rules = fishingCatalog.rules;
    assert.equal(rules.version, 'fishing-1.2.0');
    assert.equal(rules.maxLevel, 99);
    assert.equal(rules.intervalSeconds, 60);
    assert.equal(Object.keys(rules.fish).length, 50);
    assert.deepEqual(Object.keys(rules.spots), Object.keys(fishingSpots));
    for (const [id, spot] of Object.entries(rules.spots)) {
        assert.equal(toFishingSpot(id), id);
        assert.equal(fishingSpots[id].name, spot.name);
        assert.equal(fishingSpots[id].level, spot.requiredLevel);
    }
    assert.equal(toFishingSpot('unknown'), 'pond');
    assert.equal(toFishingSpot('__proto__'), 'pond');
    for (const [id, fish] of Object.entries(rules.fish)) {
        assert.equal(fishArtIdForName(fish.name), id);
        if (id !== 'crucian') assert.notEqual(getFishArtProfile(id), getFishArtProfile('crucian'), id);
        assert.equal(Boolean(getFishArtProfile(id).king), fish.king, id);
    }
    assert.ok(new Set(Object.keys(rules.fish).slice(15).map(id => getFishArtProfile(id).shape)).size >= 8);
});

test('growth, unlocks, histories and all applicable icon surfaces have typed samples', () => {
    assert.deepEqual(fishingOverview.residents.map(row => row.level), [15,40,70,99]);
    assert.equal(fishingOverview.residents.at(-1).spots.length, 10);
    assert.equal(fishingOverview.residents.at(-1).needed, 0);
    for (const resident of fishingOverview.residents) assert.ok(resident.spots.every(spot => spot.requiredLevel <= resident.level));
    assert.equal(fishingTrips.length, 8);
    assert.equal(fishingInventory.length, 35);
    for (const item of fishingInventory) {
        assert.ok(inventory.some(row => row.id === item.id));
        assert.ok(transactions.some(row => row.result.fishingSku === item.source.sku));
        if (item.rarity === 'rare') assert.ok(listings.some(row => row.item.source?.sku === item.source.sku));
    }
    for (const trip of fishingTrips) {
        assert.equal(trip.eventTotal, trip.events.length);
        assert.equal(trip.experience, trip.events.reduce((sum, event) => sum + event.data.experience, 0));
        assert.equal(trip.catches.reduce((sum, row) => sum + row.quantity, 0), trip.events.length);
        assert.ok(trip.plan.baits.length <= 3);
        for (const event of trip.events) {
            const fish = fishingCatalog.rules.fish[event.data.catch.fishId];
            assert.equal(fish.spot, trip.plan.spot);
            assert.ok(trip.plan.baits.some(bait => fish.preferred.includes(bait) || fish.accepted.includes(bait)));
        }
    }
});

test('catalog, new trip details and four local states never bypass MSW', async () => {
    const get = async path => {
        const response = await fetch(`http://localhost/api/settings/agent-world/fishing/${path}`);
        return {status: response.status, body: await response.json()};
    };
    const catalog = await get('catalog/');
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.data.rules.spots.frost_lake.requiredLevel, 70);
    for (const trip of fishingTrips) {
        const detail = await get(`trips/${trip.id}/`);
        assert.equal(detail.body.data.id, trip.id);
        assert.equal(detail.body.data.plan.spot, trip.plan.spot);
    }
    location.search = '?mockState=empty';
    assert.equal((await get('')).body.data.items.length, 0);
    location.search = '?mockState=error';
    assert.equal((await get('catalog/')).status, 503);
    location.search = '?mockState=slow';
    const started = performance.now();
    assert.equal((await get('catalog/')).status, 200);
    assert.ok(performance.now() - started >= 1700);
    location.search = '?mockState=populated';
    const unknown = await fetch('http://localhost/api/unknown-fishing-expansion/');
    assert.equal(unknown.status, 501);
});
