import {useSearchParams} from 'react-router-dom';
import {useState} from 'react';
import {BookHeart, LayoutGrid, List, PenLine, Search, X} from 'lucide-react';
import {useDiary} from '../hooks/useDiary';
import {type DiaryEntry} from '../types/api/diary';
import DiaryBrowseFilters from '../components/Diary/DiaryBrowseFilters';
import {matchesDiarySelection, type DiaryBrowseSelection} from '../components/Diary/diaryBrowse';
import DiaryCalendar from '../components/Diary/DiaryCalendar';
import DiaryCard from '../components/Diary/DiaryCard';
import DiaryEditor from '../components/Diary/DiaryEditor';
import '../components/Diary/diary.css';
export default function DiaryPage() {
    const {entries, loading, error, retry, save, remove} = useDiary();
    const [params, setParams] = useSearchParams();
    const [browse, setBrowse] = useState<DiaryBrowseSelection>({mode: 'all', value: ''});
    const [view, setView] = useState<'cards' | 'timeline'>('cards');
    const [keyword, setKeyword] = useState('');
    const [selected, setSelected] = useState('');
    const [month, setMonth] = useState(() => new Date());
    const [editor, setEditor] = useState<DiaryEntry | 'new' | null>(null);
    const linkedEntry = entries.find(entry => entry.diaryId === params.get('entry'));
    const activeEditor = editor || linkedEntry;
    const closeEditor = () => {setEditor(null); if (params.has('entry')) {const next = new URLSearchParams(params); next.delete('entry'); setParams(next, {replace: true});}};
    const filtered = entries.filter(entry => matchesDiarySelection(entry, browse) && (!selected || entry.entryDate === selected) && `${entry.title}\n${entry.content}\n${entry.tags.join(" ")}`.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())).sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt));
    return <main className="diary-page mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-5"><div><h1 className="text-2xl font-bold text-slate-900">{view === 'cards' ? '日记回顾' : '时间轴'}</h1><p className="mt-2 text-sm text-slate-500">记录生活，遇见更好的自己。</p></div><button disabled={loading} onClick={() => setEditor('new')} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-orange-600/30 bg-orange-500 px-5 text-sm font-semibold text-white shadow-sm shadow-orange-500/15 transition-colors hover:bg-orange-600 active:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"><PenLine size={17} strokeWidth={2}/>写日记</button></header>
        <div className="my-7 flex flex-col items-start gap-4 lg:flex-row lg:justify-between"><DiaryBrowseFilters entries={entries} selection={browse} onChange={setBrowse}/><div className="flex w-full items-center gap-3 sm:w-auto"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2"><Search size={16} className="text-slate-400"/><input aria-label="搜索日记" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索日记…" className="w-full bg-transparent text-sm outline-none sm:w-40"/></label><div className="flex rounded-full bg-slate-100 p-1">{(['cards', 'timeline'] as const).map(v => <button key={v} aria-label={v === 'cards' ? '卡片视图' : '时间轴视图'} aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full p-2 ${view === v ? 'bg-white text-orange-600' : 'text-slate-400'}`}>{v === 'cards' ? <LayoutGrid size={17}/> : <List size={17}/>}</button>)}</div></div></div>
        {!loading && params.has('entry') && !linkedEntry && <p role="alert" className="mb-4 text-sm text-red-600">这篇日记不存在、已删除或无权查看。</p>}
        {selected && <button onClick={() => setSelected('')} className="mb-5 flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-xs text-orange-700">{selected} · 清除日期筛选<X size={13}/></button>}
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_292px]"><section aria-label="日记列表" className="min-w-0">
            {loading ? <div role="status" className="grid gap-5 sm:grid-cols-2"><span className="sr-only">正在加载日记</span>{[1, 2, 3, 4].map(n => <div key={n} className="h-64 animate-pulse rounded-2xl bg-slate-100"/>)}</div> : error ? <div role="alert" className="rounded-2xl bg-white p-10 text-center"><p className="text-sm text-slate-600">{error}</p><button onClick={retry} className="mt-4 text-sm text-orange-600">重新加载</button></div> : !filtered.length ? <div className="rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center"><BookHeart size={32} className="mx-auto text-orange-300"/><h2 className="mt-5 text-lg font-bold">{entries.length ? '没有找到日记' : '从今天开始，记录生活'}</h2><p className="mt-2 text-sm text-slate-500">{entries.length ? '试试其他关键词、心情、天气、标签或日期。' : '心情、生活与片刻灵感，都可以留在这里。'}</p><button onClick={() => {if (entries.length) {setBrowse({mode: 'all', value: ''}); setKeyword(''); setSelected('');} else setEditor('new');}} className="mt-5 text-sm font-semibold text-orange-600">{entries.length ? '清除筛选' : '写第一篇日记'}</button></div> : view === 'cards' ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(entry => <DiaryCard key={entry.diaryId} entry={entry} onOpen={() => setEditor(entry)}/>)}</div> : <div className="diary-timeline space-y-8">{filtered.map(entry => <div key={entry.diaryId} className="diary-timeline-item"><p className="mb-3 text-xs text-slate-500">{entry.entryDate} · {new Date(entry.createdAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}</p><DiaryCard entry={entry} timeline onOpen={() => setEditor(entry)}/></div>)}</div>}
        </section><DiaryCalendar month={month} onMonth={setMonth} entries={entries} selected={selected} onSelect={setSelected}/></div>
        {activeEditor && <DiaryEditor key={activeEditor === 'new' ? 'new' : activeEditor.diaryId} entry={activeEditor === 'new' ? undefined : activeEditor} onClose={closeEditor} onSave={save} onDelete={remove}/>}
    </main>;
}
