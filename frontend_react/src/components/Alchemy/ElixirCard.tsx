import {AlertCircle, Check, Coins, Star} from 'lucide-react';
import type {AlchemyRecipe} from '../../types/api/alchemy';
import {alchemyStateConfigs} from './alchemyPresentation';
import {ElixirPortrait} from './ElixirPortrait';

export function ElixirCard({recipe, isSelected, onClick}: {
    recipe: AlchemyRecipe; isSelected: boolean; onClick: () => void;
}) {
    const stateConfig = alchemyStateConfigs[recipe.state] || alchemyStateConfigs.unselected;
    const missing = recipe.ingredients.filter(row => row.owned < row.quantity).length;
    const topStars = Object.entries(recipe.ownedByStars || {}).filter(([, count]) => count > 0)
        .map(([stars, count]) => `${stars}★×${count}`).join(' · ') || '暂无存货';

    return (
        <button type="button" onClick={onClick} aria-pressed={isSelected}
            className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-2.5 text-left transition-all duration-150 outline-none select-none ${
                isSelected
                    ? 'border-violet-400 bg-violet-50/60 pl-3 shadow-xs ring-2 ring-violet-500/20'
                    : 'border-slate-200/90 bg-white hover:border-violet-200 hover:bg-slate-50/50 hover:shadow-xs'
            }`}>
            {isSelected && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-gradient-to-b from-violet-500 to-teal-400" />}
            <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border p-1 transition-all group-hover:scale-[1.03] ${
                isSelected ? 'border-violet-200 bg-violet-50/80' : 'border-violet-100/70 bg-gradient-to-br from-violet-50/70 via-white to-teal-50/30'
            }`}>
                <ElixirPortrait recipe={recipe} className="h-full w-full"/>
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-violet-700">{recipe.name}</span>
                    <span title="一星基准价值" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200/60 bg-amber-50/90 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                        <Coins className="h-3 w-3 text-amber-500" />{recipe.salePrice}
                    </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Lv.{recipe.requiredLevel}</span>
                    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${stateConfig.badgeClass}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${stateConfig.dotClass}`} />{stateConfig.label}
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        <Star className="h-2.5 w-2.5" />最高 5 星
                    </span>
                </div>
                <div className="mt-1 flex items-center text-[10px]">
                    {missing === 0 ? (
                        <span className="inline-flex items-center gap-0.5 font-medium text-teal-600"><Check className="h-2.5 w-2.5" />素材齐备</span>
                    ) : (
                        <span className="inline-flex items-center gap-0.5 text-amber-600/90"><AlertCircle className="h-2.5 w-2.5" />缺 {missing} 种素材</span>
                    )}
                    <span className="ml-auto truncate text-slate-400">{topStars}</span>
                </div>
            </div>
        </button>
    );
}
