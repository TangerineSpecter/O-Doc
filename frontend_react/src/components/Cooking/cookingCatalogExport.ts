import type {CatalogExportSheet} from '../../utils/catalogSpreadsheet';
import type {CookingRecipe, CookingSkill} from '../../types/api/cooking';
import {recipeStateLabels} from './recipePresentation';
import {recipeStarPrices} from './recipePricing';

export function cookingCatalogExportSheets({
    recipes,
    ingredientOptions,
    skill,
    residentName,
}: {
    recipes: CookingRecipe[];
    ingredientOptions: {sku: string; name: string}[];
    skill: CookingSkill | null | undefined;
    residentName: string;
}): CatalogExportSheet[] {
    const recipeRows = recipes.map(recipe => {
        const starPrices = recipeStarPrices(recipe.salePrice, recipe.qualityPreviews?.[0]?.portions?.[0]?.starValues);
        return {
            名称: recipe.name,
            说明: recipe.description,
            制作状态: recipeStateLabels[recipe.state] || '未选择居民',
            要求厨艺等级: recipe.requiredLevel,
            每份所需食材: recipe.ingredients.map(item => `${item.name} ×${item.quantity}`).join('、'),
            当前持有情况: recipe.ingredients.map(item => `${item.name}：${item.owned}/${item.quantity}`).join('；'),
            一星回收单价: starPrices[0],
            二星回收单价: starPrices[1],
            三星回收单价: starPrices[2],
            四星回收单价: starPrices[3],
            五星回收单价: starPrices[4],
            一星加工差额: recipe.processingGain,
            一星原料价值: recipe.ingredientValue,
            基础制作经验: recipe.experience,
            每次消耗体力: recipe.energyCost,
            当前可制作份数: recipe.maxPortions,
            已累计制作份数: recipe.timesMade,
        };
    });

    return [
        {name: '美食图鉴', rows: recipeRows},
        {name: '可用食材', rows: ingredientOptions.map(item => ({食材名称: item.name}))},
        {
            name: '当前居民厨艺',
            rows: skill ? [{
                居民: residentName,
                厨艺等级: skill.level,
                当前经验: skill.experience,
                升级所需经验: skill.nextLevelExperience ?? '已满级',
                升级进度: `${Math.round(skill.progress * 100)}%`,
            }] : [],
        },
    ];
}
