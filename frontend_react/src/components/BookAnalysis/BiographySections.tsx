import {useEffect, useState} from 'react';
import {BookOpen, Link2, Search} from 'lucide-react';
import {getBiography, getBiographyDetail, getChapterGuide, readingError} from '../../api/bookAnalysis';
import type {BiographyDetail, BiographyOutline, BiographyResult, ChapterDigest, ReadingNode, SourceEvidence} from '../../types/bookAnalysis';
import BiographyChapterFlow from './BiographyChapterFlow';
import BiographyExperienceNotes from './BiographyExperienceNotes';
import BiographyClaimNotes from './BiographyClaimNotes';

interface Props {bookId: string; revisionId: string; chapterId: string; throughChapter?: number; section: 'life' | 'ideas'; refreshKey: string; outline: BiographyOutline | null; outlineError: string; fallbackChapter?: {id: string; ordinal: number; title: string; analyzed: boolean}; focusNodeId?: string; onRelated: (chapterId: string, view: 'life' | 'ideas', nodeId: string) => void; onRead: (source: SourceEvidence) => void}

export default function BiographySections({bookId, revisionId, chapterId, throughChapter, section, refreshKey, outline, outlineError, fallbackChapter, focusNodeId, onRelated, onRead}: Props) {
    const extra = fallbackChapter?.analyzed && !outline?.chapters.some(item => item.id === fallbackChapter.id) && (!throughChapter || fallbackChapter.ordinal <= throughChapter) ? [{...fallbackChapter, summary: '', events: 0, ideas: 0, quotes: 0, anchors: []}] : [];
    const chapters = [...(outline?.chapters || []), ...extra];
    const chapter = chapters.find(item => item.id === chapterId) || chapters[0];
    const effectiveId = chapter?.id || '';
    const [page, setPage] = useState(1);
    const [result, setResult] = useState<BiographyResult | null>(null);
    const [digest, setDigest] = useState<ChapterDigest | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [ideaTab, setIdeaTab] = useState<'ideas' | 'quotes'>('ideas');
    const [selectedId, setSelectedId] = useState('');
    const [detail, setDetail] = useState<{key: string; value: BiographyDetail} | null>(null);
    const [detailError, setDetailError] = useState<{key: string; message: string} | null>(null);
    useEffect(() => {setPage(1); setSelectedId(focusNodeId || ''); setIdeaTab('ideas'); setQuery('');}, [bookId, revisionId, effectiveId, throughChapter, section, focusNodeId]);
    useEffect(() => {
        if (!effectiveId) {setResult(null); return;}
        const controller = new AbortController();
        setLoading(true);
        setResult(null);
        void getBiography(bookId, {revisionId, chapterId: effectiveId, throughChapter, page}, controller.signal)
            .then(value => {if (!controller.signal.aborted) {setResult(value); setError('');}})
            .catch(reason => {if (!controller.signal.aborted) setError(readingError(reason));})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [bookId, revisionId, effectiveId, throughChapter, page, refreshKey]);
    useEffect(() => {
        if (!effectiveId) {setDigest(null); return;}
        const controller = new AbortController();
        setDigest(null);
        void getChapterGuide(bookId, effectiveId, controller.signal, revisionId)
            .then(value => {if (!controller.signal.aborted) setDigest(value.digest);})
            .catch(() => undefined);
        return () => controller.abort();
    }, [bookId, revisionId, effectiveId, refreshKey]);
    const items = section === 'life' ? result?.events.nodes || [] : ideaTab === 'ideas' ? result?.ideas.nodes || [] : result?.quotes.items || [];
    const filtered = items.filter(item => ('name' in item ? item.name : item.text).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const selected = selectedId ? filtered.find(item => item.id === selectedId) : filtered[0];
    const node = selected && 'facts' in selected ? selected as ReadingNode : null;
    const quote = selected && 'speaker' in selected ? selected : null;
    const targetId = selectedId || selected?.id || '';
    const targetKind = section === 'life' ? 'event' : ideaTab === 'ideas' ? 'claim' : 'quote';
    const needsPageResolve = Boolean(selectedId && !selected);
    const detailKey = `${revisionId}:${effectiveId}:${throughChapter ?? ''}:${targetKind}:${targetId}:${refreshKey}`;
    useEffect(() => {
        if (!effectiveId || !targetId) return;
        const controller = new AbortController();
        void getBiographyDetail(bookId, {revisionId, chapterId: effectiveId, throughChapter, targetId, targetKind}, controller.signal)
            .then(value => {
                if (controller.signal.aborted) return;
                setDetail({key: detailKey, value});
                if (needsPageResolve) setPage(current => current === value.page ? current : value.page);
            })
            .catch(reason => {if (!controller.signal.aborted) setDetailError({key: detailKey, message: readingError(reason)});});
        return () => controller.abort();
    }, [bookId, revisionId, effectiveId, throughChapter, targetId, targetKind, detailKey, needsPageResolve]);
    const selectedDetail = detail?.key === detailKey ? detail.value : null;
    const total = section === 'life' ? result?.events.total || 0 : ideaTab === 'ideas' ? result?.ideas.total || 0 : result?.quotes.total || 0;
    const links = result?.ideaEventLinks.filter(item => section === 'life' ? item.eventId === node?.id : item.ideaId === node?.id) || [];
    const linkedQuotes = section === 'life' ? selectedDetail?.relatedQuotes || [] : [];
    const quoteClaims = quote ? selectedDetail?.relatedClaims || [] : [];
    if (chapterId && fallbackChapter && (!fallbackChapter.analyzed || (throughChapter && fallbackChapter.ordinal > throughChapter))) {
        return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{fallbackChapter.analyzed ? '所选章节不在当前认识范围内，请调整范围。' : '该章尚未完成分析，请选择已分析章节。'}</div>;
    }
    return <div className="space-y-3">
        {(outlineError || error) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{outlineError || error}</p>}
        {detailError?.key === detailKey && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">关联加载失败：{detailError.message}</p>}
        {!outline && !outlineError && <p className="p-4 text-sm text-slate-400">正在整理章节导航…</p>}
        {outline?.truncated && <p className="px-1 text-xs text-amber-700">目前仅列出前 200 个已分析章节；其余请从左侧章节目录进入。</p>}
        {outline && !chapters.length && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前范围尚无已分析的传记章节。</div>}
        {!!chapter && <p className="px-1 text-xs text-slate-500">第 {chapter.ordinal} 章 · {chapter.title}</p>}
        {!!chapter && <BiographyChapterFlow key={`${effectiveId}:${refreshKey}`} steps={digest?.flow || []} legacySummary={digest?.summary || chapter.summary} onRead={onRead}/>}
        {!!chapter && <div className="grid items-start gap-3 lg:grid-cols-[minmax(245px,.38fr)_minmax(0,.62fr)]">
            <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">{section === 'life' ? '本章经历索引' : '本章思想索引'}</span><span className="text-[11px] text-slate-400">{total} 项</span></div>
                {section === 'ideas' && <div className="mt-3 flex rounded-lg bg-slate-100 p-1 text-xs"><button onClick={() => {setIdeaTab('ideas'); setPage(1); setSelectedId('');}} className={`flex-1 rounded-md py-1.5 ${ideaTab === 'ideas' ? 'bg-white font-semibold text-orange-700 shadow-sm' : 'text-slate-500'}`}>观点 {result?.ideas.total || 0}</button><button onClick={() => {setIdeaTab('quotes'); setPage(1); setSelectedId('');}} className={`flex-1 rounded-md py-1.5 ${ideaTab === 'quotes' ? 'bg-white font-semibold text-orange-700 shadow-sm' : 'text-slate-500'}`}>原话 {result?.quotes.total || 0}</button></div>}
                <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-3.5 w-3.5 text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选当前页" aria-label="筛选当前页" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none"/></label>
                <div className="mt-3 max-h-[58vh] min-h-0 space-y-1 overflow-y-auto pr-1">{filtered.map((item, index) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left ${selected?.id === item.id ? 'bg-orange-50 text-orange-800' : 'text-slate-600 hover:bg-slate-50'}`}><span className="pt-0.5 font-mono text-[10px] opacity-60">{String((page - 1) * 20 + index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-5">{'name' in item ? item.name : `“${item.text}”`}</span>{'timeLabel' in item && item.timeLabel && <span className="mt-1 block text-[11px] opacity-60">{item.timeLabel}</span>}</span></button>)}</div>
                {loading && <p className="p-3 text-xs text-slate-400">正在加载本章内容…</p>}{!loading && result && !filtered.length && <p className="p-3 text-xs leading-5 text-slate-400">{query ? '当前页没有匹配项。' : '本章尚无可核对的内容。'}</p>}
                {total > 20 && <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs"><button disabled={page === 1} onClick={() => {setSelectedId(''); setPage(value => value - 1);}} className="text-orange-700 disabled:text-slate-300">上一页</button><span className="text-slate-400">{page} / {Math.ceil(total / 20)}</span><button disabled={page * 20 >= total} onClick={() => {setSelectedId(''); setPage(value => value + 1);}} className="text-orange-700 disabled:text-slate-300">下一页</button></div>}
            </section>
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><p className="text-[10px] font-semibold tracking-[.18em] text-orange-600">{quote ? 'VERIFIED QUOTE' : section === 'life' ? 'SELECTED EXPERIENCE' : 'SELECTED VIEW'}</p>
                {node && <><div className="mt-3 flex flex-wrap items-start justify-between gap-2"><h3 className="font-serif text-xl font-semibold leading-7 text-slate-800">{node.name}</h3>{node.timeLabel && <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">{node.timeLabel}</span>}</div><p className="mt-4 text-sm leading-7 text-slate-600">{node.facts[0]?.description || '暂无摘要，请核对原文。'}</p>{node.facts[0]?.evidence && <EvidenceButton evidence={node.facts[0].evidence} onRead={onRead} label="查看这条内容的原文"/>}
                    {section === 'life' && node.facts.slice(1).some(fact => fact.description && fact.description !== node.facts[0]?.description) && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-semibold text-slate-700">更多原文记载</p>{node.facts.slice(1).filter(fact => fact.description && fact.description !== node.facts[0]?.description).map((fact, index) => <div key={`${fact.description}:${index}`} className="mt-3 rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs leading-6 text-slate-600">{fact.description}</p>{fact.evidence && <EvidenceButton evidence={fact.evidence} onRead={onRead} label="核对原文"/>}</div>)}</div>}
                    {section === 'life' ? <BiographyExperienceNotes nodeId={node.id} summary={node.facts[0]?.description} digest={digest} onRead={onRead}/> : <BiographyClaimNotes claim={node} digest={digest} quotes={selectedDetail?.relatedQuotes || []} onRead={onRead}/>}</>}
                {quote && <><blockquote className="mt-4 border-l-2 border-orange-300 bg-orange-50/60 px-4 py-4 font-serif text-lg leading-8 text-slate-700">“{quote.text}”</blockquote><p className="mt-3 text-xs text-slate-500">— {quote.speaker} · {quote.evidence.chapterTitle}</p><EvidenceButton evidence={quote.attributionEvidence} onRead={onRead} label="核对原话与说话人"/>{quoteClaims.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-semibold text-slate-700">这句话表达的观点</p>{quoteClaims.map(claim => <button key={claim.id} type="button" onClick={() => {setIdeaTab('ideas'); setSelectedId(claim.id);}} className="mt-2 block text-left text-xs text-orange-700 hover:underline">{claim.name} →</button>)}</div>}</>}
                {!selected && <p className="mt-6 text-sm text-slate-400">从左侧选取一项，查看详情与原文依据。</p>}
                {!!selected && (links.length > 0 || linkedQuotes.length > 0 || !!quote?.eventName) && <div className="mt-7 border-t border-slate-100 pt-5"><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Link2 className="h-4 w-4 text-orange-500"/>有依据的关联</div>
                    {links.map((link, index) => <div key={`${link.ideaId}:${link.eventId}:${index}`} className="mt-3 rounded-lg border border-slate-200 px-3 py-3 text-xs text-slate-600"><button onClick={() => onRelated(section === 'life' ? link.ideaChapterId || effectiveId : link.eventChapterId || effectiveId, section === 'life' ? 'ideas' : 'life', section === 'life' ? link.ideaId : link.eventId)} className="text-left font-medium hover:text-orange-700">{section === 'life' ? `相关观点 · ${link.ideaName}` : `相关经历 · ${link.eventName}`} →</button><button onClick={() => onRead(link.evidence)} className="ml-3 text-orange-700 hover:underline">核对关联依据</button></div>)}
                    {linkedQuotes.map(item => <button key={item.id} onClick={() => onRead(item.attributionEvidence)} className="mt-3 block w-full rounded-lg border border-slate-200 px-3 py-3 text-left text-xs text-slate-600 hover:border-orange-200">相关原话 · “{item.text}” ↗</button>)}
                    {quote?.eventName && <p className="mt-3 text-xs text-slate-500">原文所涉经历：{quote.eventName}</p>}
                </div>}
            </section>
        </div>}
    </div>;
}

function EvidenceButton({evidence, onRead, label}: {evidence: SourceEvidence; onRead: (source: SourceEvidence) => void; label: string}) {
    return <button onClick={() => onRead(evidence)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>{label} · {evidence.chapterTitle}</button>;
}
