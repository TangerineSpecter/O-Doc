import type {AlchemyHistory, AlchemyOperation, AlchemyRecipes, AlchemyRule, AlchemySkill} from '../../types/api/alchemy';
import {alchemy} from './production';
import {at, residents} from './residents';
import {paginateProductionHistory, recipeAvailability, validateRecipeRule} from './recipeRules';

const base = '/api/settings/agent-world/alchemy/';
const history: AlchemyOperation[] = alchemy.recipes.slice(0, 8).map((recipe, i) => ({
    id: `local-alchemy-op-${i}`, recipeId: recipe.id, snapshot: structuredClone(recipe),
    result: {experienceGained: 20, levelBefore: 5, levelAfter: 6, stars: 3, unitPrice: recipe.salePrice,
        ingredientValue: '12', processingGain: '30'},
    reason: '准备探索用品并分享给朋友', createdAt: at(10 + i),
}));
const error = (status: number, msg: string, detail?: string) =>
    Response.json({code: 400, msg, data: detail ? {detail: [detail]} : null}, {status});

export async function resolveAlchemyRoute(request: Request, empty: boolean):
    Promise<AlchemyRecipes | AlchemySkill | AlchemyHistory | (AlchemyRule & {name: string}) | Response | null | undefined> {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === 'GET') {
        if (path === `${base}recipes/`) {
            const actor = url.searchParams.get('actor_id') || url.searchParams.get('actorId')
                || url.searchParams.get('agentId') || url.searchParams.get('agent_id') || url.searchParams.get('agent');
            return {...alchemy, recipes: empty ? [] : alchemy.recipes, skill: actor ? alchemy.skill : null};
        }
        if (/^\/api\/settings\/agent-world\/alchemy\/agents\/[^/]+\/$/.test(path)) return alchemy.skill;
        if (/^\/api\/settings\/agent-world\/alchemy\/agents\/[^/]+\/history\/$/.test(path)) {
            return paginateProductionHistory(history, url, empty);
        }
    }
    const match = path.match(/^\/api\/settings\/agent-world\/alchemy\/recipes\/([^/]+)\/$/);
    if (request.method !== 'PATCH' || !match) return undefined;
    const recipe = alchemy.recipes.find(row => row.id === decodeURIComponent(match[1]));
    if (!recipe) return error(404, '配方不存在');
    let body: unknown;
    try {body = await request.json();}
    catch {return error(400, '炼金配方规则无效', '请求须为有效 JSON');}
    const result = validateRecipeRule(body, alchemy.materials.map(row => row.sku), 10);
    if (result.rule === undefined) return error(400, '炼金配方规则无效', result.error);
    const rule = result.rule;
    const value = rule.ingredients.reduce((sum, row) => sum +
        Number(alchemy.materials.find(item => item.sku === row.sku)!.salePrice) * row.quantity, 0);
    if (value > 1000000) return error(400, '炼金配方规则无效', '材料价值不得超过 1000000');
    rule.salePrice = value.toFixed(2);
    const ingredients = rule.ingredients.map(row => {
        const previous = recipe.ingredients.find(item => item.sku === row.sku)
            || alchemy.recipes.flatMap(item => item.ingredients).find(item => item.sku === row.sku);
        const material = alchemy.materials.find(item => item.sku === row.sku)!;
        return {...row, name: material.name, tier: previous?.tier ?? 1, source: material.dungeon, owned: previous?.owned ?? 20};
    });
    Object.assign(recipe, rule, {ingredients});
    const availability = recipeAvailability(recipe, alchemy.skill?.level ?? 0, Number(residents[0].stamina), 5);
    recipe.state = availability.state;
    recipe.maxBottles = availability.maximum;
    return {...rule, name: recipe.name};
}
