import assert from 'node:assert/strict';
import {test} from 'node:test';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import type {BlacksmithHistory, BlacksmithRecipe, BlacksmithRecipes} from '../../types/api/blacksmith';
import {allowedBlacksmithMaterials, blacksmithMaterialSources, blacksmithStatus, craftedEquipment, filterBlacksmithRecipes} from '../../components/Blacksmith/blacksmithPresentation';

register('../../../scripts/raw-json-test-loader.mjs', import.meta.url);
const {blacksmithActivities, blacksmithOverview, resolveBlacksmithRoute, runMockBlacksmith} = await import('./blacksmith');
const {combatProfiles} = await import('./adventure');
const actorId = 'local-resident-1';
const base = 'http://localhost/api/settings/agent-world/blacksmith/';
const request = (path: string, method = 'GET', body?: unknown) => new Request(`${base}${path}`, {method,
    ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});

test('完整图鉴包含70条配方；默认展示不足材料，模型可做筛选仍按服务端状态', () => {
    const data = blacksmithOverview(actorId);
    assert.equal(data.recipes.length, 70);
    assert.equal(data.bands.length, 10);
    assert.deepEqual([data.bands[0].levelMin, data.bands[0].levelMax, data.bands[1].levelMin, data.bands[9].levelMax], [1, 10, 10, 99]);
    assert.ok(data.recipes.some(recipe => recipe.state === 'missing'));
    assert.equal(filterBlacksmithRecipes(data.recipes, '', '', false).length, 70);
    const ready = filterBlacksmithRecipes(data.recipes, '10-20', 'weapon', true);
    assert.ok(ready.length > 0);
    assert.ok(ready.every(row => row.state === 'ready' && row.maxPieces <= 3));
    assert.equal(data.qualityProbabilities.reduce((sum, row) => sum + row.probability, 0), 1);
    assert.equal(data.goalState.goals.length, 2);
    assert.equal(data.goalState.freeSlots, 1);
    assert.equal(data.goalState.readyCount, 1);
    assert.ok(data.goalState.goals.some(goal => goal.ingredients.some(row => row.missing > 0)));
    assert.deepEqual(data.goalState.invalidGoals, []);
});

test('高于居民等级的职业后续装备保留，首领模板不会成为类型候选', () => {
    const data = blacksmithOverview(actorId);
    assert.ok(data.recipes.flatMap(row => row.types).some(type => type.levelMin > data.actor!.level));
    assert.equal(data.recipes.flatMap(row => row.types).some(type => type.templateId.startsWith('equip.boss.')), false);
    assert.ok(blacksmithOverview().recipes.every(row => row.state === 'unselected'));
});

test('新手仅有本职业允许装备，不泄漏未来专属武器或精通；后续职业保留本路线精通', () => {
    const profile = combatProfiles.find(row => row.actorId === actorId)!;
    const original = {...profile.progression};
    try {
        profile.progression = {...profile.progression, job: 'job.novice', level: 1};
        const novice = blacksmithOverview(actorId).recipes;
        const weapons = novice.filter(recipe => recipe.slot === 'weapon').flatMap(recipe => recipe.types);
        assert.ok(weapons.length);
        assert.ok(weapons.every(type => type.equipmentType === 'generic' && type.templateId === 'equip.training_sword'));
        assert.ok(novice.flatMap(recipe => recipe.types).every(type => type.jobIds.length === 1 && type.jobIds[0] === 'job.novice'));
        assert.equal(novice.filter(recipe => recipe.slot === 'offhand').flatMap(recipe => recipe.types).length, 0);
        profile.progression = {...profile.progression, job: 'job.mage', level: 10};
        const mageTypes = blacksmithOverview(actorId).recipes.flatMap(recipe => recipe.types);
        const staff = mageTypes.find(type => type.templateId === 'equip.staff')!;
        assert.ok(staff.jobIds.includes('job.elementalist'));
        assert.ok(staff.wearLevel >= 30);
        assert.equal(staff.canEquip, false);
        assert.equal(mageTypes.some(type => type.templateId === 'equip.two_handed_sword'), false);
    } finally {profile.progression = original;}
});

