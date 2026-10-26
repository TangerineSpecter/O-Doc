import {useState} from 'react';
import {AlertCircle, BookOpen, Fish, Loader2, MapPin, RefreshCw, Search, X} from 'lucide-react';
import {useFishingCatalog} from '../../hooks/useFishing';
import {Select} from '../common/Select';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {FishingSpeciesCard} from './FishingSpeciesCard';
import {FishingSpeciesDetails} from './FishingSpeciesDetails';
import './fishingAtlas.css';

type CollectionFilter = 'all' | 'caught' | 'unseen';
const filters: {id: CollectionFilter; label: string}[] = [{id: 'all', label: '全部'}, {id: 'caught', label: '已收集'}, {id: 'unseen', label: '未收集'}];

export function FishingCatalog({active = true, residents = [], initialAgentId = ''}: {
    active?: boolean; residents?: {id: string; name: string}[]; initialAgentId?: string;
}) {
    const [actor, setActor] = useState(initialAgentId);
    const [spot, setSpot] = useState('pond');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<CollectionFilter>('all');
    const [selectedId, setSelectedId] = useState('');
    const {data, loading, error, reload} = useFishingCatalog(actor, active);
    // 目录存在 PostgreSQL jsonb 中，键序不保留，展示前按解锁等级与鱼等级重排。
    const spots = Object.entries(data?.rules.spots || {}).sort(([, a], [, b]) => a.requiredLevel - b.requiredLevel);
    const spotRank = new Map(spots.map(([id], index) => [id, index]));
    const allFish = Object.entries(data?.rules.fish || {}).sort(([aId, a], [bId, b]) =>
        (spotRank.get(a.spot) ?? 0) - (spotRank.get(b.spot) ?? 0) || a.level - b.level || aId.localeCompare(bId));
    const collected = allFish.filter(([id]) => (data?.discovery[id]?.count || 0) > 0).length;
    const spotFish = allFish.filter(([, fish]) => fish.spot === spot);
    const visible = spotFish.filter(([id, fish]) => {
        const caught = (data?.discovery[id]?.count || 0) > 0;
        return (filter === 'all' || (filter === 'caught' ? caught : !caught)) && fish.name.includes(search.trim());
    });
    const selected = visible.find(([id]) => id === selectedId) || visible[0];
    return <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <div className="fishing-atlas-header flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border p-2.5">
            <div className="w-36 shrink-0"><Select menuPortal={true} value={actor} onChange={setActor} options={[{value: '', label: '全体居民纪录'}, ...residents.map(r => ({value: r.id, label: r.name}))]}/></div>
            <div className="flex min-w-[140px] flex-1 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-800 bg-teal-800 text-teal-50 shadow-sm"><Fish className="h-5 w-5"/></span>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-4 text-[11px]"><h3 className="whitespace-nowrap text-sm font-bold tracking-wide text-teal-900">水边见闻</h3><span title="已收集鱼种 / 全部鱼种" className="whitespace-nowrap text-slate-400"><strong className="text-teal-600">{collected}</strong> / {allFish.length}</span></div><div className="mt-1.5 flex h-1.5 gap-0.5" aria-hidden="true">{allFish.map(([id]) => <span key={id} className={`h-full min-w-0 flex-1 rounded-sm ${data?.discovery[id]?.count ? 'bg-teal-700' : 'bg-teal-900/10'}`}/>)}</div></div>
            </div>
            <div className="relative w-full sm:ml-2 sm:w-48"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400"/><input type="search" aria-label="搜索鱼种" placeholder="搜索鱼种…" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-700 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 [&::-webkit-search-cancel-button]:appearance-none"/>{search && <button type="button" aria-label="清空搜索" onClick={() => setSearch('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5"/></button>}</div>
        </div>
        {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600"><AlertCircle className="h-4 w-4 shrink-0"/><span className="flex-1">{error}</span><button type="button" onClick={reload} className="inline-flex items-center gap-1 font-medium"><RefreshCw className="h-3 w-3"/>重试</button></div>}
        {loading && <div role="status" className="flex flex-1 items-center justify-center gap-2 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>正在翻开钓鱼图鉴…</div>}
        {data && !loading && <>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div aria-label="钓点筛选" className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200/60 bg-slate-100 p-1 scrollbar-hide">{spots.map(([id, location]) => <button type="button" key={id} aria-pressed={spot === id} onClick={() => setSpot(id)} className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${spot === id ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}><MapPin className="h-3 w-3"/>{location.name}<span className={`ml-0.5 text-[9px] ${spot === id ? 'text-teal-500' : 'text-slate-400'}`}>Lv.{location.requiredLevel}</span></button>)}</div>
                <div className="ml-auto flex items-center gap-1.5">{filters.map(item => {
                const count = spotFish.filter(([id]) => item.id === 'all' || (item.id === 'caught' ? Boolean(data.discovery[id]?.count) : !data.discovery[id]?.count)).length;
                return <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${filter === item.id ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{item.label}<span className="opacity-60">{count}</span></button>;
            })}<DecisionProcessInfo kind="fishing"/></div>
            </div>
            {visible.length > 0 ? <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide lg:grid lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-3 xl:grid-cols-[304px_minmax(0,1fr)] lg:overflow-hidden">
                <div aria-label="鱼种列表" className="mb-2.5 flex gap-1 overflow-x-auto pb-1 scrollbar-hide lg:mb-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:p-0.5">{visible.map(([id, fish]) => <FishingSpeciesCard key={id} id={id} number={allFish.findIndex(([key]) => key === id) + 1} fish={fish} record={data.discovery[id]} selected={selected?.[0] === id} onSelect={() => setSelectedId(id)}/>)}</div>
                {selected && <FishingSpeciesDetails number={allFish.findIndex(([key]) => key === selected[0]) + 1} id={selected[0]} fish={selected[1]} record={data.discovery[selected[0]]} rules={data.rules}/>}
            </div> : <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400"><BookOpen className="mb-2 h-8 w-8 text-slate-200"/><p>{search.trim() ? '没有匹配的鱼种' : filter === 'caught' ? '这个钓点还没有捕获纪录' : '这个分类暂时没有鱼种'}</p><button type="button" onClick={() => {setSearch(''); setFilter('all');}} className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 font-medium text-teal-700">查看全部鱼种</button></div>}
        </>}
    </div>;
}
