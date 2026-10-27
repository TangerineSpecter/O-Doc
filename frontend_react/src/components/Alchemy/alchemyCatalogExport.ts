import type {CatalogExportSheet} from '../../utils/catalogSpreadsheet';
import type {AlchemyRecipe, AlchemySkill} from '../../types/api/alchemy';
import {alchemyStateLabels} from './alchemyPresentation';

export function alchemyCatalogExportSheets({recipes, skill, residentName, carryCap}: {
    recipes: AlchemyRecipe[]; skill: AlchemySkill | null | undefined; residentName: string; carryCap: number;
}): CatalogExportSheet[] {
    const rows = recipes.map(recipe => ({
        名称: recipe.name,
        说明: recipe.description,
        配方状态: alchemyStateLabels[recipe.state] || '未选择居民',
        需求炼金等级: recipe.requiredLevel,
        每瓶所需素材: recipe.ingredients.map(item => `${item.name} ×${item.quantity}`).join('、'),
        素材出处: recipe.dungeonLabels.join('、'),
        当前持有素材: recipe.ingredients.map(item => `${item.name}：${item.owned}/${item.quantity}`).join('；'),
        一星效果: recipe.effects[0]?.summary || '',
        二星效果: recipe.effects[1]?.summary || '',
        三星效果: recipe.effects[2]?.summary || '',
        四星效果: recipe.effects[3]?.summary || '',
        五星效果: recipe.effects[4]?.summary || '',
        一星基准价值: recipe.salePrice,
        基础经验: recipe.experience,
        每瓶体力: recipe.energyCost,
        当前可制作瓶数: recipe.maxBottles,
        背包已有: recipe.ownedBottles,
        累计制作: recipe.timesMade,
        携带上限: carryCap,
    }));
    return [
        {name: '炼金图鉴', rows},
        {
            name: '当前居民炼金',
            rows: skill ? [{
                居民: residentName,
                炼金等级: skill.level,
                当前经验: skill.experience,
                升级所需经验: skill.nextLevelExperience ?? '已满级',
                升级进度: `${Math.round(skill.progress * 100)}%`,
                累计制作瓶数: skill.bottlesMade,
            }] : [],
        },
    ];
}
