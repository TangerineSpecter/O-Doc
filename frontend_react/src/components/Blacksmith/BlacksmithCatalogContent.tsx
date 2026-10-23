import {useMemo, useState} from 'react';
import {AlertCircle, ArrowLeft, BookOpen, Hammer, History, RefreshCw, SlidersHorizontal, Zap} from 'lucide-react';
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
    white: {name: '白装', dot: 'bg-slate-300'}, blue: {name: '蓝装', dot: 'bg-sky-500'}, gold: {name: '金装', dot: 'bg-amber-400'},
};

export function BlacksmithCatalogContent({residents, initialAgentId = '', active = true}: {
    residents: {id: string; name: string}[]; initialAgentId?: string; active?: boolean;
}) {
    const [agentId, setAgentId] = useState(residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || '');
    const state = useBlacksmith(agentId, active);
    const [view, setView] = useState<'recipes' | 'history'>('recipes');
    const [band, setBand] = useState('');
    const [slot, setSlot] = useState('');
    const [readyOnly, setReadyOnly] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [detailOpen, setDetailOpen] = useState(false);
    const [editing, setEditing] = useState<BlacksmithRecipe | null>(null);
    const recipes = useMemo(() => state.data?.recipes || [], [state.data?.recipes]);
    const visible = useMemo(() => filterBlacksmithRecipes(recipes, band, slot, readyOnly), [recipes, band, slot, readyOnly]);
    const slots = useMemo(() => [...new Map(recipes.map(recipe => [recipe.slot, recipe.slotName])).entries()], [recipes]);
    const selected = visible.find(recipe => recipe.id === selectedId) || visible[0] || null;
    const actor = state.data?.actor;
    const qualities = state.data?.qualityProbabilities || [{quality: 'white', probability: .7}, {quality: 'blue', probability: .25}, {quality: 'gold', probability: .05}];
    return <>
        <div data-blacksmith-catalog className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="w-32"><Select menuPortal menuClassName="scrollbar-hide" value={agentId} options={residents.map(row => ({value: row.id, label: row.name}))} placeholder="选择居民"
                        buttonClassName="!min-h-9 !py-1.5 text-xs" onChange={id => {setAgentId(id); state.setPage(1); setDetailOpen(false);}}/></div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        {actor?.initialized ? <><span className="font-medium text-slate-700">{actor.jobName}</span><span className="rounded-md bg-white px-1.5 py-0.5 font-semibold tabular-nums">Lv.{actor.level}</span>
                            <span className="ml-1 inline-flex items-center gap-1 tabular-nums"><Zap className="h-3.5 w-3.5 text-amber-600"/>{actor.energy}<span className="text-slate-500">体力</span></span></>
                            : <span>{actor ? '尚未建立冒险档案' : '选择居民，查看材料与职业路线'}</span>}
                    </div>
                </div>
                <div className="ml-auto hidden items-center gap-2 sm:flex">
                    <div aria-label="打造品质概率" className="hidden items-center gap-3 pr-2 text-[11px] text-slate-600 sm:flex">{qualities.map(row => <span key={row.quality} className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                        <span className={`h-1.5 w-1.5 rounded-full ${qualityStyles[row.quality]?.dot || 'bg-slate-300'}`}/>{qualityStyles[row.quality]?.name || row.quality} {Math.round(row.probability * 100)}%</span>)}</div>
                    <DecisionProcessInfo kind="blacksmith"/>
                    <button type="button" aria-label="刷新铁匠铺" onClick={state.reload} className="rounded-xl p-2 text-slate-500 hover:bg-white hover:text-orange-700"><RefreshCw className="h-4 w-4"/></button>
                </div>
            </div>
            <BlacksmithGoals goalState={state.data?.goalState}/>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="inline-flex gap-1 rounded-full border border-slate-200/60 bg-slate-100 p-1" aria-label="铁匠铺视图">
                    {([{id: 'recipes', label: '打造配方', icon: BookOpen}, {id: 'history', label: '打造记录', icon: History}] as const).map(tab => <button key={tab.id} type="button" aria-pressed={view === tab.id} onClick={() => setView(tab.id)}
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 ${view === tab.id ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'}`}><tab.icon className="h-3.5 w-3.5"/>{tab.label}</button>)}
                </div>
                <div className="ml-auto flex items-center gap-1 sm:hidden"><DecisionProcessInfo kind="blacksmith"/>
                    <button type="button" aria-label="刷新铁匠铺" onClick={state.reload} className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-50"><RefreshCw className="h-4 w-4"/></button></div>
                {view === 'recipes' && <>
                    <span className="mx-1 hidden h-5 w-px bg-slate-200 xl:block"/>
                    <div className={`${detailOpen ? 'hidden lg:flex' : 'grid sm:flex'} w-full min-w-0 grid-cols-2 items-center gap-2 sm:w-auto sm:flex-1 sm:flex-wrap`}>
                        <div className="sm:w-36"><Select menuPortal menuClassName="scrollbar-hide" value={band} options={[{value: '', label: '全部等级范围'}, ...(state.data?.bands || []).map(row => ({value: row.id, label: row.label}))]}
                            buttonClassName="!min-h-9 !py-1.5 text-xs" onChange={value => {setBand(value); setDetailOpen(false);}}/></div>
                        <div className="sm:w-28"><Select menuPortal menuClassName="scrollbar-hide" value={slot} options={[{value: '', label: '全部部位'}, ...slots.map(([value, label]) => ({value, label}))]}
                            buttonClassName="!min-h-9 !py-1.5 text-xs" onChange={value => {setSlot(value); setDetailOpen(false);}}/></div>
                        <button type="button" aria-pressed={readyOnly} onClick={() => {setReadyOnly(value => !value); setDetailOpen(false);}}
                            className={`inline-flex h-9 w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors ${readyOnly ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}><SlidersHorizontal className="h-3 w-3"/>只看可打造</button>
                        <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-slate-500">{visible.length} 个配方</span>
                    </div>
                </>}
            </div>
            {state.error && <div role="alert" className="flex shrink-0 items-start justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4 shrink-0"/>{state.error}</span><button type="button" onClick={state.reload} className="shrink-0 font-semibold underline">重试</button></div>}
            {state.loading ? <div role="status" aria-label="正在读取打造配方" className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-2">{[1, 2, 3, 4].map(key => <div key={key} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"><div className="h-14 w-14 shrink-0 rounded-xl bg-slate-100"/><div className="flex-1 space-y-3"><div className="h-3 w-1/2 rounded bg-slate-100"/><div className="h-2.5 w-3/4 rounded bg-slate-100"/></div></div>)}</div>
                <div className="hidden rounded-2xl border border-slate-200 p-4 lg:block"><div className="h-16 w-16 rounded-xl bg-slate-100"/><p className="mt-4 text-xs text-slate-500">正在读取打造配方…</p></div>
            </div>
                : state.error && !state.data ? <div className="min-h-0 flex-1"/>
                : view === 'history' ? <BlacksmithHistory history={state.history} page={state.page} onPage={state.setPage}/>
                : <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
                    {/* 固定配方列 320/360px + 12px 间距，其余宽度全部用于装备和材料详情。 */}
                    <div className={`min-h-0 overflow-y-auto px-0.5 pb-0.5 scrollbar-hide ${detailOpen ? 'hidden lg:block' : ''}`}>
                        {visible.length ? <div className="space-y-2">{visible.map(recipe => <BlacksmithRecipeCard key={recipe.id} recipe={recipe} selected={selected?.id === recipe.id}
                            onClick={() => {setSelectedId(recipe.id); setDetailOpen(true);}}/>)}</div>
                            : <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center"><Hammer className="mx-auto mb-3 h-7 w-7 text-slate-300"/><p className="text-sm font-semibold text-slate-700">{!recipes.length ? '暂无打造配方' : readyOnly ? '暂无可打造的配方' : '暂无匹配配方'}</p>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">{!recipes.length ? '配方准备好后，装备与材料来源会展示在这里。' : readyOnly ? '切回全部配方，查看材料缺口与来源。' : '试试其他等级范围或装备部位。'}</p>
                                {(readyOnly || band || slot) && <button type="button" onClick={() => {setReadyOnly(false); setBand(''); setSlot('');}} className="mt-3 text-xs font-medium text-orange-700 hover:underline">清除筛选</button>}</div>}
                    </div>
                    <div className={`min-h-0 ${detailOpen ? 'flex' : 'hidden lg:flex'} flex-col gap-2`}>
                        <button type="button" onClick={() => setDetailOpen(false)} className="inline-flex shrink-0 items-center gap-1 self-start py-1 text-xs font-medium text-slate-600 lg:hidden"><ArrowLeft className="h-3.5 w-3.5"/>返回配方列表</button>
                        {selected ? <BlacksmithRecipeDetails recipe={selected} materials={state.data?.materials || []} onEdit={() => setEditing(selected)}/> : <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-5 text-center">
                            <BookOpen className="mb-3 h-7 w-7 text-slate-300"/><p className="text-sm font-medium text-slate-600">选择一份打造配方</p><p className="mt-2 text-xs text-slate-500">查看职业路线装备与材料来源</p></div>}
                    </div>
                </div>}
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Hammer className="h-3 w-3 shrink-0"/>每件 {state.data?.energyCost ?? 2} 体力 · 免加工费 · 单次最多 {state.data?.maxPieces ?? 3} 件</span>
                <span className="hidden sm:block">逐件打造，自动复核日程预留与体力保护</span>
                <span className="flex gap-3 sm:hidden">{qualities.map(row => <span key={row.quality} className="whitespace-nowrap">{qualityStyles[row.quality]?.name || row.quality} {Math.round(row.probability * 100)}%</span>)}</span>
            </footer>
        </div>
        {editing && <BlacksmithRuleEditor key={editing.id} recipe={editing} materials={state.data?.materials || []} onClose={() => setEditing(null)} onSaved={() => {setEditing(null); state.reload();}}/>}
    </>;
}
