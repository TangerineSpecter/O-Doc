import {ChefHat, Coins, Check, AlertCircle} from 'lucide-react';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import type {CookingRecipe} from '../../types/api/cooking';
import {recipeStateConfigs} from './recipePresentation';

export interface RecipeCardProps {
    recipe: CookingRecipe;
    isSelected: boolean;
    onClick: () => void;
}

export function RecipeCard({recipe, isSelected, onClick}: RecipeCardProps) {
    const stateConfig = recipeStateConfigs[recipe.state] || recipeStateConfigs.unselected;

    // 计算食材满足情况
    const missingCount = recipe.ingredients.filter(ing => ing.owned < ing.quantity).length;
    const isIngredientsReady = missingCount === 0;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={isSelected}
            className={`group relative flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-all duration-150 outline-none select-none overflow-hidden ${
                isSelected
                    ? 'border-orange-400 bg-orange-50/60 shadow-xs ring-2 ring-orange-500/25 pl-3'
                    : 'border-slate-200/90 bg-white hover:border-orange-200 hover:bg-slate-50/50 hover:shadow-xs'
            }`}
        >
            {/* 左侧选中指示条 */}
            {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-orange-500" />
            )}

            {/* 料理图标 */}
            <div
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border p-1 transition-all duration-150 group-hover:scale-[1.03] ${
                    isSelected
                        ? 'border-orange-200 bg-amber-50/90 shadow-2xs'
                        : 'border-amber-100/70 bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-amber-50/20'
                }`}
            >
                <ItemIconImage
                    src={recipe.iconUrl}
                    alt={recipe.name}
                    className="h-full w-full object-cover rounded-lg"
                    fallback={<ChefHat className="h-6 w-6 text-orange-300" />}
                />
            </div>

            {/* 菜品信息 */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-orange-600">
                        {recipe.name}
                    </span>
                    {/* 回收单价 */}
                    <div className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-50/80 px-1.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200/60 shadow-2xs">
                        <Coins className="h-3 w-3 text-amber-500" />
                        <span>★1 {recipe.salePrice}</span>
                    </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {/* 等级需求标签 */}
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        Lv.{recipe.requiredLevel}
                    </span>

                    {/* 状态药丸徽章 */}
                    <span
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${stateConfig.badgeClass}`}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${stateConfig.dotClass}`} />
                        {stateConfig.label}
                    </span>
                </div>

                {/* 食材就绪微提示 */}
                <div className="mt-1 flex items-center text-[10px]">
                    {isIngredientsReady ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
                            <Check className="h-2.5 w-2.5" />
                            食材齐备
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-0.5 text-amber-600/90">
                            <AlertCircle className="h-2.5 w-2.5" />
                            缺 {missingCount} 种食材
                        </span>
                    )}
                    {recipe.timesMade > 0 && (
                        <span className="ml-auto text-slate-400">已做 {recipe.timesMade} 份</span>
                    )}
                </div>
            </div>
        </button>
    );
}