test('档位端点保留同类型的全部合法模板，并按templateId稳定排序', () => {
    const recipes = blacksmithOverview(actorId).recipes;
    const head = recipes.find(recipe => recipe.bandId === '30-40' && recipe.slot === 'head')!;
    assert.deepEqual(head.types.map(type => type.templateId), ['equip.head', 'equip.head.30']);
    assert.deepEqual(head.types.map(type => [type.levelMin, type.levelMax]), [[30, 30], [30, 40]]);
    assert.equal(head.types[0].equipmentType, head.types[1].equipmentType);
    for (const recipe of recipes) assert.deepEqual(recipe.types.map(type => type.templateId), recipe.types.map(type => type.templateId).sort());
});

test('编辑材料按实际怪物和迷宫等级筛选，不按材料标注等级误判', () => {
    const data = blacksmithOverview(actorId);
    const allowed = allowedBlacksmithMaterials(data.materials, {levelMin: 10, levelMax: 20});
    assert.ok(allowed.some(material => material.name === '蝠翼' && material.level < 10));
    assert.equal(allowed.some(material => material.name.includes('印记')), false);
    assert.equal(allowed.some(material => material.name === '星蚀结晶'), false);
});

test('来源展示保留怪物真实等级与迷宫进入等级，明确标出仅端点相交', () => {
    const material = blacksmithOverview(actorId).materials.find(row => row.name === '蝠翼')!;
    assert.equal(material.level, 3);
    const edge = blacksmithMaterialSources(material, {levelMin: 1, levelMax: 10});
    assert.ok(edge.some(source => source.monsterName === '洞穴蝙蝠' && source.levelMin === 10
        && source.levelMax === 14 && source.dungeonLevelMin === 10 && source.boundaryLevel === 10));
    assert.ok(blacksmithMaterialSources(material, {levelMin: 10, levelMax: 20}).every(source => source.boundaryLevel === null));
    assert.deepEqual(blacksmithMaterialSources(material, {levelMin: 20, levelMax: 30}), []);
});

test('历史保留部分成功、完整装备快照与稳定执行归属，不依赖现有库存', () => {
    const activity = blacksmithActivities.find(row => row.actorId === actorId && row.status === 'failed')!;
    assert.equal(blacksmithStatus(activity), '已完成部分打造');
    assert.equal(activity.operations.length, 1);
    const before = JSON.stringify(activity.operations[0]);
    const item = craftedEquipment(activity.operations[0]);
    assert.equal(item.snapshot.quality, 'gold');
    assert.equal(item.snapshot.affixes.length, 3);
    assert.equal(JSON.stringify(activity.operations[0]), before);
    assert.ok(activity.recordId);
});

test('本地列表、详情、空数据与分页历史契约完整，未知路径继续交501兜底', async () => {
    const catalog = await resolveBlacksmithRoute(request(`recipes/?agentId=${actorId}`), false) as BlacksmithRecipes;
    assert.equal(catalog.actor?.id, actorId);
    const history = await resolveBlacksmithRoute(request(`agents/${actorId}/history/?page=1`), false) as BlacksmithHistory;
    assert.equal(history.total, 2);
    assert.ok(history.list.every(row => row.stages.length && row.operations.length));
    const empty = await resolveBlacksmithRoute(request('recipes/'), true) as BlacksmithRecipes;
    assert.deepEqual(empty.recipes, []);
    assert.deepEqual(empty.goalState.goals, []);
    assert.equal(empty.goalState.freeSlots, 3);
    const later = await resolveBlacksmithRoute(request(`agents/${actorId}/history/?page=2`), false) as BlacksmithHistory;
    assert.deepEqual(later.list, []);
    assert.equal(await resolveBlacksmithRoute(request('unknown/'), false), undefined);
});

