import rawRules from './blacksmithRules.json?raw';
import catalog from './catalog';
import {residents, at} from './residents';
import {combatProfiles} from './adventure';
import type {BlacksmithActivity, BlacksmithIngredient, BlacksmithMaterial, BlacksmithOperation, BlacksmithRecipe, BlacksmithRecipes, BlacksmithType} from '../../types/api/blacksmith';
import type {DailyFeedEvent} from '../../types/api/dailyFeed';
import type {LifeItem} from '../../types/api/agentLife';

type Rule = Omit<BlacksmithRecipe, 'types' | 'state' | 'disabledReason' | 'maxPieces' | 'ingredientValue' | 'timesMade' | 'ingredients'> & {ingredients: Pick<BlacksmithIngredient, 'sku' | 'name' | 'price' | 'quantity'>[]};
const rules = JSON.parse(rawRules) as Rule[];
const tables = catalog.combat.tables;
const usedMaterials = new Map<string, number>();
const completedGoalActors = new Set<string>();
export const blacksmithMaterials: BlacksmithMaterial[] = tables.materials.map(material => {
    const sources = tables.drops.filter(row => row.itemKind === 'material' && row.itemId === material.id).flatMap(drop => {
        const monster = tables.monsters.find(row => row.id === drop.monsterId)!;
        const entry = tables.dungeonMonsters.find(row => row.monsterId === monster.id);
        const dungeon = tables.dungeons.find(row => row.id === entry?.dungeonId || row.bossId === monster.id)!;
        return dungeon ? [{monsterId: monster.id, monsterName: monster.name || '', rank: monster.rank || '',
            levelMin: Number(entry?.levelMin || monster.levelMin), levelMax: Number(entry?.levelMax || monster.levelMax),
            dungeonId: dungeon.id, dungeonName: dungeon.name || '', dungeonLevelMin: Number(dungeon.recommendedLevelMin), dungeonLevelMax: Number(dungeon.recommendedLevelMax)}] : [];
    });
    return {sku: `combat.${material.id}`, name: material.name || material.id, level: Number(material.level), salePrice: material.salePrice || '0', sources,
        source: [...new Set(sources.map(row => row.dungeonName))].join('、')};
}).filter(row => row.sources.some(source => source.rank !== 'boss'));

function routeJobs(jobId: string) {
    if (jobId === 'job.novice') return new Set([jobId]);
    const descendants = new Set([jobId]);
    for (let i = 0; i < tables.professions.length; i++) for (const row of tables.professions) if (row.enabled === '1' && row.parentId && descendants.has(row.parentId)) descendants.add(row.id);
    return descendants;
}
function jobPath(jobId: string): Set<string> {
    const result = new Set([jobId]);
    let current = tables.professions.find(row => row.id === jobId);
    while (current?.parentId) {result.add(current.parentId); current = tables.professions.find(row => row.id === current!.parentId);}
    return result;
}
function typesFor(rule: Rule, jobId: string, actorLevel: number): BlacksmithType[] {
    const allowedJobs = routeJobs(jobId);
    return tables.equipmentTemplates.filter(row => row.bossOnly !== '1' && row.enabled === '1' && row.slot === rule.slot
        && Number(row.levelMin) <= rule.levelMax && Number(row.levelMax) >= rule.levelMin).flatMap(row => {
        const low = Math.max(rule.levelMin, Number(row.levelMin));
        const mastery = (row.requiredMastery || '').split(';').filter(Boolean);
        const jobLevels = [...allowedJobs].flatMap(job => {
            const path = jobPath(job);
            const thresholds = mastery.length ? tables.skills.filter(skill => mastery.includes(skill.id)
                && skill.enabled === '1' && path.has(skill.professionId || '')).map(skill => Number(skill.learnLevel))
                : tables.equipmentProfessions.some(item => item.equipmentId === row.id && item.professionId === job) ? [1] : [];
            if (!thresholds.length) return [];
            const wearLevel = Math.max(low, Math.min(...thresholds), Number(tables.professions.find(item => item.id === job)?.requiredLevel || 1));
            return wearLevel <= 99 ? [{job, wearLevel}] : [];
        });
        if (!jobLevels.length) return [];
        return [{id: row.id, templateId: row.id, name: row.name || row.id, equipmentType: row.equipmentType || 'generic', typeName: row.name || '',
            levelMin: low, levelMax: Math.min(rule.levelMax, Number(row.levelMax)),
            wearLevel: Math.min(...jobLevels.map(item => item.wearLevel)), jobIds: jobLevels.map(item => item.job).sort(),
            canEquip: jobLevels.some(item => item.job === jobId && actorLevel >= item.wearLevel)}];
    }).sort((left, right) => left.templateId < right.templateId ? -1 : left.templateId > right.templateId ? 1 : 0);
}

