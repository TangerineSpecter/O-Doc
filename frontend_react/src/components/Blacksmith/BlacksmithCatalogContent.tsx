import {useMemo, useState} from 'react';
import {AlertCircle, ArrowLeft, BookOpen, Crosshair, Hammer, History, RefreshCw, SlidersHorizontal, Zap} from 'lucide-react';
import {Select} from '../common/Select';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {useBlacksmith} from '../../hooks/useBlacksmith';
import {BlacksmithRecipeCard} from './BlacksmithRecipeCard';
import {BlacksmithRecipeDetails} from './BlacksmithRecipeDetails';
import {BlacksmithRuleEditor} from './BlacksmithRuleEditor';
import {BlacksmithHistory} from './BlacksmithHistory';
import {BlacksmithGoals} from './BlacksmithGoals';
import {filterBlacksmithRecipes} from './blacksmithPresentation';
import type {BlacksmithRecipe} from '../../types/api/blacksmith';

const qualityStyles: Record<string, {name: string; dot: string}> = {
    white: {name: '白装', dot: 'bg-slate-300'},
    blue: {name: '蓝装', dot: 'bg-sky-500'},
    gold: {name: '金装', dot: 'bg-amber-400'},
};

export function BlacksmithCatalogContent({
    residents,
    initialAgentId = '',
    active = true,
}: {
    residents: {id: string; name: string}[];
    initialAgentId?: string;
    active?: boolean;
}) {
    const [agentId, setAgentId] = useState(
        residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || ''
    );
    const state = useBlacksmith(agentId, active);
    const [view, setView] = useState<'recipes' | 'goals' | 'history'>('recipes');
    const [band, setBand] = useState('');
    const [slot, setSlot] = useState('');
    const [readyOnly, setReadyOnly] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [detailOpen, setDetailOpen] = useState(false);
    const [editing, setEditing] = useState<BlacksmithRecipe | null>(null);

    const recipes = useMemo(() => state.data?.recipes || [], [state.data?.recipes]);
    const visible = useMemo(
        () => filterBlacksmithRecipes(recipes, band, slot, readyOnly),
        [recipes, band, slot, readyOnly]
    );
    const slots = useMemo(
        () => [...new Map(recipes.map(recipe => [recipe.slot, recipe.slotName])).entries()],
        [recipes]
    );
    const selected = visible.find(recipe => recipe.id === selectedId) || visible[0] || null;
    const actor = state.data?.actor;
    const goalState = state.data?.goalState;
    const qualities = state.data?.qualityProbabilities || [
        {quality: 'white', probability: 0.7},
        {quality: 'blue', probability: 0.25},
        {quality: 'gold', probability: 0.05},
    ];

    const handleSelectRecipeFromGoal = (recipeId: string) => {
        setView('recipes');
        setSelectedId(recipeId);
        setDetailOpen(true);
        if (!visible.some(r => r.id === recipeId)) {
            setBand('');
            setSlot('');
            setReadyOnly(false);
        }
    };

    return (
        <>
            <div data-blacksmith-catalog className="flex h-full min-h-0 flex-col gap-2.5">
                {/* 顶部综合导航控制栏：整合居民信息、主视图切换与状态 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-2 sm:p-2.5">
                    {/* 居民与基础属性 */}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <div className="w-28 sm:w-32">
                            <Select
                                menuPortal
                                menuClassName="scrollbar-hide"
                                value={agentId}
                                options={residents.map(row => ({value: row.id, label: row.name}))}
                                placeholder="选择居民"
                                buttonClassName="!min-h-8 sm:!min-h-9 !py-1 text-xs font-semibold"
                                onChange={id => {
                                    setAgentId(id);
                                    state.setPage(1);
                                    setDetailOpen(false);
                                }}
                            />
                        </div>

                        {actor?.initialized ? (
                            <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-lg px-2 py-0.5 shadow-2xs">
                                    {actor.jobName}
                                </span>
                                <span className="rounded-lg bg-white border border-slate-200/80 px-2 py-0.5 font-bold tabular-nums text-slate-700 shadow-2xs">
                                    Lv.{actor.level}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50/90 border border-amber-200/70 px-2 py-0.5 font-bold tabular-nums text-amber-800 shadow-2xs">
                                    <Zap className="h-3 w-3 text-amber-600" />
                                    {Number(Number(actor.energy).toFixed(1))}
                                    <span className="text-[10px] font-normal text-amber-700/80">体力</span>
                                </span>
                            </div>
                        ) : (
                            <span className="text-xs text-slate-500">
                                {actor ? '尚未建立冒险档案' : '选择居民'}
                            </span>
                        )}
                    </div>

                    {/* 二级主视图切换胶囊 */}
                    <div
                        className="inline-flex gap-1 rounded-full border border-slate-200/80 bg-slate-100 p-1"
                        aria-label="铁匠铺视图切换"
                    >
                        {(
                            [
                                {id: 'recipes', label: '打造配方', icon: BookOpen, count: visible.length},
                                {
                                    id: 'goals',
                                    label: '打造目标',
                                    icon: Crosshair,
                                    count: goalState?.goals.length ?? 0,
                                    highlight: (goalState?.readyCount ?? 0) > 0,
                                },
                                {id: 'history', label: '打造记录', icon: History},
                            ] as const
                        ).map(tab => {
                            const isActive = view === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => setView(tab.id)}
                                    className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                                        isActive
                                            ? 'bg-white text-orange-700 shadow-2xs'
                                            : 'text-slate-600 hover:bg-slate-200/60'
                                    }`}
                                >
                                    <tab.icon className="h-3.5 w-3.5" />
                                    <span>{tab.label}</span>
                                    {'count' in tab && tab.count !== undefined && (
                                        <span
                                            className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-bold leading-none ${
                                                isActive
                                                    ? 'bg-orange-100 text-orange-800'
                                                    : 'bg-slate-200/80 text-slate-600'
                                            }`}
                                        >
                                            {tab.count}
                                        </span>
                                    )}
                                    {'highlight' in tab && tab.highlight && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* 右侧工具：品质概率、流程说明与刷新 */}
                    <div className="ml-auto hidden items-center gap-2 sm:flex">
                        <div
                            aria-label="打造品质概率"
                            className="inline-flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] text-slate-600 shadow-2xs"
                        >
                            {qualities.map(row => (
                                <span
                                    key={row.quality}
                                    className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
                                >
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full ${
                                            qualityStyles[row.quality]?.dot || 'bg-slate-300'
                                        }`}
                                    />
                                    <span className="font-medium text-slate-700">
                                        {qualityStyles[row.quality]?.name || row.quality}
                                    </span>
                                    <span className="text-slate-400">
                                        {Math.round(row.probability * 100)}%
                                    </span>
                                </span>
                            ))}
                        </div>

                        <DecisionProcessInfo kind="blacksmith" />
                        <button
                            type="button"
                            aria-label="刷新铁匠铺"
                            onClick={state.reload}
                            className="rounded-xl border border-slate-200/80 bg-white p-1.5 text-slate-500 shadow-2xs transition-colors hover:border-orange-300 hover:text-orange-700"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* 配方模式专用的超紧凑筛选栏（单行整合了筛选器与目标快速芯片） */}
                {view === 'recipes' && (
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 shadow-2xs">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <div className="w-32">
                                <Select
                                    menuPortal
                                    menuClassName="scrollbar-hide"
                                    value={band}
                                    options={[
                                        {value: '', label: '全部等级范围'},
                                        ...(state.data?.bands || []).map(row => ({
                                            value: row.id,
                                            label: row.label,
                                        })),
                                    ]}
                                    buttonClassName="!min-h-8 !py-1 text-xs font-medium"
                                    onChange={value => {
                                        setBand(value);
                                        setDetailOpen(false);
                                    }}
                                />
                            </div>
                            <div className="w-28">
                                <Select
                                    menuPortal
                                    menuClassName="scrollbar-hide"
                                    value={slot}
                                    options={[
                                        {value: '', label: '全部部位'},
                                        ...slots.map(([value, label]) => ({value, label})),
                                    ]}
                                    buttonClassName="!min-h-8 !py-1 text-xs font-medium"
                                    onChange={value => {
                                        setSlot(value);
                                        setDetailOpen(false);
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                aria-pressed={readyOnly}
                                onClick={() => {
                                    setReadyOnly(value => !value);
                                    setDetailOpen(false);
                                }}
                                className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-all ${
                                    readyOnly
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-2xs'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                            >
                                <SlidersHorizontal className="h-3 w-3" />
                                只看可打造
                            </button>

                            <span className="hidden h-4 w-px bg-slate-200 sm:block" />

                            {/* 紧凑目标状态芯片：单行展示正在追踪的目标，支持点击一键定位 */}
                            <div className="hidden min-w-0 flex-1 sm:block">
                                <BlacksmithGoals
                                    goalState={goalState}
                                    selectedRecipeId={selected?.id}
                                    onSelectRecipe={handleSelectRecipeFromGoal}
                                    onOpenGoalsTab={() => setView('goals')}
                                    variant="compact"
                                />
                            </div>
                        </div>

                        <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-slate-400 font-medium">
                            共 {visible.length} 个配方
                        </span>
                    </div>
                )}

                {/* 错误提示条 */}
                {state.error && (
                    <div
                        role="alert"
                        className="flex shrink-0 items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700"
                    >
                        <span className="flex items-center gap-1.5 font-medium">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {state.error}
                        </span>
                        <button
                            type="button"
                            onClick={state.reload}
                            className="shrink-0 font-bold underline hover:text-red-900"
                        >
                            重试
                        </button>
                    </div>
                )}

                {/* 主视口区域：占用 78%~80% 的主要高度！ */}
                {state.loading ? (
                    <div
                        role="status"
                        aria-label="正在读取打造配方"
                        className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]"
                    >
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map(key => (
                                <div
                                    key={key}
                                    className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3"
                                >
                                    <div className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 animate-pulse" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3.5 w-1/3 rounded bg-slate-100 animate-pulse" />
                                        <div className="h-2.5 w-2/3 rounded bg-slate-100 animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="hidden rounded-2xl border border-slate-200/80 bg-white p-6 lg:block">
                            <div className="h-16 w-16 rounded-xl bg-slate-100 animate-pulse" />
                            <p className="mt-4 text-xs text-slate-500">正在读取打造配方…</p>
                        </div>
                    </div>
                ) : state.error && !state.data ? (
                    <div className="min-h-0 flex-1" />
                ) : view === 'history' ? (
                    <BlacksmithHistory
                        history={state.history}
                        page={state.page}
                        onPage={state.setPage}
                    />
                ) : view === 'goals' ? (
                    /* 专属全幅打造目标追踪看板 */
                    <BlacksmithGoals
                        goalState={goalState}
                        selectedRecipeId={selected?.id}
                        onSelectRecipe={handleSelectRecipeFromGoal}
                        variant="full"
                    />
                ) : (
                    /* 极度充裕的双栏配方主视口 */
                    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
                        {/* 左侧配方列表列 */}
                        <div
                            className={`min-h-0 overflow-y-auto px-0.5 pb-0.5 scrollbar-hide ${
                                detailOpen ? 'hidden lg:block' : ''
                            }`}
                        >
                            {visible.length ? (
                                <div className="space-y-2">
                                    {visible.map(recipe => (
                                        <BlacksmithRecipeCard
                                            key={recipe.id}
                                            recipe={recipe}
                                            selected={selected?.id === recipe.id}
                                            onClick={() => {
                                                setSelectedId(recipe.id);
                                                setDetailOpen(true);
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xs">
                                    <Hammer className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                                    <p className="text-sm font-bold text-slate-700">
                                        {!recipes.length
                                            ? '暂无打造配方'
                                            : readyOnly
                                            ? '暂无可打造的配方'
                                            : '暂无匹配配方'}
                                    </p>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                        {!recipes.length
                                            ? '配方准备好后，装备与材料来源会展示在这里。'
                                            : readyOnly
                                            ? '切回全部配方，查看材料缺口与出处。'
                                            : '试试其他等级范围或装备部位筛选。'}
                                    </p>
                                    {(readyOnly || band || slot) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReadyOnly(false);
                                                setBand('');
                                                setSlot('');
                                            }}
                                            className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                                        >
                                            清除筛选条件
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 右侧配方详情列：纵向高度大幅释放，材料出处和装备列表一眼看全 */}
                        <div
                            className={`min-h-0 ${
                                detailOpen ? 'flex' : 'hidden lg:flex'
                            } flex-col gap-2`}
                        >
                            <button
                                type="button"
                                onClick={() => setDetailOpen(false)}
                                className="inline-flex shrink-0 items-center gap-1 self-start py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 lg:hidden"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                返回配方列表
                            </button>

                            {selected ? (
                                <BlacksmithRecipeDetails
                                    recipe={selected}
                                    materials={state.data?.materials || []}
                                    onEdit={() => setEditing(selected)}
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
                                    <BookOpen className="mb-3 h-8 w-8 text-slate-300" />
                                    <p className="text-sm font-bold text-slate-700">选择一份打造配方</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        查看当前居民职业路线装备与所需材料来源
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 底部轻量微注 */}
                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 pt-1.5 text-[11px] leading-relaxed text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                        <Hammer className="h-3 w-3 shrink-0 text-slate-400" />
                        每件消耗 {state.data?.energyCost ?? 2} 体力 · 免加工费 · 单次最多打造 {state.data?.maxPieces ?? 3} 件
                    </span>
                    <span className="hidden sm:block">
                        逐件打造，自动复核日程预留与体力保护
                    </span>
                    <span className="flex gap-2 sm:hidden">
                        {qualities.map(row => (
                            <span key={row.quality} className="whitespace-nowrap">
                                {qualityStyles[row.quality]?.name || row.quality}{' '}
                                {Math.round(row.probability * 100)}%
                            </span>
                        ))}
                    </span>
                </footer>
            </div>

            {/* 编辑配方弹窗 */}
            {editing && (
                <BlacksmithRuleEditor
                    key={editing.id}
                    recipe={editing}
                    materials={state.data?.materials || []}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        state.reload();
                    }}
                />
            )}
        </>
    );
}
