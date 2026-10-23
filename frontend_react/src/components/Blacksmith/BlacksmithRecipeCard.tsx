import {Check, AlertCircle} from 'lucide-react';
import type {BlacksmithRecipe} from '../../types/api/blacksmith';
import {BlacksmithEquipmentIcon} from './BlacksmithEquipmentIcon';
import {blacksmithStateLabels} from './blacksmithPresentation';

const stateStyles: Record<string, {badge: string; dot: string}> = {
    ready: {
        badge: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
        dot: 'bg-emerald-500',
    },
    missing: {
        badge: 'border-amber-200/80 bg-amber-50 text-amber-700',
        dot: 'bg-amber-500',
    },
    unavailable: {
        badge: 'border-slate-200 bg-slate-100 text-slate-500',
        dot: 'bg-slate-400',
    },
    tired: {
        badge: 'border-yellow-200 bg-yellow-50 text-yellow-700',
        dot: 'bg-yellow-500',
    },
    unselected: {
        badge: 'border-slate-200 bg-slate-50 text-slate-500',
        dot: 'bg-slate-400',
    },
};

export function BlacksmithRecipeCard({
    recipe,
    selected,
    onClick,
}: {
    recipe: BlacksmithRecipe;
    selected: boolean;
    onClick: () => void;
}) {
    const preview = recipe.types.find(type => type.canEquip) || recipe.types[0];
    const missing = recipe.ingredients.filter(row => row.available < row.quantity).length;
    const style = stateStyles[recipe.state] || stateStyles.unselected;

    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={`group relative flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-all duration-150 outline-none select-none overflow-hidden ${
                selected
                    ? 'border-orange-400 bg-orange-50/60 shadow-xs ring-2 ring-orange-500/25 pl-3'
                    : 'border-slate-200/90 bg-white hover:border-orange-200 hover:bg-slate-50/50 hover:shadow-xs'
            }`}
        >
            {/* 左侧选中指示条 */}
            {selected && (
                <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-orange-500" />
            )}

            {/* 装备图标 */}
            <div
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border p-1 transition-all duration-150 group-hover:scale-[1.03] ${
                    selected
                        ? 'border-orange-200 bg-amber-50/90 shadow-2xs'
                        : 'border-amber-100/70 bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-amber-50/20'
                }`}
            >
                <BlacksmithEquipmentIcon
                    slot={recipe.slot}
                    equipmentId={preview?.templateId}
                    equipmentType={preview?.equipmentType}
                    name={preview?.name || recipe.slotName}
                    className="h-full w-full object-contain"
                />
            </div>

            {/* 配方主信息 */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-orange-600">
                        {recipe.slotName}
                    </span>

                    {/* 状态药丸徽章 */}
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${style.badge}`}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {blacksmithStateLabels[recipe.state] || recipe.state}
                    </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {/* 等级档标签 */}
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                        {recipe.bandLabel}
                    </span>

                    {/* 适用类型数 */}
                    <span className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 border border-slate-200/60">
                        {recipe.types.length ? `${recipe.types.length} 种装备` : '路线无可用'}
                    </span>
                </div>

                {/* 就绪与材料提示 */}
                <div className="mt-1 flex items-center justify-between text-[10px]">
                    {recipe.state === 'ready' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <Check className="h-2.5 w-2.5" />
                            材料齐备 · 可造 {recipe.maxPieces} 件
                        </span>
                    ) : missing > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600/90 font-medium">
                            <AlertCircle className="h-2.5 w-2.5" />
                            缺 {missing} 种材料
                        </span>
                    ) : (
                        <span className="truncate text-slate-400">
                            {recipe.disabledReason || '暂不可制作'}
                        </span>
                    )}

                    {recipe.timesMade > 0 && (
                        <span className="shrink-0 text-slate-400 font-medium">
                            已造 {recipe.timesMade} 件
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}
