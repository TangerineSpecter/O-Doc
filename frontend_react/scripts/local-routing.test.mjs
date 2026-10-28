import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {handlers} from '../src/mocks/handlers.ts';
import {journey, exploration} from '../src/mocks/agentWorld/adventure.ts';
import {observationRequests} from '../src/mocks/agentWorld/tokenUsage.ts';
import {resetImageGalleryMock} from '../src/mocks/imageGallery/groupRoutes.ts';

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

for (const state of ['populated', 'empty', 'slow', 'error']) {
    test(`image group list, detail and editor dependencies remain local in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        const paths = [
            '/api/article/image/list/local-photo-collection',
            '/api/article/image/detail/local-photo-1',
            '/api/settings/locations/',
            '/api/settings/config/get_image_upload_config/',
        ];
        const started = performance.now();
        const responses = await Promise.all(paths.map(path => fetch(`http://localhost${path}`)));
        if (state === 'slow') assert.ok(performance.now() - started >= 1700);
        const payloads = await Promise.all(responses.map(response => response.json()));
        const expected = state === 'error' ? [503, 503, 503, 200]
            : state === 'empty' ? [200, 404, 200, 200] : [200, 200, 200, 200];
        assert.deepEqual(responses.map(response => response.status), expected);
        assert.ok(responses.every(response => response.status !== 501));
        if (state === 'empty') assert.deepEqual(payloads[0].data, []);
        if (state === 'populated' || state === 'slow') {
            assert.equal(payloads[0].data.length, 3);
            assert.equal(payloads[1].data.imageId, 'local-photo-1');
        }
    });
}

test('image group invalid membership stays local and leaves the list unchanged', async () => {
    location.search = '?mockState=populated';
    const origin = 'http://localhost';
    const before = await (await fetch(`${origin}/api/article/image/list/local-photo-collection`)).json();
    for (const photos of [
        [{imageId: 'local-photo-missing'}],
        [{imageId: 'local-photo-1'}, {imageId: 'local-photo-foreign'}],
        [{imageId: 'local-photo-1'}, {imageId: 'local-photo-1'}],
    ]) {
        const response = await fetch(`${origin}/api/article/image/group/local-photo-group`, {method: 'PUT',
            headers: {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'}, body: JSON.stringify({photos})});
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, 400);
    }
    const after = await (await fetch(`${origin}/api/article/image/list/local-photo-collection`)).json();
    assert.deepEqual(after.data, before.data);
    const missing = await fetch(`${origin}/api/article/image/other-unimplemented-route`);
    assert.equal(missing.status, 501);
});

test('single photo deletion and its list refresh stay local', async () => {
    location.search = '?mockState=populated';
    resetImageGalleryMock();
    try {
        const response = await fetch('http://localhost/api/article/image/delete/local-photo-1', {
            method: 'DELETE', headers: {Authorization: 'Token local-demo-token'},
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).code, 200);
        const listing = await fetch('http://localhost/api/article/image/list/local-photo-collection');
        const data = (await listing.json()).data;
        assert.equal(data.some(image => image.imageId === 'local-photo-1'), false);
        assert.equal(data.find(image => image.imageId === 'local-photo-2').photoGroupId, '');
    } finally {
        resetImageGalleryMock();
    }
});

test('single photo edit and missing-image error responses stay local', async () => {
    location.search = '?mockState=populated';
    resetImageGalleryMock();
    try {
        const update = await fetch('http://localhost/api/article/image/update/local-photo-1', {
            method: 'PUT', headers: {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'},
            body: JSON.stringify({title: '修改的本地照片'}),
        });
        assert.equal(update.status, 200);
        assert.equal((await update.json()).data.title, '修改的本地照片');
        const reread = await fetch('http://localhost/api/article/image/detail/local-photo-1');
        assert.equal((await reread.json()).data.title, '修改的本地照片');
        for (const [path, method] of [
            ['/api/article/image/detail/local-photo-missing', 'GET'],
            ['/api/article/image/update/local-photo-missing', 'PUT'],
            ['/api/article/image/delete/local-photo-missing', 'DELETE'],
        ]) {
            const response = await fetch(`http://localhost${path}`, {method,
                headers: {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'},
                ...(method === 'PUT' ? {body: '{}'} : {})});
            assert.equal(response.status, 404);
            assert.equal((await response.json()).code, 404);
        }
    } finally {
        resetImageGalleryMock();
    }
});

test('failed local single-photo creation does not change the collection', async () => {
    resetImageGalleryMock();
    try {
        location.search = '?mockState=error';
        const response = await fetch('http://localhost/api/article/image/create', {
            method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'},
            body: JSON.stringify({collId: 'local-photo-collection', title: '失败的照片', imageUrl: '/favicon.svg'}),
        });
        assert.equal(response.status, 503);
        location.search = '?mockState=populated';
        const list = await (await fetch('http://localhost/api/article/image/list/local-photo-collection')).json();
        assert.equal(list.data.length, 3);
        assert.equal(list.data.some(image => image.title === '失败的照片'), false);
    } finally {
        resetImageGalleryMock();
    }
});

for (const state of ['populated', 'empty', 'slow', 'error']) {
    test(`novel public list and reader remain local in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        const headers = state === 'empty' ? {Authorization: 'Token local-demo-token'} : {};
        const paths = ['/api/anthology/list?type=novel', '/api/anthology/detail/local-novel-reader',
            '/api/novel/local-novel-reader/read/', '/api/novel/local-novel-reader/read/local-novel-chapter-2/',
            '/api/novel/local-novel-reader/read/local-novel-broken/',
            '/api/novel/local-novel-reader/read/local-novel-wrong-owner/'];
        const started = performance.now();
        const responses = await Promise.all(paths.map(path => fetch(`http://localhost${path}`, {headers})));
        const data = await Promise.all(responses.map(response => response.json()));
        if (state === 'slow') assert.ok(performance.now() - started >= 1700);
        assert.ok(responses.every(response => response.status !== 501));
        if (state === 'error') {
            assert.deepEqual(responses.map(response => response.status), [503, 503, 503, 503, 503, 503]);
        } else if (state === 'empty') {
            assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 404, 404, 404]);
            assert.deepEqual(data[2].data.chapters, []);
            assert.equal(data[2].data.chapter, null);
        } else {
            assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 200, 404, 404]);
            assert.equal(data[0].data[0].count, 2);
            assert.equal(data[1].data.count, 2);
            assert.deepEqual(data[2].data.chapters.map(chapter => chapter.id), ['local-novel-chapter-1', 'local-novel-chapter-2']);
            assert.equal(data[3].data.chapter.id, 'local-novel-chapter-2');
        }
    });
}

