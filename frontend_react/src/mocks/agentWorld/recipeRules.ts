import type {RecipeRule} from '../../types/api/cooking';

const fields = ['ingredients', 'requiredLevel', 'salePrice', 'experience', 'energyCost'];
const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, upper: number): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= upper;

/** Mirror the complete recipe-rule contract, without mutating fixture state. */
export function validateRecipeRule(value: unknown, allowedSkus: string[], maxLevel: number):
    {rule: RecipeRule; error?: never} | {error: string; rule?: never} {
    if (!record(value) || Object.keys(value).length !== fields.length || fields.some(field => !(field in value))) {
        return {error: '请提供完整的材料、等级、售价、经验和体力规则'};
    }
    if (!integer(value.requiredLevel, maxLevel)) return {error: `要求等级须为 1 至 ${maxLevel} 的整数`};
    if (!integer(value.experience, 1000000)) return {error: '经验须为 1 至 1000000 的整数'};
    if (!integer(value.energyCost, 100)) return {error: '体力须为 1 至 100 的整数'};
    // Python Decimal accepts separator underscores in the server's amount input.
    const priceText = typeof value.salePrice === 'number' || typeof value.salePrice === 'string'
        ? String(value.salePrice).trim().replace(/_/g, '') : '';
    const price = Number(priceText);
    const [mantissa, exponent = '0'] = priceText.toLowerCase().split('e');
    const decimalPlaces = (mantissa.split('.')[1]?.length ?? 0) - Number(exponent);
    const trailingZeros = mantissa.replace('.', '').match(/0*$/)![0].length;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(priceText)
        || !Number.isFinite(price) || price <= 0 || price > 1000000
        || decimalPlaces - trailingZeros > 2) {
        return {error: '售价须为不超过 1000000 的正金额，最多两位小数'};
    }
    if (!Array.isArray(value.ingredients) || !value.ingredients.length || value.ingredients.length > allowedSkus.length) {
        return {error: '材料列表无效'};
    }
    const seen = new Set<string>();
    const ingredients: RecipeRule['ingredients'] = [];
    for (const row of value.ingredients) {
        if (!record(row) || Object.keys(row).length !== 2 || typeof row.sku !== 'string'
            || !allowedSkus.includes(row.sku) || seen.has(row.sku)) {
            return {error: '材料须为不同的现有合法材料'};
        }
        if (!integer(row.quantity, 1000000)) return {error: '材料数量须为正整数且不超过 1000000'};
        seen.add(row.sku);
        ingredients.push({sku: row.sku, quantity: row.quantity});
    }
    return {rule: {ingredients, requiredLevel: value.requiredLevel, salePrice: price.toFixed(2),
        experience: value.experience, energyCost: value.energyCost}};
}

export function paginateProductionHistory<T>(items: T[], url: URL, empty: boolean) {
    const rows = empty ? [] : items;
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.max(1, Number(url.searchParams.get('page_size') || url.searchParams.get('pageSize')) || 20);
    return {list: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize};
}

export function recipeAvailability(rule: Pick<RecipeRule, 'requiredLevel' | 'energyCost'> & {ingredients: {quantity: number; owned: number}[]},
    level: number, energy: number, limit: number) {
    const portions = Math.min(...rule.ingredients.map(row => Math.floor(row.owned / row.quantity)));
    const state = level < rule.requiredLevel ? 'locked' : !portions ? 'missing' : energy < rule.energyCost ? 'tired' : 'ready';
    return {state, maximum: state === 'ready' ? Math.min(limit, portions, Math.floor(energy / rule.energyCost)) : 0} as const;
}
