import assert from 'node:assert/strict';
import {after, afterEach, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {handlers} from '../src/mocks/handlers.ts';
import {cooking, alchemy} from '../src/mocks/agentWorld/production.ts';
import {residents} from '../src/mocks/agentWorld/residents.ts';

const location = new URL('http://localhost/?mockState=populated');
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
Object.defineProperty(globalThis, 'document', {value: {baseURI: location.href, cookie: ''}, configurable: true});
const server = setupServer(...localHandlers, ...handlers, unhandledLocalApi);
server.listen({onUnhandledRequest: 'error'});
const fixtures = [cooking, alchemy].map(data => ({data, recipes: structuredClone(data.recipes)}));
afterEach(() => {
    location.search = '?mockState=populated';
    for (const {data, recipes} of fixtures) data.recipes.forEach((recipe, index) => Object.assign(recipe, structuredClone(recipes[index])));
});
after(() => {
    server.close();
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
});

const base = 'http://localhost/api/settings/agent-world';
const actorId = residents[0].id;
const ruleFrom = recipe => ({ingredients: recipe.ingredients.map(({sku, quantity}) => ({sku, quantity})),
    requiredLevel: recipe.requiredLevel, salePrice: recipe.salePrice, experience: recipe.experience, energyCost: recipe.energyCost});
async function request(domain, path, method = 'GET', body) {
    const response = await fetch(`${base}/${domain}/${path}`, {method,
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})});
    return {response, payload: await response.json()};
}