test('authenticated empty novel stays in the reader instead of entering the unmocked workbench', async () => {
    location.search = '?mockState=empty';
    const headers = {Authorization: 'Token local-demo-token'};
    for (const path of ['/api/anthology/list?type=novel', '/api/anthology/detail/local-novel-reader',
        '/api/novel/local-novel-reader/read/']) {
        const response = await fetch(`http://localhost${path}`, {headers});
        assert.equal(response.status, 200);
        const {data} = await response.json();
        assert.equal((Array.isArray(data) ? data[0] : data).canManage, false);
    }
});

test('anonymous local reader cannot open an unpublished empty novel', async () => {
    location.search = '?mockState=empty';
    const list = await (await fetch('http://localhost/api/anthology/list?type=novel')).json();
    const detail = await fetch('http://localhost/api/anthology/detail/local-novel-reader');
    const read = await fetch('http://localhost/api/novel/local-novel-reader/read/');
    assert.deepEqual(list.data, []);
    assert.equal(detail.status, 404);
    assert.equal(read.status, 404);
});

test('unknown local novel reader paths return 404 without a backend request', async () => {
    location.search = '?mockState=populated';
    for (const path of ['/api/anthology/detail/local-novel-missing', '/api/novel/local-novel-missing/read/',
        '/api/novel/local-novel-reader/read/local-novel-missing/']) {
        const response = await fetch(`http://localhost${path}`);
        assert.equal(response.status, 404);
        assert.equal((await response.json()).code, 404);
    }
});

test('moving a grouped photo updates both local collection lists', async () => {
    location.search = '?mockState=populated';
    resetImageGalleryMock();
    try {
        const moved = await fetch('http://localhost/api/article/image/update/local-photo-1', {
            method: 'PUT', headers: {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'},
            body: JSON.stringify({collId: 'local-photo-secondary'}),
        });
        assert.equal(moved.status, 200);
        assert.equal((await moved.json()).data.photoGroupId, '');
        const source = await (await fetch('http://localhost/api/article/image/list/local-photo-collection')).json();
        const target = await (await fetch('http://localhost/api/article/image/list/local-photo-secondary')).json();
        const detail = await (await fetch('http://localhost/api/article/image/detail/local-photo-1')).json();
        assert.equal(source.data.find(image => image.imageId === 'local-photo-2').photoGroupId, '');
        assert.equal(source.data.some(image => image.imageId === 'local-photo-1'), false);
        assert.equal(target.data[0].imageId, 'local-photo-1');
        assert.equal(detail.data.collId, 'local-photo-secondary');
    } finally {
        resetImageGalleryMock();
    }
});

for (const state of ['populated', 'empty', 'slow', 'error']) {
    test(`local regrouping handles ${state} without losing the old group's survivor`, async () => {
        resetImageGalleryMock();
        location.search = `?mockState=${state}`;
        try {
            const started = performance.now();
            const response = await fetch('http://localhost/api/article/image/group/create', {
                method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'},
                body: JSON.stringify({collId: 'local-photo-collection', title: '新组',
                    photos: [{imageId: 'local-photo-1'}, {imageUrl: '/favicon.svg'}]}),
            });
            assert.equal(response.status, state === 'error' ? 503 : state === 'empty' ? 404 : 200);
            if (state === 'slow') assert.ok(performance.now() - started >= 1700);
            if (state === 'populated' || state === 'slow') {
                const list = await (await fetch('http://localhost/api/article/image/list/local-photo-collection')).json();
                assert.equal(list.data.find(image => image.imageId === 'local-photo-2').photoGroupId, '');
                assert.equal(list.data.length, 4);
            }
        } finally {
            resetImageGalleryMock();
        }
    });
}

for (const state of ['populated', 'empty', 'slow', 'error']) {
    test(`second local image collection stays local in ${state}`, async () => {
        location.search = `?mockState=${state}`;
        const started = performance.now();
        const response = await fetch('http://localhost/api/article/image/list/local-photo-secondary');
        const payload = await response.json();
        assert.equal(response.status, state === 'error' ? 503 : 200);
        if (state !== 'error') assert.deepEqual(payload.data, []);
        if (state === 'slow') assert.ok(performance.now() - started >= 1700);
    });
}
