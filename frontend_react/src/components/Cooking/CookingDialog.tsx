import {useMemo, useState} from 'react';
import {Search, X, Sparkles, AlertCircle, RefreshCw, BookOpen} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {ItemIconPicker} from '../AgentWorld/ItemIconPicker';
import {RecipeRuleEditor} from './RecipeRuleEditor';
import {RecipeDetails} from './RecipeDetails';
import {RecipeCard} from './RecipeCard';
import type {RecipeState} from './recipePresentation';
import {useCooking} from '../../hooks/useCooking';
import type {CookingRecipe} from '../../types/api/cooking';
import type {CatalogItem} from '../../types/api/itemCatalog';

export interface CookingDialogProps {
    residents: {id: string; name: string}[];
    initialAgentId?: string;
    onClose: () => void;
}

export default function CookingDialog({
    residents,
    initialAgentId = '',
    onClose,
}: CookingDialogProps) {
    const [agentId, setAgentId] = useState(
        residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || ''
    );
    const state = useCooking(agentId);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | RecipeState>('all');
    const [selectedId, setSelectedId] = useState('');
    const [editing, setEditing] = useState<CookingRecipe | null>(null);
    const [image, setImage] = useState<CatalogItem | null>(null);

    const recipes = useMemo(() => state.data?.recipes || [], [state.data?.recipes]);
    const currentResident = residents.find(r => r.id === agentId);

    // 统计各筛选状态下的食谱数量
    const filterCounts = useMemo(() => {
        const counts: Record<string, number> = {
            all: recipes.length,
            ready: 0,
            missing: 0,
            locked: 0,
            tired: 0,
        };
        for (const recipe of recipes) {
            if (counts[recipe.state] !== undefined) {
                counts[recipe.state]++;
            }
        }
        return counts;
    }, [recipes]);

    // 根据搜索词和筛选条件过滤食谱列表
    const visible = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return recipes.filter(recipe => {
            const matchSearch = !keyword || recipe.name.toLowerCase().includes(keyword);
            const matchFilter = filter === 'all' || recipe.state === filter;
            return matchSearch && matchFilter;
        });
    }, [recipes, search, filter]);

    // 选中的食谱：优先使用当前选中，若不存在则回退至可见列表首项
    const selected = useMemo(() => {
        return visible.find(recipe => recipe.id === selectedId) || visible[0] || null;
    }, [visible, selectedId]);

    const skill = state.data?.skill;

    // 打开图标选择器模态
    const openImage = (recipe: CookingRecipe) =>
        setImage({
            id: recipe.sku,
            sku: recipe.sku,
            name: recipe.name,
            category: 'dish',
            description: recipe.description,
            purchasePrice: null,
            salePrice: Number(recipe.salePrice),
            quality: 'normal',
            quantity: 0,
            iconAssetId: recipe.iconAssetId,
            iconUrl: recipe.iconUrl,
        });

    return (
        <WorldDialog
            title="食谱图鉴"
            description="把田园收获变成美食，在制作中磨练厨艺。"
            size="wide"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col gap-3 outline-none">
                {/* 顶部工具栏：居民厨艺卡片 + 搜索 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 p-2.5 border border-slate-100">
                    {/* 左侧：居民身份与厨艺经验条 */}
                    <div className="flex flex-1 min-w-[280px] items-center gap-3">
                        {/* 居民选择下拉框 */}
                        <div className="w-36 shrink-0">
                            <Select
                                menuPortal
                                value={agentId}
                                options={residents.map(row => ({value: row.id, label: row.name}))}
                                onChange={id => {
                                    setAgentId(id);
                                    state.setPage(1);
                                }}
                                placeholder="选择居民"
                            />
                        </div>

                        {/* 厨艺等级与经验进度 */}
                        {skill ? (
                            <div className="flex flex-1 items-center gap-3 min-w-0 pr-2">
                                <div className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-orange-100/80 px-2 py-1 text-xs font-bold text-orange-800 shadow-2xs">
                                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                                    <span>Lv.{skill.level}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                                        <span className="font-medium text-slate-700">厨艺经验</span>
                                        <span>
                                            {skill.experience}
                                            {skill.nextLevelExperience !== null
                                                ? ` / ${skill.nextLevelExperience} EXP`
                                                : ' (已满级)'}
                                        </span>
                                    </div>
                                    <div
                                        role="progressbar"
                                        aria-label="厨艺升级进度"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={Math.round(skill.progress * 100)}
                                        className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80"
                                    >
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
                                            style={{width: `${Math.min(100, Math.round(skill.progress * 100))}%`}}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400">正在获取居民厨艺信息…</div>
                        )}
                    </div>

                    {/* 右侧搜索框 */}
                    <div className="relative flex w-full items-center gap-2 sm:w-56 shrink-0">
                        <label className="relative flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs transition-all focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20">
                            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <input
                                aria-label="搜索食谱"
                                placeholder="搜索菜名..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="min-w-0 w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    aria-label="清空搜索"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </label>
                    </div>
                </div>

                {/* 状态过滤胶囊栏 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <div
                        className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/60"
                        aria-label="食谱制作状态筛选"
                    >
                        {(
                            [
                                {id: 'all', label: '全部', dot: ''},
                                {id: 'ready', label: '可制作', dot: 'bg-emerald-500'},
                                {id: 'missing', label: '材料不足', dot: 'bg-amber-500'},
                                {id: 'locked', label: '等级不足', dot: 'bg-slate-400'},
                                {id: 'tired', label: '体力不足', dot: 'bg-sky-500'},
                            ] as const
                        ).map(tab => {
                            const count = filterCounts[tab.id] ?? 0;
                            const isActive = filter === tab.id;
                            return (
                                <button
                                    type="button"
                                    key={tab.id}
                                    aria-pressed={isActive}
                                    onClick={() => setFilter(tab.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                        isActive
                                            ? 'bg-white text-orange-600 shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                                    }`}
                                >
                                    {Boolean(tab.dot) && <span className={`h-1.5 w-1.5 rounded-full ${tab.dot}`} />}
                                    <span>{tab.label}</span>
                                    <span
                                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-medium leading-none ${
                                            isActive
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-slate-200/80 text-slate-500'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 异常提示条 */}
                {state.error && (
                    <div
                        role="alert"
                        className="flex shrink-0 items-center justify-between rounded-xl bg-red-50 px-3.5 py-2 text-xs text-red-700 border border-red-100"
                    >
                        <div className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                            <span>{state.error}</span>
                        </div>
                        <button
                            type="button"
                            onClick={state.reload}
                            className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline"
                        >
                            <RefreshCw className="h-3 w-3" />
                            重试
                        </button>
                    </div>
                )}

                {/* 主内容区域：左侧食谱卡片网格 + 右侧详情工作台 */}
                {state.loading ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                        <p className="mt-3 text-sm text-slate-500">正在翻开食谱图鉴…</p>
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
                        {/* 左侧食谱卡片网格：宽屏支持两列紧凑布局，内部独立滚动隐藏滚动条 */}
                        <div className="min-h-0 overflow-y-auto pr-1 scrollbar-hide">
                            {!visible.length ? (
                                <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                                    <BookOpen className="h-10 w-10 text-orange-300" />
                                    <p className="mt-3 text-sm font-medium text-slate-600">
                                        {search ? '没有找到符合搜索条件的食谱' : '当前分类下暂无食谱'}
                                    </p>
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => setSearch('')}
                                            className="mt-2 text-xs font-semibold text-orange-600 hover:underline"
                                        >
                                            清空搜索关键词
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    {visible.map(recipe => (
                                        <RecipeCard
                                            key={recipe.id}
                                            recipe={recipe}
                                            isSelected={selected?.id === recipe.id}
                                            onClick={() => setSelectedId(recipe.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 右侧料理详情与制作履历工作台 */}
                        <div className="min-h-0 flex-1">
                            {selected ? (
                                <RecipeDetails
                                    recipe={selected}
                                    history={state.history}
                                    historyPage={state.page}
                                    onHistoryPageChange={state.setPage}
                                    residentName={currentResident?.name}
                                    onOpenImagePicker={() => openImage(selected)}
                                    onOpenRuleEditor={() => setEditing(selected)}
                                    onRecipeReload={state.reload}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
                                    请从左侧选择需要查看的食谱
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 编辑食谱规则模态 */}
            {editing && (
                <RecipeRuleEditor
                    key={editing.id}
                    recipe={editing}
                    options={state.data?.ingredientOptions || []}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        state.reload();
                    }}
                />
            )}

            {/* 物品图标挑选器模态 */}
            {image && (
                <ItemIconPicker
                    key={image.id}
                    item={image}
                    onClose={() => setImage(null)}
                    onSaved={() => {
                        setImage(null);
                        state.reload();
                    }}
                />
            )}
        </WorldDialog>
    );
}
