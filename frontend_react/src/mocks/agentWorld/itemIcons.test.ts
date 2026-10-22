import assert from 'node:assert/strict';
import {test} from 'node:test';
import {register} from 'node:module';
import type {CookingRecipes} from '../../types/api/cooking';
import type {ItemIcon, ItemImagePage} from '../../types/api/itemIcons';
import type {CatalogItem} from '../../types/api/itemCatalog';
import type {InventoryItem} from '../../types/api/travel';

register('../../../scripts/raw-json-test-loader.mjs', import.meta.url);
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=populated'), configurable: true});
const {resolveLocalRoute} = await import('./routes');
const {resolveItemIconRoute} = await import('./itemIcons');
const base = 'http://localhost/api/settings/agent-world';
const request = (path: string, method = 'GET', body?: unknown) => new Request(`${base}${path}`, {method,
    ...(body !== undefined ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
const resolve = (path: string, method = 'GET', body?: unknown) => resolveLocalRoute(request(path, method, body));

test('有图菜品移除后图鉴、物品列表与背包一同清空，图库资源继续保留并可重新关联', async () => {
    const before = await resolve('/cooking/recipes/') as CookingRecipes;
    const recipe = before.recipes.find(row => row.id === 'baked_potato')!;
    const id = recipe.iconAssetId!;
    assert.ok(id);
    assert.ok(before.recipes.some(row => !row.iconAssetId && !row.iconUrl));
    assert.deepEqual(await resolve(`/item-catalog/${recipe.sku}/icon/`, 'PATCH', {assetId: null}), {sku: recipe.sku, iconAssetId: null});
    const recipes = await resolve('/cooking/recipes/') as CookingRecipes;
    const cleared = recipes.recipes.find(row => row.sku === recipe.sku)!;
    assert.equal(cleared.iconAssetId, null);
    assert.equal(cleared.iconUrl, '');
    const catalog = await resolve('/item-catalog/') as CatalogItem[];
    assert.equal(catalog.find(row => row.sku === recipe.sku)?.iconUrl, '');
    const inventory = await resolve('/inventory/') as InventoryItem[];
    assert.ok(inventory.filter(row => row.source.sku === recipe.sku).every(row => row.iconAssetId === null && row.iconUrl === ''));
    const library = await resolve('/item-icons/') as ItemImagePage<ItemIcon>;
    assert.equal(library.list.find(row => row.id === id)?.usageCount, 0);
    const file = await resolveLocalRoute(new Request(`http://localhost/api/resource/download/${id}`)) as Response;
    assert.equal(file.status, 200);
    assert.match(await file.text(), /<svg/);
    await resolve(`/item-catalog/${recipe.sku}/icon/`, 'PATCH', {assetId: id});
    assert.equal(recipe.iconAssetId, id);
});

test('上传返回单张类型化资源，能读取文件、保存关联并在刷新列表中显示', async () => {
    const form = new FormData();
    const image = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32"/></svg>';
    form.append('file', new Blob([image], {type: 'image/svg+xml'}), 'cucumber.svg');
    form.append('name', '拍黄瓜专属图');
    const uploaded = await resolveLocalRoute(new Request(`${base}/item-icons/`, {method: 'POST', body: form})) as ItemIcon;
    assert.equal(uploaded.name, '拍黄瓜专属图');
    assert.equal(uploaded.width, 256);
    assert.equal(uploaded.fileExists, true);
    const resource = await resolveLocalRoute(new Request(`http://localhost/api/resource/download/${uploaded.id}`)) as Response;
    assert.equal(await resource.text(), image);
    const recipes = await resolve('/cooking/recipes/') as CookingRecipes;
    const recipe = recipes.recipes.find(row => row.name === '拍黄瓜')!;
    await resolve(`/item-catalog/${recipe.sku}/icon/`, 'PATCH', {assetId: uploaded.id});
    const refreshed = await resolve('/cooking/recipes/') as CookingRecipes;
    assert.equal(refreshed.recipes.find(row => row.id === recipe.id)?.iconAssetId, uploaded.id);
    assert.equal(refreshed.recipes.find(row => row.id === recipe.id)?.iconUrl, uploaded.url);
    const library = await resolve('/item-icons/?search=拍黄瓜') as ItemImagePage<ItemIcon>;
    assert.ok(library.list.some(row => row.id === uploaded.id && row.usageCount > 0));
});

test('图标库搜索、空数据与分页支持真实契约，未知路径继续交给501兜底', async () => {
    const empty = await resolveItemIconRoute(request('/item-icons/'), true) as ItemImagePage<ItemIcon>;
    assert.deepEqual(empty.list, []);
    assert.equal(empty.total, 0);
    const first = await resolve('/item-icons/?pageSize=1&page=1') as ItemImagePage<ItemIcon>;
    const second = await resolve('/item-icons/?pageSize=1&page=2') as ItemImagePage<ItemIcon>;
    assert.equal(first.pageSize, 1);
    assert.equal(first.list.length, 1);
    assert.notEqual(first.list[0].id, second.list[0].id);
    const missing = await resolve('/item-icons/?search=不存在的图片') as ItemImagePage<ItemIcon>;
    assert.equal(missing.total, 0);
    assert.equal(await resolveItemIconRoute(request('/item-icons/unknown/action/'), false), undefined);
});

test('非法资源或缺失assetId返回失败且保留原关联，使用中的图片不能从图库删除', async () => {
    const recipes = await resolve('/cooking/recipes/') as CookingRecipes;
    const recipe = recipes.recipes.find(row => row.id === 'baked_potato')!;
    const id = recipe.iconAssetId;
    const before = recipe.iconUrl;
    for (const body of [{assetId: 'missing-local-icon'}, {}]) {
        const response = await resolve(`/item-catalog/${recipe.sku}/icon/`, 'PATCH', body) as Response;
        assert.equal(response.status, 400);
        assert.equal(recipe.iconAssetId, id);
        assert.equal(recipe.iconUrl, before);
    }
    assert.equal((await resolve(`/item-icons/${id}/`, 'DELETE') as Response).status, 409);
    assert.equal((await resolve('/item-catalog/dish.missing/icon/', 'PATCH', {assetId: null}) as Response).status, 404);
    assert.equal((await resolveLocalRoute(new Request('http://localhost/api/resource/download/local-icon-missing')) as Response).status, 404);
    assert.equal(await resolveItemIconRoute(new Request('http://localhost/api/resource/download/local-article-image'), false), undefined);
});
