import type {CookingHistory, CookingOperation, CookingRecipes, CookingSkill, RecipeRule} from '../../types/api/cooking';
import {cooking} from './production';
import {at, residents} from './residents';
import {paginateProductionHistory, recipeAvailability, validateRecipeRule} from './recipeRules';

const base = '/api/settings/agent-world/cooking/';
// Completed operations retain their rule snapshot when the editable catalog changes.
const history: CookingOperation[] = cooking.recipes.slice(0, 8).map((recipe, i) => ({
    id: `local-cooking-op-${i}`, recipeId: recipe.id, snapshot: structuredClone(recipe),
    result: {experienceGained: 20, levelBefore: 5, levelAfter: 6, stars: 3, unitPrice: recipe.salePrice,
        ingredientValue: '12', processingGain: '30'},
    reason: '准备探索用品并分享给朋友', createdAt: at(10 + i),
}));
const error = (status: number, msg: string, detail?: string) =>
    Response.json({code: 400, msg, data: detail ? {detail: [detail]} : null}, {status});

export async function resolveCookingRoute(request: Request, empty: boolean):
    Promise<CookingRecipes | CookingSkill | CookingHistory | (RecipeRule & {name: string}) | Response | null | undefined> {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === 'GET') {
        if (path === `${base}recipes/`) {
            const actor = url.searchParams.get('actor_id') || url.searchParams.get('actorId')
                || url.searchParams.get('agentId') || url.searchParams.get('agent_id') || url.searchParams.get('agent');
            return {...cooking, recipes: empty ? [] : cooking.recipes, skill: actor ? cooking.skill : null};
        }
        if (/^\/api\/settings\/agent-world\/cooking\/agents\/[^/]+\/$/.test(path)) return cooking.skill;
        if (/^\/api\/settings\/agent-world\/cooking\/agents\/[^/]+\/history\/$/.test(path)) {
            return paginateProductionHistory(history, url, empty);
        }
    }
    const match = path.match(/^\/api\/settings\/agent-world\/cooking\/recipes\/([^/]+)\/$/);
    if (request.method !== 'PATCH' || !match) return undefined;
    const recipe = cooking.recipes.find(row => row.id === decodeURIComponent(match[1]));
    if (!recipe) return error(404, '食谱不存在');
    let body: unknown;
    try {body = await request.json();}
    catch {return error(400, '食谱规则无效', '请求须为有效 JSON');}
    const result = validateRecipeRule(body, cooking.ingredientOptions.map(row => row.sku), 99);
    if (result.rule === undefined) return error(400, '食谱规则无效', result.error);
    const rule = result.rule;
    const ingredients = rule.ingredients.map(row => {
        const previous = recipe.ingredients.find(item => item.sku === row.sku)
            || cooking.recipes.flatMap(item => item.ingredients).find(item => item.sku === row.sku);
        return {...row, name: cooking.ingredientOptions.find(item => item.sku === row.sku)!.name, owned: previous?.owned ?? 24};
    });
    Object.assign(recipe, rule, {ingredients});
    const availability = recipeAvailability(recipe, cooking.skill?.level ?? 0, Number(residents[0].stamina), 10);
    recipe.state = availability.state;
    recipe.maxPortions = availability.maximum;
    return {...rule, name: recipe.name};
}
