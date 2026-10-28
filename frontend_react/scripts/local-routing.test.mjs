import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {handlers} from '../src/mocks/handlers.ts';
import {journey, exploration} from '../src/mocks/agentWorld/adventure.ts';
import {observationRequests} from '../src/mocks/agentWorld/tokenUsage.ts';

const location = new URL('http://localhost/?mockState=populated');
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
Object.defineProperty(globalThis, 'document', {value: {baseURI: location.href, cookie: ''}, configurable: true});

const server = setupServer(...localHandlers, ...handlers, unhandledLocalApi);
server.listen({onUnhandledRequest: 'error'});
after(() => {
    server.close();
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
});

const base = 'http://localhost/api/settings/agent-world';
const details = [
    {path: `/travel/${journey.id}/`, id: journey.id, command: {action: 'resume'}},
    {path: `/combat/explorations/${exploration.id}/`, id: exploration.id, command: {operation: 'recall'}},
];
async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, {method,
        ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
    return {response, payload: await response.json()};
}

test('combat prepare returns a readable local preparation for solo and join instead of a four-person battle',async()=>{
    location.search='?mockState=populated';
    const {payload:options}=await request('/combat/agents/local-agent-0/adventure-options/');
    const party=options.data.parties[0];
    for(const constraints of [{adventureMode:'solo',durationSeconds:1800},{partyId:party.id,partyRevision:party.revision}]) {
        const {response,payload}=await request('/combat/agents/local-agent-0/','POST',{operation:'prepare',constraints});
        assert.equal(response.status,200);assert.equal(payload.data.status,'preparing');assert.equal(payload.data.party,null);
        const detail=await request(`/combat/explorations/${payload.data.id}/`);
        assert.equal(detail.payload.data.id,payload.data.id);assert.equal(detail.payload.data.status,'preparing');
        const recalled=await request(`/combat/explorations/${payload.data.id}/`,'POST',{operation:'recall'});
        assert.equal(recalled.payload.data.id,payload.data.id);assert.equal(recalled.payload.data.status,'recalled');
    }
});

for (const state of ['populated', 'empty']) {
    test(`known travel and exploration GET/POST details remain local in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        for (const detail of details) for (const method of ['GET', 'POST']) {
            const {response, payload} = await request(detail.path, method, method === 'POST' ? detail.command : undefined);
            assert.equal(response.status, 200);
            assert.equal(payload.code, 200);
            assert.equal(payload.data.id, detail.id);
        }
    });

    test(`unknown nested travel and exploration routes fail closed in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        for (const path of [
            `/travel/${journey.id}/unknown-action/`, '/travel/__new_collection__/items/',
            `/combat/explorations/${exploration.id}/unknown-action/`, '/combat/explorations/__new_collection__/items/',
        ]) {
            const {response, payload} = await request(path);
            assert.equal(response.status, 501, path);
            assert.equal(payload.code, 501);
            assert.match(payload.msg, /尚未提供本地样例/);
        }
    });
}

test('unsupported methods on detail routes fail closed', async () => {
    for (const state of ['populated', 'empty']) {
        location.search = `?mockState=${state}`;
        for (const detail of details) for (const method of ['DELETE', 'PATCH', 'PUT']) {
            const {response, payload} = await request(detail.path, method);
            assert.equal(response.status, 501, `${method} ${detail.path}`);
            assert.equal(payload.code, 501);
        }
    }
});

test('error scenario preserves simulated failures for known details', async () => {
    location.search = '?mockState=error';
    for (const detail of details) {
        const {response, payload} = await request(detail.path);
        assert.equal(response.status, 503);
        assert.equal(payload.code, 503);
    }
});

test('slow scenario delays known details before returning local samples', async () => {
    location.search = '?mockState=slow';
    const started = performance.now();
    const results = await Promise.all(details.map(detail => request(detail.path)));
    assert.ok(performance.now() - started >= 1700, 'local loading delay must be retained');
    results.forEach(({response, payload}, index) => {
        assert.equal(response.status, 200);
        assert.equal(payload.data.id, details[index].id);
    });
});

const legacy = observationRequests.find(row => row.phase === 'life_interleaving');
const observationPaths = [
    `/token-usage/summary/?all=1&agent_id=${legacy.agentKey}`,
    `/token-usage/requests/?all=1&agent_id=${legacy.agentKey}`,
    `/token-usage/requests/${legacy.id}/content/`,
    `/daily-feed/?actor_id=${legacy.agentKey}`,
];
for (const state of ['populated', 'empty', 'slow', 'error']) {
    test(`execution observation lists and bodies stay local in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        const started = performance.now();
        const results = await Promise.all(observationPaths.map(path => request(path)));
        for (const {response, payload} of results) {
            assert.equal(response.status, state === 'error' ? 503 : 200);
            assert.equal(payload.code, state === 'error' ? 503 : 200);
        }
        if (state === 'slow') assert.ok(performance.now() - started >= 1700);
        if (state === 'empty') {
            assert.equal(results[1].payload.data.items.length, 0);
            assert.equal(results[2].payload.data.available, false);
        } else if (state !== 'error') {
            const body = results[2].payload.data;
            assert.ok(body.available && body.request && body.response);
        }
    });
}

for (const state of ['populated', 'empty', 'slow', 'error']) {
    test(`article summary projection stays local in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        const started = performance.now();
        for (const collId of ['', 'local-world']) {
            const response = await fetch(`http://localhost/api/article/list?summary=1&collId=${collId}`);
            const payload = await response.json();
            assert.equal(response.status, state === 'error' ? 503 : 200);
            if (state === 'error') continue;
            assert.ok(Array.isArray(payload.data));
            if (state === 'empty') assert.equal(payload.data.length, 0);
            else {
                assert.ok(payload.data.length > 0);
                for (const article of payload.data) {
                    assert.equal('content' in article, false);
                    assert.equal('mindMap' in article, false);
                    assert.ok(article.articleId && article.title);
                }
            }
        }
        if (state === 'slow') assert.ok(performance.now() - started >= 1700);
    });
}

test('default article list keeps the full content', async () => {
    location.search = '?mockState=populated';
    const response = await fetch('http://localhost/api/article/list');
    const payload = await response.json();
    assert.equal(typeof payload.data[0].content, 'string');
});