export function blacksmithOverview(actorId = '', empty = false): BlacksmithRecipes {
    const resident = residents.find(row => row.id === actorId);
    const profile = combatProfiles.find(row => row.actorId === actorId);
    const actor = resident && profile ? {id: resident.id, name: resident.name, initialized: profile.initialized,
        level: profile.progression.level, jobId: profile.progression.job,
        jobName: tables.professions.find(row => row.id === profile.progression.job)?.name || '战士', energy: Number(resident.stamina)} : null;
    const sampleRule = rules.find(rule => rule.bandId === '10-20' && rule.slot === 'weapon');
    const sampleType = sampleRule && actor ? typesFor(sampleRule, actor.jobId, actor.level)[0] : undefined;
    const missingGoals = !empty && actor && sampleRule && sampleType ? [{id: `goal-${actor.id}-missing`,
        recipeId: sampleRule.id, templateId: sampleType.templateId, bandId: sampleRule.bandId,
        bandLabel: sampleRule.bandLabel, slot: sampleRule.slot, slotName: sampleRule.slotName,
        typeName: sampleType.name, ready: false,
        ingredients: sampleRule.ingredients.map(row => ({sku: row.sku, name: row.name,
            required: row.quantity, available: Math.max(0, row.quantity - 5), missing: Math.min(5, row.quantity)}))}] : [];
    const readyGoals = !empty && actor && sampleRule && sampleType && !completedGoalActors.has(actor.id) ? [{id: `goal-${actor.id}-ready`,
        recipeId: sampleRule.id, templateId: sampleType.templateId, bandId: sampleRule.bandId,
        bandLabel: sampleRule.bandLabel, slot: sampleRule.slot, slotName: sampleRule.slotName,
        typeName: sampleType.name, ready: true,
        ingredients: sampleRule.ingredients.map(row => ({sku: row.sku, name: row.name,
            required: row.quantity, available: row.quantity, missing: 0}))}] : [];
    const sampleGoals = [...readyGoals, ...missingGoals];
    const goalState = {goals: sampleGoals, invalidGoals: [], freeSlots: 3 - sampleGoals.length,
        readyCount: readyGoals.length, canRegister: Boolean(actor?.initialized)};
    return {recipes: empty ? [] : rules.map(rule => {
        const types = actor?.initialized ? typesFor(rule, actor.jobId, actor.level) : [];
        const ingredients = rule.ingredients.map(row => {
            const material = blacksmithMaterials.find(item => item.sku === row.sku)!;
            const owned = actor && material.level <= 20 ? Math.max(0, 160 - (usedMaterials.get(`${actor.id}:${row.sku}`) || 0)) : 0, reserved = owned && row.sku.endsWith('moss_cave.2') ? 20 : 0;
            return {...row, owned, reserved, available: owned - reserved, source: material.source};
        });
        const max = Math.min(3, Math.floor((actor?.energy || 0) / 2), ...ingredients.map(row => Math.floor(row.available / row.quantity)));
        const state = !actor ? 'unselected' : !actor.initialized || !types.length ? 'unavailable' : ingredients.some(row => row.available < row.quantity) ? 'missing' : actor.energy < 2 ? 'tired' : 'ready';
        return {...rule, ingredients, types, state, disabledReason: state === 'ready' ? '' : !actor ? '请先选择居民' : !actor.initialized ? '尚未建立冒险档案' : state === 'unavailable' ? '当前职业路线在本档没有可打造类型' : state === 'missing' ? '可用材料不足' : '体力不足',
            maxPieces: state === 'ready' ? max : 0, ingredientValue: ingredients.reduce((sum, row) => sum + Number(row.price) * row.quantity, 0).toFixed(2), timesMade: 0};
    }), goalState, materials: blacksmithMaterials, bands: [...new Map(rules.map(row => [row.bandId, {id: row.bandId, label: row.bandLabel, levelMin: row.levelMin, levelMax: row.levelMax}])).values()],
    qualityProbabilities: [{quality: 'white', probability: .7}, {quality: 'blue', probability: .25}, {quality: 'gold', probability: .05}], energyCost: 2, maxPieces: 3, actor};
}

