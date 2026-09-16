import {useCallback, useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Layers, Loader2, Search, Sparkles} from 'lucide-react';
import {useBookAnalysis} from '../hooks/useBookAnalysis';
import {useReadingGraph} from '../hooks/useReadingGraph';
import {useBookGuideContent} from '../hooks/useBookGuideContent';
import {nodeLabels} from '../utils/readingGraph';
import type {GraphFilters, GraphView} from '../types/bookAnalysis';
import {Select} from '../components/common/Select';
import AnalysisControls from '../components/BookAnalysis/AnalysisControls';
import ReadingChart from '../components/BookAnalysis/ReadingChart';
import StoryFlowCanvas from '../components/BookAnalysis/StoryFlowCanvas';
import ReadingResults from '../components/BookAnalysis/ReadingResults';
import ReadingNodePanel from '../components/BookAnalysis/ReadingNodePanel';
import ReadingAsk from '../components/BookAnalysis/ReadingAsk';
import GuideDigest from '../components/BookAnalysis/GuideDigest';
import ChapterBoundary from '../components/BookAnalysis/ChapterBoundary';
import BookReader from '../components/Book/BookReader';

type PageView = GraphView | 'digest' | 'overview';
export default function BookAnalysisPage() {
    const {bookId = '', collId = ''} = useParams();
    const navigate = useNavigate();
    const [versionId, setVersionId] = useState('');
    const {status, loading, busy, running, error, reload, perform} = useBookAnalysis(bookId, versionId);
    const [chosenView, setView] = useState<PageView | null>(null);
    const view = chosenView || (status?.mode === 'story' ? 'flow' : 'digest');
    const [chapterId, setChapterId] = useState('');
    const [chapterPage, setChapterPage] = useState(1);
    const [throughChapter, setThroughChapter] = useState<number | undefined>();
    const [includeInferred, setIncludeInferred] = useState(false);
    const [selectedNode, selectNode] = useState('');
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('');
    const [thread, setThread] = useState('');
    const [center, setCenter] = useState('');
    const [order, setOrder] = useState<'narrative' | 'time'>('narrative');
    const [graphPage, setGraphPage] = useState(1);
    const [correctionKey, setCorrectionKey] = useState(0);
    const refreshKey = `${status?.run?.completed || 0}:${status?.run?.state || ''}:${correctionKey}`;
    const {chapters, guide, guideError, contentLoading, reader, onRead, closeReader} = useBookGuideContent(bookId, status, chapterId, chapterPage, refreshKey, versionId);
    const filters: GraphFilters = {view: view === 'digest' || view === 'overview' ? 'graph' : view, chapterId: view === 'overview' ? '' : chapterId, kind, query, center, thread, order, page: graphPage, throughChapter, includeInferred};
    const reading = useReadingGraph(bookId, status?.revisionId || '', filters, refreshKey);
    const graph = reading.graph;
    const onSelect = useCallback((id: string) => selectNode(id), []);
    const onEdge = useCallback((id: string) => {const edge = graph.edges.find(e => e.id === id); if (edge) selectNode(edge.source);}, [graph.edges]);
    const onSaved = useCallback(() => {setCorrectionKey(k => k + 1); void reload();}, [reload]);
    useEffect(() => {setView(null); selectNode(''); setCenter(''); setKind(''); setGraphPage(1);}, [status?.mode]);
    useEffect(() => {setGraphPage(1);}, [chapterId, query, kind, center, thread, view, order, throughChapter, includeInferred]);
    if (reader) return <BookReader book={reader.book} initialLocation={reader.source} onClose={closeReader} onProgressSaved={() => undefined}/>;
    if (loading) return <div className="flex min-h-96 items-center justify-center text-orange-500"><Loader2 className="h-6 w-6 animate-spin"/></div>;
    if (!status) return <div className="p-8"><p role="alert" className="text-sm text-red-600">{error || '图书不可访问'}</p><button onClick={() => navigate(`/books/${collId}`)} className="mt-4 text-sm text-orange-600">返回书架</button></div>;
    const views: {id: PageView; label: string}[] = status.mode === 'story' ? [{id: 'flow', label: '情节流程'}, {id: 'graph', label: '关系图谱'}, {id: 'timeline', label: '时间线'}, {id: 'digest', label: '章节回顾'}, {id: 'overview', label: '整书概要'}] : [{id: 'digest', label: '章节导读'}, {id: 'graph', label: '知识图谱'}, {id: 'mindmap', label: '思维导图'}, {id: 'overview', label: '整书概要'}];
    const currentChapter = chapters.items.find(ch => ch.id === chapterId);
    const currentNode = graph.nodes.find(n => n.id === selectedNode);
    const chooseChapter = (id: string) => {setChapterId(id); setCenter(''); selectNode('');};
    return <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-3 py-5 sm:px-5 lg:px-7">
        <header className="mx-auto max-w-[1680px] rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><button onClick={() => navigate(`/books/${collId}`)} className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600"><ArrowLeft className="h-3 w-3"/>返回书架</button><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 shrink-0 text-orange-500"/><h1 className="break-words font-serif text-xl font-bold text-slate-800">{status.book.title}</h1></div><p className="mt-1 text-[11px] text-slate-400">{status.book.author || '未知作者'} · {status.mode === 'story' ? '情节、人物和线索的阅读地图 · 默认允许整书剧透' : '重点、概念和方法的阅读地图'}</p></div><button onClick={() => void onRead()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-orange-200"><BookOpen className="h-4 w-4"/>阅读原文</button></div>
            <AnalysisControls status={status} busy={busy} running={running} perform={perform}/>
            {!!status.versions?.length && <div className="mt-3 max-w-sm"><Select value={versionId} options={[{value: '', label: '当前发布版本'}, ...status.versions.map(item => ({value: item.id, label: `${new Date(item.createdAt).toLocaleString()} · ${item.mode === 'story' ? '故事' : '知识'} · ${item.complete ? '全书' : '部分章节'}`}))]} onChange={value => {setVersionId(value); chooseChapter(''); setChapterPage(1); setThread(''); setQuery('');}}/></div>}
            {(error || status.stale) && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error || '正文、模式或章节设置已变化，旧分析不再适用于当前内容，请重新分析。'}</p>}
            {status.inspection.supported === false && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">{status.inspection.reason}</p>}
            <p className="mt-3 text-[10px] leading-5 text-slate-400">结果基于可提取文字，未理解图片、图表和公式内容。{status.inspection.fallbackSections && ' 当前为自动分段，可修正章节边界。'}</p>
        </header>
        <div className="mx-auto mt-4 flex max-w-[1680px] flex-col items-start gap-4 lg:flex-row">
            <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-20 lg:w-56">
                <div className="mb-3 rounded-lg bg-slate-50 p-2"><label className="text-[10px] text-slate-500">认识范围<select aria-label="截至章节" value={throughChapter || ''} onChange={event => setThroughChapter(event.target.value ? Number(event.target.value) : undefined)} className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"><option value="">全部已分析内容</option>{Array.from({length: status.inspection.chapterCount || 0}, (_, index) => <option key={index + 1} value={index + 1}>截至第 {index + 1} 章</option>)}</select></label><label className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><input type="checkbox" checked={includeInferred} onChange={event => setIncludeInferred(event.target.checked)}/>在图中显示待验证关联</label></div><div className="mb-2 flex items-center justify-between px-2 text-xs font-bold text-slate-600"><span>章节与范围</span><span className="text-[10px] font-normal text-slate-400">{chapters.total} 章</span></div><button onClick={() => chooseChapter('')} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs ${!chapterId ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><Layers className="h-3.5 w-3.5"/>全部已分析内容</button>
                <div className="flex max-h-48 flex-col overflow-y-auto lg:max-h-[55vh]">{chapters.items.map(ch => <button key={ch.id} onClick={() => chooseChapter(ch.id)} title={ch.title} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-left text-xs leading-5 ${chapterId === ch.id ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><i className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ch.analyzed ? 'bg-lime-500' : 'bg-slate-200'}`}/><span className="line-clamp-2">{ch.ordinal}. {ch.title}</span></button>)}</div>
                {chapters.total > 50 && <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400"><button aria-label="上一页章节" disabled={chapterPage === 1} onClick={() => setChapterPage(p => p - 1)}><ChevronLeft className="h-4 w-4"/></button>{chapterPage} / {Math.ceil(chapters.total / 50)}<button aria-label="下一页章节" disabled={chapterPage * 50 >= chapters.total} onClick={() => setChapterPage(p => p + 1)}><ChevronRight className="h-4 w-4"/></button></div>}
                <div className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-5 text-slate-400"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-lime-500"/>已分析章节可查看导读。<br/>跨章节内容以实际完成范围为准。</div>
            </aside>
            <section className="w-full min-w-0 flex-1 space-y-4 lg:w-auto">
                <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">{views.map(item => <button key={item.id} onClick={() => setView(item.id)} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === item.id ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}>{item.label}</button>)}</nav>
                {guide && status.canManage && <ChapterBoundary key={guide.id} bookId={bookId} chapter={guide} disabled={running} onSaved={() => {chooseChapter(''); onSaved();}}/>}
                {!status.revisionId ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center"><BookOpen className="mb-3 h-8 w-8 text-orange-300"/><h2 className="font-serif text-lg font-semibold text-slate-700">先建立这本书的阅读地图</h2><p className="mt-2 max-w-sm text-xs leading-6 text-slate-400">检测可提取文字后，选择阅读模式与章节范围，点击开始分析。每个情节或重点都会关联原文来源。</p></div> : <>
                {view === 'overview' ? <article className="rounded-xl border border-slate-200 bg-white p-6"><p className="text-[10px] text-orange-600">BOOK OVERVIEW</p><h2 className="mt-2 font-serif text-xl font-bold text-slate-800">{status.overview.complete ? '全书总结' : '已分析章节概要'}</h2><p className="mt-2 text-[11px] text-slate-400">覆盖 {status.overview.coveredChapters?.length || 0} / {status.overview.totalChapters || status.inspection.chapterCount || 0} 章</p><p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-600">{status.overview.summary || '章节完成后会逐步整理概要。'}</p></article> : view === 'digest' ? <>{contentLoading && <p className="p-4 text-xs text-slate-400">加载章节导读…</p>}{guideError && <p role="alert" className="text-xs text-red-600">{guideError}</p>}{guide?.digest ? <GuideDigest title={guide.title} digest={guide.digest} nodes={graph.nodes} onSelect={onSelect} onRead={onRead}/> : <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{chapterId ? '该章尚未完成分析。' : '选择左侧章节，查看总结、重点和问答。'}</div>}</> : <>
                    <div className="flex flex-wrap items-center gap-2">{status.mode === 'story' && !!graph.threads?.length && <div className="w-36 shrink-0"><Select value={thread} options={[{value: '', label: '全部故事线'}, ...graph.threads.map(value => ({value, label: value}))]} onChange={setThread} buttonClassName="!min-h-9 !py-1 text-xs"/></div>}<div className="flex min-w-[140px] flex-1 basis-44 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search className="h-3.5 w-3.5 shrink-0 text-slate-400"/><input aria-label="搜索图谱" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="搜索人物、情节、地点或概念" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none"/></div>{view === 'graph' && <div className="w-28 shrink-0"><Select value={kind} options={[{value: '', label: '全部类型'}, ...Object.entries(nodeLabels).map(([value, label]) => ({value, label}))]} onChange={setKind} buttonClassName="!min-h-9 !py-1 text-xs"/></div>}{status.mode === 'story' && <div className="w-32 shrink-0"><Select value={order} options={[{value: 'narrative', label: '叙述顺序'}, {value: 'time', label: '故事时间'}]} onChange={setOrder} buttonClassName="!min-h-9 !py-1 text-xs"/></div>}{selectedNode && <button onClick={() => {setCenter(selectedNode); setView('graph'); setKind(''); setQuery('');}} className="shrink-0 rounded-lg border border-orange-200 px-2 py-2 text-xs text-orange-600">以选中对象为中心</button>}{center && <button onClick={() => setCenter('')} className="text-xs text-slate-400">返回全图</button>}</div>
                    {reading.loading && <p className="text-xs text-slate-400">加载阅读结构…</p>}{reading.error && <p role="alert" className="text-xs text-red-600">{reading.error}</p>}
                    {graph.nodes.length > 0 && view === 'flow' && <StoryFlowCanvas key={`${status.revisionId}:${chapterId}:${thread}:${order}:${graph.page}`} graph={graph} order={order} selectedId={selectedNode} onSelect={onSelect}/>}
                    {graph.nodes.length > 0 && (view === 'graph' || view === 'mindmap') && <ReadingChart graph={graph} view={view} title={currentChapter?.title || status.book.title} order={order} onSelect={onSelect} onEdge={onEdge}/>}
                    <ReadingResults graph={graph} view={view} order={order} selectedId={selectedNode} page={graphPage} onPage={setGraphPage} onSelect={onSelect}/>
                </>}
                {!status.history && <ReadingAsk bookId={bookId} revisionId={status.revisionId} chapterId={view === 'overview' ? '' : chapterId} nodeId={selectedNode} scopeLabel={`${currentNode?.name || currentChapter?.title || '本书已分析范围'}${throughChapter ? ` · 截至第 ${throughChapter} 章` : ''}`} throughChapter={throughChapter} onRead={onRead}/>}
                </>}
            </section>
            {selectedNode && status.revisionId && <ReadingNodePanel bookId={bookId} revisionId={status.revisionId} nodeId={selectedNode} graph={graph} canManage={status.canManage} refreshKey={refreshKey} throughChapter={throughChapter} onSelect={onSelect} onClose={() => selectNode('')} onRead={onRead} onSaved={onSaved}/>}
        </div>
    </main>;
}
