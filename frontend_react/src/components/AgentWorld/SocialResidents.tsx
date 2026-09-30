import {useState} from 'react';
import {ChevronLeft, ChevronRight, Search, Users} from 'lucide-react';
import {Checkbox} from '../common/Checkbox';

const PAGE_SIZE = 6;

export default function SocialResidents({agents, selected, onChange, disabled = false}: {
    agents: {id: string; name: string}[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const filtered = agents.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pages - 1);
    const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
    const toggle = (id: string, checked: boolean) => onChange(checked ? [...new Set([...selected, id])] : selected.filter(v => v !== id));
    return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-bold text-slate-800"><Users className="h-4 w-4 text-orange-500"/>参与居民</h3><span className="text-[11px] text-slate-400">已选 {selected.length} / {agents.length}</span></div>
        <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"/><input aria-label="搜索居民" placeholder="搜索居民姓名" value={search} disabled={disabled} onChange={e => {setSearch(e.target.value); setPage(0);}} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-3 text-xs outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></div>
        <div className="my-3 flex gap-3 text-[11px]"><button disabled={disabled || !filtered.length} type="button" onClick={() => onChange([...new Set([...selected, ...filtered.map(a => a.id)])])} className="text-orange-600 disabled:text-slate-300">{search ? '选中搜索结果' : '全选居民'}</button><button disabled={disabled || !selected.length} type="button" onClick={() => onChange(search ? selected.filter(id => !filtered.some(a => a.id === id)) : [])} className="text-slate-400 disabled:opacity-40">{search ? '取消搜索结果' : '清空选择'}</button></div>
        <div className="grid min-h-[116px] content-start grid-cols-2 gap-2">
            {visible.map(a => <Checkbox key={a.id} checked={selected.includes(a.id)} onChange={v => toggle(a.id, v)} disabled={disabled} label={<span className="block truncate" title={a.name}>{a.name}</span>} className={`min-w-0 rounded-xl border px-2.5 py-2.5 ${selected.includes(a.id) ? 'border-orange-200 bg-orange-50/60' : 'border-slate-100 bg-slate-50/70'}`}/>)}
            {!visible.length && <p className="col-span-2 py-6 text-center text-xs text-slate-400">{agents.length ? '没有匹配的居民' : '先在生活日程中配置居民'}</p>}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{filtered.length} 位居民 · {current + 1}/{pages} 页</span><div className="flex gap-1"><button type="button" disabled={disabled || current === 0} aria-label="上一页居民" onClick={() => setPage(current - 1)} className="rounded-lg p-1 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button><button type="button" disabled={disabled || current === pages - 1} aria-label="下一页居民" onClick={() => setPage(current + 1)} className="rounded-lg p-1 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button></div></div>
    </section>;
}
