import {useMemo, useState} from 'react';
import {AlertCircle, BookOpen, FlaskConical, RefreshCw, Search, Sparkles, X} from 'lucide-react';
import {Select} from '../common/Select';
import LevelPlate from '../AgentWorld/LevelPlate';
import DataExportButton from '../common/DataExportButton';
import {ItemIconPicker} from '../AgentWorld/ItemIconPicker';
import {useAlchemy} from '../../hooks/useAlchemy';
import {ElixirCard} from './ElixirCard';
import {ElixirDetails} from './ElixirDetails';
import {AlchemyRuleEditor} from './AlchemyRuleEditor';
import {alchemyCatalogExportSheets} from './alchemyCatalogExport';
import type {AlchemyRecipe, AlchemyRecipeState} from '../../types/api/alchemy';
import type {CatalogItem} from '../../types/api/itemCatalog';

export function AlchemyCatalogContent({residents, initialAgentId = '', active = true}: {
    residents: {id: string; name: string}[]; initialAgentId?: string; active?: boolean;
}) {
    const [agentId, setAgentId] = useState(residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || '');
    const state = useAlchemy(agentId, active);
    const [view, setView] = useState<'recipes' | 'potions'>('recipes');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | AlchemyRecipeState>('all');
    const [selectedId, setSelectedId] = useState('');
    const [editing, setEditing] = useState<AlchemyRecipe | null>(null);
    const [image, setImage] = useState<CatalogItem | null>(null);

    const recipes = useMemo(() => state.data?.recipes || [], [state.data?.recipes]);
    const materials = state.data?.materials || [];
    const carryCap = state.data?.carryCap || 5;
    const skill = state.data?.skill;
    const resident = residents.find(row => row.id === agentId);
    const exportSheets = useMemo(() => alchemyCatalogExportSheets({
        recipes, skill, residentName: resident?.name || '', carryCap,
    }), [recipes, skill, resident?.name, carryCap]);

    const counts = useMemo(() => {
        const result: Record<string, number> = {all: recipes.length, ready: 0, missing: 0, locked: 0, tired: 0};
        for (const recipe of recipes) if (result[recipe.state] !== undefined) result[recipe.state] += 1;
        return result;
    }, [recipes]);

    const visible = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        const pool = view === 'potions' ? recipes.filter(recipe => recipe.timesMade > 0 || recipe.ownedBottles > 0) : recipes;
        return pool.filter(recipe => {
            const keywordMatch = !keyword || recipe.name.toLowerCase().includes(keyword)
                || recipe.ingredients.some(row => row.name.toLowerCase().includes(keyword));
            return keywordMatch && (view === 'potions' || filter === 'all' || recipe.state === filter);
        });
    }, [recipes, search, filter, view]);

    const selected = useMemo(() => visible.find(row => row.id === selectedId) || visible[0] || null, [visible, selectedId]);

    const openImage = (recipe: AlchemyRecipe) => setImage({
        id: recipe.sku, sku: recipe.sku, name: recipe.name, category: 'elixir', description: recipe.description,
        purchasePrice: null, salePrice: Number(recipe.salePrice), quality: 'normal', quantity: recipe.ownedBottles,
        iconAssetId: recipe.iconAssetId, iconUrl: recipe.iconUrl,
    });

    return <>
        <div className="flex h-full min-h-0 flex-col gap-3 outline-none">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-2.5">
                <div className="flex w-full min-w-0 flex-col gap-3 sm:min-w-[440px] sm:flex-1 sm:flex-row sm:items-center">
                    <div className="w-36 shrink-0">
                        <Select menuPortal menuClassName="scrollbar-hide" value={agentId}
                            options={residents.map(row => ({value: row.id, label: row.name}))}
                            onChange={id => {setAgentId(id); state.setPage(1);}} placeholder="选择居民" />
                    </div>
                    {skill ? <div className="flex w-full min-w-0 items-center gap-3 pr-2 sm:w-auto sm:flex-1">
                        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200/80 bg-violet-50/70 px-2 py-1 text-xs font-bold text-violet-800">
                            <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-xs font-semibold text-slate-700">炼金</span>
                            <LevelPlate level={skill.level} variant="purple" size="sm" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                                <span className="whitespace-nowrap font-medium text-slate-700">炼金经验</span>
                                <span>{skill.experience}{skill.nextLevelExperience !== null ? ` / ${skill.nextLevelExperience} EXP` : ' (已满级)'}</span>
                            </div>
                            <div role="progressbar" aria-label="炼金升级进度" aria-valuemin={0} aria-valuemax={100}
                                aria-valuenow={Math.round(skill.progress * 100)} className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-teal-400 transition-all duration-300"
                                    style={{width: `${Math.min(100, Math.round(skill.progress * 100))}%`}} />
                            </div>
                        </div>
                    </div> : <div className="text-xs text-slate-400">正在获取居民炼金信息…</div>}
                </div>
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
                    <label className="relative flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/20 sm:w-56 sm:flex-none">
                        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <input aria-label="搜索炼金药水" placeholder="搜索药水或素材..." value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full min-w-0 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
                        {search && <button type="button" onClick={() => setSearch('')} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="清空搜索"><X className="h-3.5 w-3.5" /></button>}
                    </label>
                    <DataExportButton sheets={exportSheets} fileName="炼金图鉴" disabled={state.loading || Boolean(state.error) || !recipes.length} />
                </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1 rounded-2xl border border-slate-200/60 bg-slate-100 p-1" aria-label="炼金图鉴视图">
                    {([{id: 'recipes', label: '配方', icon: BookOpen}, {id: 'potions', label: '药水一览', icon: Sparkles}] as const).map(tab => {
                        const Icon = tab.icon;
                        return <button key={tab.id} type="button" onClick={() => setView(tab.id)} aria-pressed={view === tab.id}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${view === tab.id ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50'}`}>
                            <Icon className="h-3.5 w-3.5" />{tab.label}
                        </button>;
                    })}
                </div>
                {view === 'recipes' && <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200/60 bg-slate-100 p-1" aria-label="炼金制作状态筛选">
                    {([{id: 'all', label: '全部', dot: ''}, {id: 'ready', label: '可制作', dot: 'bg-teal-500'},
                        {id: 'missing', label: '素材不足', dot: 'bg-amber-500'}, {id: 'locked', label: '等级不足', dot: 'bg-slate-400'},
                        {id: 'tired', label: '体力不足', dot: 'bg-sky-500'}] as const).map(tab => {
                        const activeTab = filter === tab.id;
                        return <button key={tab.id} type="button" onClick={() => setFilter(tab.id)} aria-pressed={activeTab}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${activeTab ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50'}`}>
                            {tab.dot && <span className={`h-1.5 w-1.5 rounded-full ${tab.dot}`} />}{tab.label}
                            <span className={`rounded-full px-1.5 text-[10px] font-medium leading-none ${activeTab ? 'bg-violet-100 text-violet-700' : 'bg-slate-200/80 text-slate-500'}`}>{counts[tab.id] ?? 0}</span>
                        </button>;
                    })}
                </div>}
                <span className="ml-auto shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-600">探索最多携带 {carryCap} 瓶</span>
            </div>

            {state.error && <div role="alert" className="flex shrink-0 items-center justify-between rounded-xl border border-red-100 bg-red-50 px-3.5 py-2 text-xs text-red-700">
                <span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-red-500" />{state.error}</span>
                <button type="button" onClick={state.reload} className="inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="h-3 w-3" />重试</button>
            </div>}

            {state.loading ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="mt-3 text-sm text-slate-500">正在翻开炼金图鉴…</p>
            </div> : <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
                <div className="min-h-0 overflow-y-auto pr-1 scrollbar-hide">
                    {!visible.length ? <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                        <FlaskConical className="h-10 w-10 text-violet-300" />
                        <p className="mt-3 text-sm font-medium text-slate-600">{view === 'potions' ? '还没有制作过炼金药水' : search ? '没有找到符合搜索条件的配方' : '当前分类下暂无配方'}</p>
                        {view === 'potions' && <p className="mt-1 text-xs text-slate-400">安排居民进行炼金日程后，成品会出现在这里</p>}
                    </div> : <div className={`grid gap-2.5 ${view === 'potions' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                        {visible.map(recipe => <ElixirCard key={recipe.id} recipe={recipe} isSelected={selected?.id === recipe.id} onClick={() => setSelectedId(recipe.id)} />)}
                    </div>}
                </div>
                <div className="min-h-0 flex-1">
                    {selected ? <ElixirDetails key={selected.id} recipe={selected} history={state.history} historyPage={state.page}
                        onHistoryPageChange={state.setPage} residentName={resident?.name} onOpenImagePicker={() => openImage(selected)}
                        onOpenRuleEditor={() => setEditing(selected)} /> : <div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-400">请从左侧选择需要查看的配方</div>}
                </div>
            </div>}
        </div>

        {editing && <AlchemyRuleEditor key={editing.id} recipe={editing} options={materials}
            onClose={() => setEditing(null)} onSaved={() => {setEditing(null); state.reload();}} />}
        {image && <ItemIconPicker key={image.id} item={image} onClose={() => setImage(null)}
            onSaved={() => {setImage(null); state.reload();}} />}
    </>;
}
