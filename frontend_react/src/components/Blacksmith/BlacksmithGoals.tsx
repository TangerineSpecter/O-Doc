import {Crosshair, Check, AlertCircle, ArrowRight, Zap, Package, Hammer, Compass, ChevronRight} from 'lucide-react';
import type {BlacksmithRecipes} from '../../types/api/blacksmith';
import {BlacksmithEquipmentIcon} from './BlacksmithEquipmentIcon';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';

export interface BlacksmithGoalsProps {
    goalState: BlacksmithRecipes['goalState'] | undefined;
    selectedRecipeId?: string;
    onSelectRecipe?: (recipeId: string) => void;
    onOpenGoalsTab?: () => void;
    variant?: 'compact' | 'full';
}

export function BlacksmithGoals({
    goalState,
    selectedRecipeId,
    onSelectRecipe,
    onOpenGoalsTab,
    variant = 'compact',
}: BlacksmithGoalsProps) {
    if (!goalState) return null;

    const hasGoals = goalState.goals.length > 0;

    // 1. 超紧凑单行芯片模式（用于配方界面的筛选栏）
    if (variant === 'compact') {
        if (!hasGoals) {
            return (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                        <Crosshair className="h-3 w-3 text-slate-400" />
                        暂无打造目标
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>居民在空档期最多可登记 3 件</span>
                </div>
            );
        }

        return (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Crosshair className="h-3 w-3 text-orange-500" />
                    目标 ({goalState.goals.length}/3):
                </span>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {goalState.goals.map(goal => {
                        const isSelected = selectedRecipeId === goal.recipeId;
                        return (
                            <button
                                key={goal.id}
                                type="button"
                                title={`点击定位 ${goal.bandLabel} ${goal.slotName} 配方`}
                                onClick={() => onSelectRecipe?.(goal.recipeId)}
                                className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                                    isSelected
                                        ? 'border-orange-400 bg-orange-50 font-bold text-orange-900 shadow-2xs ring-1 ring-orange-400/40'
                                        : 'border-slate-200/90 bg-white font-medium text-slate-700 hover:border-orange-200 hover:bg-slate-50'
                                }`}
                            >
                                <span className="truncate max-w-[120px] sm:max-w-none">
                                    {goal.typeName}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {goal.slotName}
                                </span>
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-semibold leading-none ${
                                        goal.ready
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-amber-100 text-amber-800'
                                    }`}
                                >
                                    {goal.ready ? (
                                        <>
                                            <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                            可打造
                                        </>
                                    ) : (
                                        <>
                                            <span className="h-1 w-1 rounded-full bg-amber-500" />
                                            收集中
                                        </>
                                    )}
                                </span>
                            </button>
                        );
                    })}

                    {onOpenGoalsTab && (
                        <button
                            type="button"
                            onClick={onOpenGoalsTab}
                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                        >
                            <span>看板</span>
                            <ChevronRight className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // 2. 深度工艺感全幅大看板模式（重塑卡片：不使用物理 translateY 避免溢出裁切，尺寸统一且质感沉稳）
    return (
        <section aria-label="打造目标完整看板" className="flex h-full min-h-0 flex-col gap-3">
            {/* 看板顶条说明 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/70 p-3 sm:p-3.5 shadow-2xs">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-2xs">
                        <Crosshair className="h-4 w-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            打造目标追踪看板
                        </h3>
                        <p className="text-[11px] text-slate-500">
                            目标由居民在空档决策中结合职业路线自主登记，所需材料已获得全系统预留保护
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-xl border border-slate-200/80 bg-white px-3 py-1 font-semibold tabular-nums text-slate-700 shadow-2xs">
                        已登记 <strong className="text-slate-900">{goalState.goals.length}</strong> / 3 件
                    </span>
                    {goalState.readyCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700 shadow-2xs">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            {goalState.readyCount} 件材料齐备
                        </span>
                    ) : null}
                </div>
            </div>

            {/* 看板卡片网格：外层添加内边距，完全杜绝滚动裁剪 */}
            <div className="min-h-0 flex-1 overflow-y-auto p-1 sm:p-1.5 scrollbar-hide">
                {hasGoals ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {goalState.goals.map(goal => {
                            const completedCount = goal.ingredients.filter(
                                p => p.available >= p.required
                            ).length;
                            const totalCount = goal.ingredients.length;

                            return (
                                <div
                                    key={goal.id}
                                    className={`group flex flex-col justify-between overflow-hidden rounded-2xl border transition-all duration-200 ${
                                        goal.ready
                                            ? 'border-emerald-300/90 ring-1 ring-emerald-200/60 bg-gradient-to-b from-emerald-50/25 via-white to-white shadow-xs hover:border-emerald-400 hover:shadow-md'
                                            : 'border-slate-200/90 bg-white shadow-xs hover:border-orange-300 hover:ring-1 hover:ring-orange-200/50 hover:shadow-md'
                                    }`}
                                >
                                    <div className="p-4">
                                        {/* 卡片头部：装备真实像素图标 + 装备名称与部位 + 状态徽章 */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <BlacksmithEquipmentIcon
                                                    slot={goal.slot}
                                                    equipmentId={goal.templateId}
                                                    name={goal.typeName}
                                                    quality={goal.ready ? 'blue' : 'white'}
                                                    className="h-12 w-12"
                                                />

                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                                                            {goal.bandLabel}
                                                        </span>
                                                        <span className="text-[11px] font-medium text-slate-500">
                                                            {goal.slotName}
                                                        </span>
                                                    </div>
                                                    <h4 className="mt-1 truncate text-base font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                                                        {goal.typeName}
                                                    </h4>
                                                </div>
                                            </div>

                                            {/* 状态徽章 */}
                                            <span
                                                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold leading-none shadow-2xs ${
                                                    goal.ready
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                                }`}
                                            >
                                                {goal.ready ? (
                                                    <>
                                                        <Check className="h-3 w-3 text-emerald-600" />
                                                        材料已齐备
                                                    </>
                                                ) : (
                                                    <>
                                                        <AlertCircle className="h-3 w-3 text-amber-500" />
                                                        正在收集材料
                                                    </>
                                                )}
                                            </span>
                                        </div>

                                        {/* 所需材料进度列表 */}
                                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                            <div className="mb-2.5 flex items-center justify-between text-[11px]">
                                                <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                                                    <Package className="h-3.5 w-3.5 text-slate-400" />
                                                    所需材料储备
                                                </span>
                                                <span className="tabular-nums text-slate-500">
                                                    已备齐{' '}
                                                    <strong className={goal.ready ? 'text-emerald-700' : 'text-slate-700'}>
                                                        {completedCount}
                                                    </strong>{' '}
                                                    / {totalCount} 种
                                                </span>
                                            </div>

                                            <div className="space-y-2.5">
                                                {goal.ingredients.map(part => {
                                                    const progress = Math.min(
                                                        100,
                                                        Math.round((part.available / part.required) * 100)
                                                    );
                                                    const isDone = part.available >= part.required;
                                                    return (
                                                        <div key={part.sku} className="space-y-1">
                                                            <div className="flex items-center justify-between text-xs">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white p-0.5">
                                                                        <MaterialPortrait
                                                                            materialId={part.sku.replace(/^combat\./, '')}
                                                                            name={part.name}
                                                                            decorative
                                                                            className="h-full w-full [&>svg]:h-4 [&>svg]:w-4"
                                                                        />
                                                                    </div>
                                                                    <span className="truncate font-semibold text-slate-800">
                                                                        {part.name}
                                                                    </span>
                                                                </div>

                                                                <span className="shrink-0 tabular-nums text-xs">
                                                                    <strong
                                                                        className={
                                                                            isDone
                                                                                ? 'font-bold text-emerald-700'
                                                                                : 'font-semibold text-slate-800'
                                                                        }
                                                                    >
                                                                        {Math.min(part.available, part.required)}
                                                                    </strong>
                                                                    <span className="text-slate-400">
                                                                        {' '}/ {part.required}
                                                                    </span>
                                                                    {part.missing > 0 ? (
                                                                        <span className="ml-1.5 rounded bg-amber-100/90 px-1 py-0.2 text-[10px] font-bold text-amber-800">
                                                                            缺 {part.missing}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="ml-1 text-[11px] font-bold text-emerald-600">
                                                                            ✓
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </div>

                                                            {/* 渐变精美进度条 */}
                                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                                        isDone
                                                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                                                            : 'bg-gradient-to-r from-amber-500 to-orange-400'
                                                                    }`}
                                                                    style={{width: `${progress}%`}}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 卡片底栏操作与状态 */}
                                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
                                        <div className="flex items-center gap-1.5 text-[11px]">
                                            {goal.ready ? (
                                                <>
                                                    <Zap className="h-3.5 w-3.5 text-emerald-600" />
                                                    <span className="font-semibold text-emerald-700">
                                                        空档期将自动打造
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <Compass className="h-3.5 w-3.5 text-amber-600" />
                                                    <span className="text-slate-500 font-medium">
                                                        迷宫掉落或市场补齐
                                                    </span>
                                                </>
                                            )}
                                        </div>

                                        {onSelectRecipe && (
                                            <button
                                                type="button"
                                                onClick={() => onSelectRecipe(goal.recipeId)}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 transition-colors hover:text-orange-700 group-hover:translate-x-0.5"
                                            >
                                                <span>查看打造配方</span>
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* 未使用的槽位插槽：精美工坊铁砧风格 */}
                        {goalState.freeSlots > 0 && (
                            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-b from-slate-50/60 to-slate-100/30 p-6 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
                                    <Hammer className="h-5 w-5 text-orange-400" />
                                </div>
                                <h4 className="mt-3 text-xs font-bold text-slate-700">
                                    空余目标位 ({goalState.freeSlots} 个可用)
                                </h4>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-400 max-w-[200px]">
                                    居民将在下一次铁匠铺空档决策中结合职业路线自动登记
                                </p>
                                <span className="mt-3 rounded-full bg-slate-200/60 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                                    无需手动干预 · 自动择优
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center">
                        <Crosshair className="mb-3 h-9 w-9 text-slate-300" />
                        <p className="text-sm font-bold text-slate-700">暂无待打造目标</p>
                        <p className="mt-1 text-xs text-slate-500 max-w-sm leading-relaxed">
                            开启铁匠铺能力后，居民会在日程空档期结合自身职业与装备路线，自主登记最多 3 个装备打造目标并保护材料。
                        </p>
                    </div>
                )}

                {goalState.invalidGoals?.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-800">
                        {goalState.invalidGoals.map(goal => (
                            <p key={goal.id}>
                                已失效目标：{goal.recipeId} · {goal.templateId}（{goal.reason}）
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