function makeActivity(actorId: string, partial: boolean, serial: string, count = 2): BlacksmithActivity {
    const resident = residents.find(row => row.id === actorId) || residents[0];
    const overview = blacksmithOverview(resident.id);
    const recipe = overview.recipes.find(row => row.bandId === '10-20' && row.slot === 'weapon' && row.state === 'ready') || overview.recipes.find(row => row.state === 'ready') || overview.recipes.find(row => row.types.length)!;
    const type = recipe.types[0];
    const id = `local-blacksmith-${resident.id}-${serial}`;
    const operations: BlacksmithOperation[] = Array.from({length: partial ? 1 : count}, (_, i) => {
        const quality = partial ? 'gold' : i === 0 ? 'white' : 'blue';
        const level = Math.min(type.levelMax, Math.max(type.levelMin, 16 + i));
        return {id: `${id}-piece-${i + 1}`, ownerId: 'local-user', actorId: resident.id, actorName: resident.name, opportunityId: id, pieceIndex: i,
            recipeId: recipe.id, snapshot: {rule: structuredClone(recipe), templateId: type.templateId, bandId: recipe.bandId, slot: recipe.slot},
            result: {equipmentId: `${id}-equipment-${i + 1}`, item: {templateId: type.templateId, name: `${quality === 'gold' ? '辉耀' : quality === 'blue' ? '精良' : '朴素'}的${type.name}`,
                slot: recipe.slot, equipmentType: type.equipmentType, grip: 'one_handed', level, quality, value: '20.00', stats: {physicalAttack: 38 + i * 6},
                affixes: [{id: 'affix.strength', stat: 'strength', value: 3 + i}, ...(quality !== 'white' ? [{id: 'affix.vitality', stat: 'vitality', value: 2}] : []), ...(quality === 'gold' ? [{id: 'affix.luck', stat: 'luck', value: 2}] : [])]},
                rules: {version: 1, slot: recipe.slot, equipmentType: type.equipmentType, grip: 'one_handed', jobLevels: Object.fromEntries(type.jobIds.map(job => [job, type.wearLevel]))},
                catalogId: catalog.combat.version, quantity: 1, energyCost: 2, ingredientValue: recipe.ingredientValue, value: '20.00', level, quality},
            reason: '补齐当前职业路线的武器缺口', createdAt: at(13 + i)};
    });
    const stages = operations.flatMap(operation => [
        {pieceIndex: operation.pieceIndex, scene: 'blacksmith_level_band', phase: 'band', choice: recipe.bandId, label: recipe.bandLabel, reason: '根据材料与装备缺口选择范围'},
        {pieceIndex: operation.pieceIndex, scene: 'blacksmith_slot', phase: 'slot', choice: recipe.slot, label: recipe.slotName, reason: '优先补齐武器'},
        {pieceIndex: operation.pieceIndex, scene: 'blacksmith_type', phase: 'type', choice: type.templateId, label: type.name, reason: '当前职业路线可用'},
        {pieceIndex: operation.pieceIndex, scene: 'blacksmith_continue', phase: 'continue', choice: partial || operation.pieceIndex === 1 ? 'stop' : 'continue', label: partial ? '等待决策恢复' : operation.pieceIndex === 1 ? '结束打造' : '继续打造', reason: partial ? '已保留本件成品，后续决策暂时不可用' : operation.pieceIndex === 1 ? '装备需求已满足' : '查看成品后希望继续补齐装备'},
    ]);
    return {id, actorId: resident.id, actorName: resident.name, status: partial ? 'failed' : 'success', createdAt: at(13), updatedAt: at(14), recordId: `${id}-run`,
        snapshot: {blacksmith: true, ownerId: 'local-user', stages}, result: {piecesMade: operations.length, operations, reason: partial ? '已完成1件，后续决策中断；成品和消耗保留，恢复时继续原机会。' : `逐件查看成品后结束打造，共完成${operations.length}件。`, stages}, stages, operations};
}
export const blacksmithActivities: BlacksmithActivity[] = residents.flatMap(row => [makeActivity(row.id, false, 'completed'), makeActivity(row.id, true, 'partial')]);
const factFor = (row: BlacksmithActivity): DailyFeedEvent => ({id: `${row.id}-feed`, category: 'blacksmith', source: 'blacksmith', actorId: row.actorId, actorName: row.actorName,
    occurredAt: row.updatedAt, title: `铁匠铺完成${row.operations.length}件装备`, detail: String(row.result.reason), status: row.status, amount: null,
    target: {kind: 'run', id: row.recordId}, steps: row.operations.map(op => ({id: op.id, title: `第${op.pieceIndex + 1}件 · ${op.result.item.name}`, detail: `Lv.${op.result.level} · ${op.result.quality} · 2体力`, occurredAt: op.createdAt || row.createdAt, amount: null}))});
export const blacksmithFacts: DailyFeedEvent[] = blacksmithActivities.map(factFor);
const lifeFor = (row: BlacksmithActivity): LifeItem => ({id: `${row.id}-life`, actorId: row.actorId, taskId: 'local-task-blacksmith', activity: 'blacksmith', source: 'manual',
    originalAt: row.createdAt, scheduledAt: row.createdAt, actualStartedAt: row.createdAt, actualEndedAt: row.status === 'success' ? row.updatedAt : null,
    actualEnergyCost: String(row.operations.length * 2), status: row.status === 'success' ? 'completed' : 'failed', intent: '用迷宫材料补齐装备', budget: '0', spent: '0', recordId: row.recordId,
    result: {reason: String(row.result.reason), piecesMade: row.operations.length, operations: row.operations, stages: row.stages}, domainDetail: {kind: 'blacksmith', id: row.id}, retryAvailable: row.status === 'failed'});