for (const [domain, data, maxLevel] of [['cooking', cooking, 99], ['alchemy', alchemy, 10]]) {
    const id = data.recipes[0].id;
    test(`${domain}: list → edit → reread persists the complete current recipe rule`, async () => {
        const before = await request(domain, `recipes/?agentId=${actorId}`);
        assert.equal(before.response.status, 200);
        const recipe = before.payload.data.recipes.find(row => row.id === id);
        const history = (await request(domain, `agents/${actorId}/history/`)).payload.data;
        const rule = {...ruleFrom(recipe), requiredLevel: maxLevel, salePrice: '123.4', experience: 123, energyCost: 7,
            ingredients: [{sku: recipe.ingredients[0].sku, quantity: 3}]};
        const saved = await request(domain, `recipes/${id}/`, 'PATCH', rule);
        assert.equal(saved.response.status, 200, `PATCH ${domain} must be implemented locally`);
        assert.equal(saved.payload.code, 200);
        const expectedPrice = domain === 'alchemy'
            ? (Number(before.payload.data.materials.find(row => row.sku === rule.ingredients[0].sku).salePrice) * 3).toFixed(2)
            : '123.40';
        assert.deepEqual(ruleFrom(saved.payload.data), {...rule, salePrice: expectedPrice});
        const reread = await request(domain, `recipes/?agentId=${actorId}`);
        const updated = reread.payload.data.recipes.find(row => row.id === id);
        assert.deepEqual(ruleFrom(updated), {...rule, salePrice: expectedPrice});
        assert.equal(updated.name, recipe.name);
        assert.equal(updated.iconAssetId, recipe.iconAssetId);
        assert.equal(updated.state, 'locked');
        assert.equal(updated.maxPortions ?? updated.maxBottles, 0);
        assert.ok(updated.ingredients[0].name);
        assert.equal(typeof updated.ingredients[0].owned, 'number');
        assert.deepEqual((await request(domain, `agents/${actorId}/history/`)).payload.data, history,
            'rule edits must preserve completed-operation snapshots');
    });

    test(`${domain}: invalid rules return 400 without changing the catalog`, async () => {
        const before = (await request(domain, 'recipes/')).payload.data;
        const rule = ruleFrom(before.recipes[0]);
        for (const invalid of [
            {}, {...rule, extra: true}, {...rule, requiredLevel: maxLevel + 1}, {...rule, requiredLevel: true},
            {...rule, experience: 0}, {...rule, energyCost: 101}, {...rule, salePrice: '1.234'},
            {...rule, salePrice: '0.0000000001'}, {...rule, salePrice: '1.0000000000000001'},
            {...rule, salePrice: 'NaN'}, {...rule, salePrice: '0'}, {...rule, salePrice: '1000000.01'},
            {...rule, ingredients: []}, {...rule, ingredients: [{sku: '__unknown__', quantity: 1}]},
            {...rule, ingredients: [rule.ingredients[0], rule.ingredients[0]]},
            {...rule, ingredients: [{...rule.ingredients[0], quantity: 0}]},
            {...rule, ingredients: [{...rule.ingredients[0], quantity: 1.5}]},
            {...rule, ingredients: [{...rule.ingredients[0], owned: 10}]},
        ]) {
            const result = await request(domain, `recipes/${id}/`, 'PATCH', invalid);
            assert.equal(result.response.status, 400, JSON.stringify(invalid));
            assert.equal(result.payload.code, 400);
            assert.ok(result.payload.msg);
        }
        assert.deepEqual((await request(domain, 'recipes/')).payload.data, before);
        const missing = await request(domain, 'recipes/__missing__/', 'PATCH', rule);
        assert.equal(missing.response.status, 404);
        assert.equal(missing.payload.code, 400);
        const malformed = await fetch(`${base}/${domain}/recipes/${id}/`, {method: 'PATCH',
            headers: {'Content-Type': 'application/json'}, body: '{'});
        assert.equal(malformed.status, 400);
    });

    test(`${domain}: editing the catalog preserves an already committed life-plan snapshot`, async () => {
        const schedule = async () => (await fetch(`${base}/life/schedule/?view=week`)).json();
        const key = `${domain}Plan`;
        const before = (await schedule()).data.items.find(row => row.activity === domain);
        assert.ok(before?.context[key]);
        const entry = before.context[key].entries[0];
        const saved = await request(domain, `recipes/${entry.recipeId}/`, 'PATCH', {...ruleFrom(entry.rule), salePrice: '987.65'});
        assert.equal(saved.response.status, 200);
        const after = (await schedule()).data.items.find(row => row.id === before.id);
        assert.deepEqual(after.context[key], before.context[key]);
    });

    test(`${domain}: replacing a legal ingredient retains its typed display metadata`, async () => {
        const catalog = (await request(domain, 'recipes/')).payload.data;
        if (domain === 'cooking') {
            assert.ok(catalog.ingredientOptions.some(row => row.sku === 'product.chicken.normal'));
            assert.ok(catalog.ingredientOptions.some(row => row.sku === 'product.cow.normal'));
        }
        const material = domain === 'cooking'
            ? catalog.ingredientOptions.find(row => row.sku === 'product.chicken.normal')
            : catalog.materials.find(row => !catalog.recipes[0].ingredients.some(item => item.sku === row.sku));
        const rule = {...ruleFrom(catalog.recipes[0]), ingredients: [{sku: material.sku, quantity: 1}]};
        for (const [price, normalized] of [['1.2300', '1.23'], ['1e2', '100.00'], ['1_0', '10.00'], ['0.01', '0.01']]) {
            const saved = await request(domain, `recipes/${id}/`, 'PATCH', {...rule, salePrice: price});
            assert.equal(saved.response.status, 200);
            assert.equal(saved.payload.data.salePrice, domain === 'alchemy' ? Number(material.salePrice).toFixed(2) : normalized);
        }
        const reread = (await request(domain, 'recipes/')).payload.data.recipes.find(row => row.id === id);
        assert.equal(reread.ingredients[0].name, material.name);
        assert.equal(typeof reread.ingredients[0].owned, 'number');
        if (domain === 'alchemy') {
            assert.equal(reread.ingredients[0].source, material.dungeon);
            assert.equal(typeof reread.ingredients[0].tier, 'number');
        }
        const unavailable = await request(domain, `recipes/${id}/`, 'PATCH', {...rule, ingredients: [{sku: material.sku, quantity: 10000}]});
        assert.equal(unavailable.response.status, 200);
        const missing = (await request(domain, 'recipes/')).payload.data.recipes.find(row => row.id === id);
        assert.equal(missing.state, 'missing');
        assert.equal(missing.maxPortions ?? missing.maxBottles, 0);
    });

    test(`${domain}: current agent skill and paginated history GET contracts remain available`, async () => {
        const catalog = (await request(domain, 'recipes/')).payload.data;
        assert.equal(catalog.skill, null);
        const selected = (await request(domain, `recipes/?agentId=${actorId}`)).payload.data;
        assert.deepEqual((await request(domain, `agents/${actorId}/`)).payload.data, selected.skill);
        const history = (await request(domain, `agents/${actorId}/history/?page=2&page_size=2`)).payload.data;
        assert.equal(history.page, 2);
        assert.equal(history.pageSize, 2);
        assert.equal(history.total, 8);
        assert.equal(history.list.length, 2);
        assert.ok(history.list.every(row => row.snapshot.name && row.result.experienceGained > 0));
    });

    test(`${domain}: exact paths and methods fail closed in populated and empty states`, async () => {
        for (const state of ['populated', 'empty']) {
            location.search = `?mockState=${state}`;
            for (const [path, method] of [
                ['recipes/', 'POST'], [`recipes/${id}/`, 'GET'], [`recipes/${id}/`, 'PUT'],
                [`recipes/${id}/unknown-action/`, 'PATCH'], ['__new_collection__/items/', 'GET'],
                [`agents/${actorId}/unknown-action/`, 'GET'], [`agents/${actorId}/history/extra/`, 'GET'],
                [`agents/${actorId}/`, 'POST'], [`agents/${actorId}/history/`, 'DELETE'],
            ]) {
                const result = await request(domain, path, method);
                assert.equal(result.response.status, 501, `${state} ${method} ${path}`);
                assert.equal(result.payload.code, 501);
            }
        }
    });

    test(`${domain}: empty state retains typed catalog metadata and empty history`, async () => {
        location.search = '?mockState=empty';
        const catalog = (await request(domain, 'recipes/')).payload.data;
        assert.deepEqual(catalog.recipes, []);
        assert.equal(catalog.skill, null);
        assert.ok((catalog.ingredientOptions || catalog.materials).length);
        const history = (await request(domain, `agents/${actorId}/history/`)).payload.data;
        assert.deepEqual(history.list, []);
        assert.equal(history.total, 0);
        const saved = await request(domain, `recipes/${id}/`, 'PATCH', ruleFrom(data.recipes[0]));
        assert.equal(saved.response.status, 200);
        assert.deepEqual((await request(domain, 'recipes/')).payload.data.recipes, []);
    });

    test(`${domain}: error state returns 503 for reads and edits without changing recipes`, async () => {
        const before = structuredClone(data.recipes[0]);
        location.search = '?mockState=error';
        for (const [path, method, body] of [['recipes/', 'GET'], [`agents/${actorId}/history/`, 'GET'],
            [`recipes/${id}/`, 'PATCH', {...ruleFrom(before), salePrice: '555.00'}]]) {
            const result = await request(domain, path, method, body);
            assert.equal(result.response.status, 503);
            assert.equal(result.payload.code, 503);
        }
        assert.deepEqual(data.recipes[0], before);
    });

    test(`${domain}: slow state delays catalog and edit responses while staying local`, async () => {
        location.search = '?mockState=slow';
        const started = performance.now();
        const results = await Promise.all([request(domain, 'recipes/'),
            request(domain, `recipes/${id}/`, 'PATCH', ruleFrom(data.recipes[0]))]);
        assert.ok(performance.now() - started >= 1700);
        for (const result of results) {
            assert.equal(result.response.status, 200);
            assert.equal(result.payload.code, 200);
        }
    });
}
