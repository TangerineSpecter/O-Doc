import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {SourceEvidence} from '../../types/bookAnalysis';
import {linkBookCitations} from '../../utils/readingAnswer';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface Props {answer: string; sources: SourceEvidence[]; onRead: (source: SourceEvidence) => void}

export default function ReadingAnswer({answer, sources, onRead}: Props) {
    const [selectedId, setSelectedId] = useState('');
    useEscapeDismissal(Boolean(selectedId), () => setSelectedId(''));
    const closeRef = useRef<HTMLButtonElement>(null);
    const sourceMap = useMemo(() => new Map(sources.filter(source => source.sourceId).map(source => [source.sourceId!, source])), [sources]);
    const markdown = useMemo(() => linkBookCitations(answer, [...sourceMap.keys()]), [answer, sourceMap]);
    const selected = sourceMap.get(selectedId);
    useEffect(() => {
        if (!selected) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus();
        return () => {previousFocus?.focus();};
    }, [selected]);

    return <>
        {!!answer && <div className="mt-4 min-w-0 break-words text-sm leading-7 text-slate-600">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                h1: ({children}) => <h3 className="mb-2 mt-5 text-lg font-bold text-slate-800 first:mt-0">{children}</h3>,
                h2: ({children}) => <h3 className="mb-2 mt-5 text-base font-bold text-slate-800 first:mt-0">{children}</h3>,
                h3: ({children}) => <h4 className="mb-2 mt-4 font-semibold text-slate-800 first:mt-0">{children}</h4>,
                p: ({children}) => <p className="mb-3 last:mb-0">{children}</p>,
                ul: ({children}) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({children}) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
                blockquote: ({children}) => <blockquote className="mb-3 border-l-2 border-orange-200 pl-3 text-slate-500">{children}</blockquote>,
                table: ({children}) => <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-xs">{children}</table></div>,
                thead: ({children}) => <thead className="bg-slate-50 text-slate-700">{children}</thead>,
                th: ({children}) => <th className="border-b border-slate-200 px-3 py-2 font-semibold">{children}</th>,
                td: ({children}) => <td className="border-b border-slate-100 px-3 py-2 align-top">{children}</td>,
                pre: ({children}) => <pre className="mb-3 max-w-full overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100">{children}</pre>,
                code: ({className, children}) => <code className={className ? 'font-mono text-xs' : 'rounded bg-slate-100 px-1 py-0.5 font-mono text-xs'}>{children}</code>,
                a: ({href, children}) => {
                    const sourceId = href?.match(/^#source-(S\d+)$/)?.[1];
                    const source = sourceId ? sourceMap.get(sourceId) : undefined;
                    if (source) return <button type="button" aria-label={`查看来源 ${sourceId}`} aria-expanded={selectedId === sourceId} onClick={() => setSelectedId(sourceId!)} className="mx-0.5 inline rounded bg-orange-50 px-1 text-xs font-medium text-orange-700 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">{children}</button>;
                    if (href && /^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-700 underline">{children}</a>;
                    return <span>{children}</span>;
                },
            }}>{markdown}</ReactMarkdown>
        </div>}
        {!!sources.length && <div className="mt-3 flex flex-wrap gap-2" aria-label="回答来源">{sources.map(source => <button key={source.sourceId} type="button" onClick={() => setSelectedId(source.sourceId || '')} aria-expanded={selectedId === source.sourceId} className="rounded-md bg-orange-50 px-2 py-1 text-[11px] text-orange-700 hover:bg-orange-100">[{source.sourceId}] {source.chapterTitle}</button>)}</div>}
        {selected && createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={event => {if (event.target === event.currentTarget) setSelectedId('');}}>
            <section role="dialog" aria-modal="true" aria-label={`来源 ${selectedId} 证据`} className="w-full max-w-lg min-w-0 rounded-xl border border-orange-200 bg-white p-4 text-sm text-slate-600 shadow-xl">
                <div className="flex items-start justify-between gap-2"><h4 className="font-semibold text-slate-800">[{selectedId}] {selected.chapterTitle}</h4><button ref={closeRef} type="button" onClick={() => setSelectedId('')} aria-label="关闭来源卡片" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4"/></button></div>
                <blockquote className="mt-3 max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-orange-200 pl-3 text-sm leading-6">{selected.quote}</blockquote>
                <button type="button" onClick={() => {setSelectedId(''); onRead(selected);}} className="mt-4 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600">查看原文</button>
            </section>
        </div>, document.body)}
    </>;
}