export const blacksmithLifeItems: LifeItem[] = blacksmithActivities.map(lifeFor);

export function runMockBlacksmith(actorId: string) {
    const overview = blacksmithOverview(actorId);
    const goal = overview.goalState.goals.find(row => row.ready);
    if (!goal || Number(overview.actor?.energy || 0) < 2) return null;
    const recipe = overview.recipes.find(row => row.id === goal.recipeId && row.state === 'ready');
    if (!recipe) return null;
    const activity = makeActivity(actorId, false, String(Date.now()), 1);
    activity.operations[0].result.goalId = goal.id;
    activity.snapshot = {...activity.snapshot, version: 2};
    activity.stages = [{phase: 'automatic', scene: 'blacksmith_auto_forge', choice: goal.id,
        reason: '材料齐备，按已登记目标自动打造'}];
    activity.result = {...activity.result, stages: activity.stages, reason: '已完成 1 件已登记目标装备。'};
    for (const op of activity.operations) {
        const rule = (op.snapshot.rule as BlacksmithRecipe);
        for (const ingredient of rule.ingredients) {
            const key = `${actorId}:${ingredient.sku}`;
            usedMaterials.set(key, (usedMaterials.get(key) || 0) + ingredient.quantity);
        }
        combatProfiles.find(profile => profile.actorId === actorId)?.equipment.push({id: op.result.equipmentId, snapshot: structuredClone(op.result.item), rules: structuredClone(op.result.rules), bound: false, locked: false, value: op.result.value});
    }
    const resident = residents.find(row => row.id === actorId)!;
    resident.stamina = String(Number(resident.stamina) - activity.operations.length * 2);
    completedGoalActors.add(actorId);
    blacksmithActivities.unshift(activity);
    blacksmithFacts.unshift(factFor(activity));
    blacksmithLifeItems.unshift(lifeFor(activity));
    return activity;
}
export async function resolveBlacksmithRoute(request: Request, empty: boolean): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname, base = '/api/settings/agent-world/blacksmith/';
    if (request.method === 'GET' && path === `${base}recipes/`) return blacksmithOverview(url.searchParams.get('agentId') || url.searchParams.get('agent_id') || url.searchParams.get('actorId') || url.searchParams.get('actor_id') || '', empty);
    const history = path.match(/^\/api\/settings\/agent-world\/blacksmith\/agents\/([^/]+)\/history\/$/);
    if (request.method === 'GET' && history) {
        const rows = empty ? [] : blacksmithActivities.filter(row => row.actorId === decodeURIComponent(history[1]));
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        return {list: rows.slice((page - 1) * 20, page * 20), total: rows.length, page, pageSize: 20};
    }
    const patch = path.match(/^\/api\/settings\/agent-world\/blacksmith\/recipes\/([^/]+)\/$/);
    if (request.method !== 'PATCH' || !patch) return undefined;
    const rule = rules.find(row => row.id === decodeURIComponent(patch[1]));
    if (!rule) return Response.json({code: 404, msg: '打造配方不存在', data: null}, {status: 404});
    const body = await request.json() as Record<string, unknown>;
    const ingredients = body.ingredients as {sku: string; quantity: number}[];
    const error = (msg: string) => Response.json({code: 400, msg, data: null}, {status: 400});
    if (Object.keys(body).some(key => key !== 'ingredients') || !Array.isArray(ingredients) || !ingredients.length || ingredients.length > 8) return error('仅可编辑1～8种材料');
    if (new Set(ingredients.map(row => row.sku)).size !== ingredients.length || ingredients.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 9999)) return error('材料不得重复，数量须为1～9999的整数');
    const next = ingredients.map(row => ({...row, material: blacksmithMaterials.find(item => item.sku === row.sku)}));
    if (next.some(row => !row.material?.sources.some(source => source.rank !== 'boss' && source.levelMin <= rule.levelMax && source.levelMax >= rule.levelMin))) return error('材料须来自对应等级迷宫的非首领怪物');
    if (next.reduce((sum, row) => sum + (row.material!.sources.every(source => source.rank !== 'normal') ? row.quantity : 0), 0) > 2) return error('每件装备最多消耗2个精英材料');
    if (next.reduce((sum, row) => sum + Number(row.material!.salePrice) * row.quantity, 0) < 2 * 1.1 * (10 + .5 * rule.levelMax)) return error('材料回收价值低于配方成本下限');
    rule.ingredients = next.map(({sku, quantity, material}) => ({sku, quantity, name: material!.name, price: material!.salePrice}));
    rule.version += 1;
    return rule;
}