test('编辑拒绝过低成本与非法材料，合法编辑不改历史配方快照', async () => {
    const beforeHistory = JSON.stringify(blacksmithActivities);
    const recipe = blacksmithOverview(actorId).recipes.find(row => row.id === '10-20:weapon')!;
    const invalid = await resolveBlacksmithRoute(request(`recipes/${encodeURIComponent(recipe.id)}/`, 'PATCH', {ingredients: [{sku: recipe.ingredients[0].sku, quantity: 1}]}), false) as Response;
    assert.equal(invalid.status, 400);
    const valid = await resolveBlacksmithRoute(request(`recipes/${encodeURIComponent(recipe.id)}/`, 'PATCH', {ingredients: recipe.ingredients.map(row => ({sku: row.sku, quantity: row.quantity + 1}))}), false) as BlacksmithRecipe;
    assert.equal(valid.version, recipe.version + 1);
    assert.equal(JSON.stringify(blacksmithActivities), beforeHistory);
});

test('本地立即执行已就绪目标并释放目标位', () => {
    const before = blacksmithOverview(actorId);
    const count = blacksmithActivities.length;
    const activity = runMockBlacksmith(actorId)!;
    const after = blacksmithOverview(actorId);
    assert.ok(activity.operations.length >= 1 && activity.operations.length <= 3);
    assert.equal(Number(before.actor!.energy) - Number(after.actor!.energy), activity.operations.length * 2);
    assert.equal(blacksmithActivities.length, count + 1);
    const recipe = after.recipes.find(row => row.id === activity.operations[0].recipeId)!;
    const prior = before.recipes.find(row => row.id === recipe.id)!;
    assert.ok(recipe.ingredients.every((row, index) => row.available < prior.ingredients[index].available));
    assert.equal(activity.stages[0].scene, 'blacksmith_auto_forge');
    assert.equal(after.goalState.goals.length, before.goalState.goals.length - 1);
    assert.equal(after.goalState.freeSlots, before.goalState.freeSlots + 1);
});

test('纯local全局仍为未匹配API保留501和拒绝访问真实后端', () => {
    const source = readFileSync(new URL('../local.ts', import.meta.url), 'utf8');
    assert.match(source, /code: 501/);
    assert.match(source, /尚未提供本地样例/);
    assert.match(source, /mockState/);
});

test('全局mock覆盖关联生活详情、执行记录和Token正文，不落到未知路由', async () => {
    Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=populated'), configurable: true});
    const {resolveLocalRoute} = await import('./routes');
    const actorActivity = blacksmithActivities.find(row => row.actorId === actorId && row.id.endsWith('completed'))!;
    const get = (path: string) => resolveLocalRoute(new Request(`http://localhost${path}`));
    const overview = await get(`/api/settings/agent-world/blacksmith/recipes/?agentId=${actorId}`) as BlacksmithRecipes;
    assert.equal(overview.recipes.length, 70);
    const record = await get(`/api/settings/agent-run-records/${actorActivity.recordId}/`) as {id: string; taskName: string};
    assert.equal(record.id, actorActivity.recordId);
    assert.equal(record.taskName, '铁匠铺打造');
    const requests = await get(`/api/settings/agent-world/token-usage/requests/?all=1&record_id=${actorActivity.recordId}`) as {items: {id: string; phase: string}[]};
    assert.ok(requests.items.length);
    assert.ok(requests.items.every(row => row.phase.startsWith('blacksmith_')));
    const content = await get(`/api/settings/agent-world/token-usage/requests/${requests.items[0].id}/content/`) as {available: boolean};
    assert.equal(content.available, true);
    const detail = await get(`/api/settings/agent-world/life/schedule/${actorActivity.id}-life/`) as {activity: string; result: {operations: unknown[]}};
    assert.equal(detail.activity, 'blacksmith');
    assert.ok(detail.result.operations.length);
    assert.equal(await get('/api/settings/agent-world/blacksmith/missing-handler/'), undefined);
});
