import type {BlacksmithActivity, BlacksmithMaterial, BlacksmithPiece, BlacksmithRecipe} from '../../types/api/blacksmith';
import type {CombatEquipment} from '../../types/api/combat';

export const blacksmithStateLabels = {unselected: '请选择居民', unavailable: '不可制作', missing: '材料不足', tired: '体力不足', ready: '可打造'};
export const blacksmithSceneLabels: Record<string, string> = {
    blacksmith_level_band: '选择等级范围', blacksmith_slot: '选择装备部位',
    blacksmith_type: '选择装备类型', blacksmith_continue: '决定继续或结束',
};
export const blacksmithStatus = (activity: BlacksmithActivity) => activity.operations.length > 0 && activity.status === 'failed'
    ? '已完成部分打造' : ({success: '已完成', claimed: '执行中', failed: '未完成', skipped: '已结束'}[activity.status] || activity.status);
export function craftedEquipment(operation: BlacksmithPiece): CombatEquipment {
    return {id: operation.result.equipmentId || operation.id, snapshot: operation.result.item,
        rules: operation.result.rules, templateId: operation.result.item.templateId,
        bound: false, locked: false, value: operation.result.value};
}
export function filterBlacksmithRecipes(recipes: BlacksmithRecipe[], band: string, slot: string, readyOnly: boolean) {
    return recipes.filter(recipe => (!band || recipe.bandId === band) && (!slot || recipe.slot === slot)
        && (!readyOnly || recipe.state === 'ready'));
}
export function allowedBlacksmithMaterials(materials: BlacksmithMaterial[], recipe: Pick<BlacksmithRecipe, 'levelMin' | 'levelMax'>) {
    return materials.filter(material => blacksmithMaterialSources(material, recipe).length > 0);
}
export function blacksmithMaterialSources(material: BlacksmithMaterial, recipe: Pick<BlacksmithRecipe, 'levelMin' | 'levelMax'>) {
    return material.sources.flatMap(source => {
        const low = Math.max(recipe.levelMin, source.levelMin);
        const high = Math.min(recipe.levelMax, source.levelMax);
        const dungeonLow = Math.max(recipe.levelMin, source.dungeonLevelMin ?? source.levelMin);
        const dungeonHigh = Math.min(recipe.levelMax, source.dungeonLevelMax ?? source.levelMax);
        if (source.rank === 'boss' || low > high || dungeonLow > dungeonHigh) return [];
        return [{...source, boundaryLevel: low === high ? low : dungeonLow === dungeonHigh ? dungeonLow : null}];
    });
}
export function stageText(stage: Record<string, unknown>) {
    const value = stage.choiceLabel ?? stage.label ?? stage.choice ?? stage.selected ?? stage.reason ?? stage.answer;
    return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
}
