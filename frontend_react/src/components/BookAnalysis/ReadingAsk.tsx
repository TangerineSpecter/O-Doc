import {useEffect, useRef, useState} from 'react';
import {Send, Square} from 'lucide-react';
import {askBook, readingError} from '../../api/bookAnalysis';
import type {SourceEvidence} from '../../types/bookAnalysis';

interface Props {bookId: string; revisionId: string; chapterId: string; nodeId: string; scopeLabel: string; onRead: (source: SourceEvidence) => void}
export default function ReadingAsk({bookId, revisionId, chapterId, nodeId, scopeLabel, onRead}: Props) {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [sources, setSources] = useState<SourceEvidence[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => {controller.current?.abort(); setBusy(false); setAnswer(''); setSources([]); setError(''); return () => controller.current?.abort();}, [bookId, revisionId, chapterId, nodeId]);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!question.trim() || busy) return;
        const pending = new AbortController();
        controller.current?.abort(); controller.current = pending;
        setAnswer(''); setSources([]); setError(''); setBusy(true);
        try {await askBook(bookId, question, chapterId, nodeId, pending.signal, {onAnswer: text => {if (!pending.signal.aborted) setAnswer(current => current + text);}, onSources: values => {if (!pending.signal.aborted) setSources(values);}});}
        catch (err) {if (!pending.signal.aborted) setError(readingError(err));}
        finally {if (controller.current === pending) setBusy(false);}
    };
    return <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-800">问这本书</h3><span className="text-[10px] text-slate-400">范围：{scopeLabel} · 仅依据已分析内容</span></div>
        <form onSubmit={submit} className="mt-3 flex items-end gap-2"><textarea aria-label="图书问题" value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} placeholder="这件事有哪些前置线索？这个概念如何应用？" rows={2} className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-orange-400"/>{busy ? <button type="button" aria-label="停止回答" onClick={() => {controller.current?.abort(); setBusy(false);}} className="rounded-lg border border-slate-200 p-2.5 text-slate-500"><Square className="h-4 w-4"/></button> : <button disabled={!question.trim()} aria-label="发送问题" className="rounded-lg bg-orange-500 p-2.5 text-white disabled:opacity-40"><Send className="h-4 w-4"/></button>}</form>
        {busy && !answer && <p className="mt-3 text-xs text-slate-400">正在寻找原文依据…</p>}{answer && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{answer}</p>}{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        {!!sources.length && <div className="mt-3 flex flex-wrap gap-2">{sources.map(source => <button key={source.sourceId} onClick={() => onRead(source)} title={source.quote} className="rounded-md bg-orange-50 px-2 py-1 text-[11px] text-orange-700">[{source.sourceId}] {source.chapterTitle}</button>)}</div>}
    </section>;
}
