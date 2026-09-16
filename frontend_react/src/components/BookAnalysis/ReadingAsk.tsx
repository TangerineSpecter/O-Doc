import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Send, Square} from 'lucide-react';
import {askBook, readingError} from '../../api/bookAnalysis';
import type {SourceEvidence} from '../../types/bookAnalysis';
import ReadingAnswer from './ReadingAnswer';
import {usePacedAnswer} from './usePacedAnswer';

interface Props {throughChapter?: number; bookId: string; revisionId: string; chapterId: string; nodeId: string; scopeLabel: string; onRead: (source: SourceEvidence) => void}
export default function ReadingAsk({bookId, revisionId, chapterId, nodeId, scopeLabel, throughChapter, onRead}: Props) {
    const [question, setQuestion] = useState('');
    const {answer, busy, start, append, finish, stop, reset} = usePacedAnswer();
    const [sources, setSources] = useState<SourceEvidence[]>([]);
    const [answerVersion, setAnswerVersion] = useState(0);
    const [error, setError] = useState('');
    const controller = useRef<AbortController | null>(null);
    const answerEnd = useRef<HTMLDivElement>(null);
    const followAnswer = useRef(true);
    useEffect(() => {
        controller.current?.abort(); controller.current = null; reset(); setSources([]); setError(''); setAnswerVersion(value => value + 1);
        return () => {controller.current?.abort(); controller.current = null;};
    }, [bookId, revisionId, chapterId, nodeId, throughChapter, reset]);
    useEffect(() => {
        const updateFollow = () => {
            const scroller = document.scrollingElement;
            if (scroller) followAnswer.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
        };
        window.addEventListener('scroll', updateFollow, {passive: true});
        return () => window.removeEventListener('scroll', updateFollow);
    }, []);
    useLayoutEffect(() => {if (answer && followAnswer.current) answerEnd.current?.scrollIntoView({block: 'end'});}, [answer]);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!question.trim() || busy) return;
        const pending = new AbortController();
        controller.current?.abort(); controller.current = pending;
        followAnswer.current = true; start(); setSources([]); setError(''); setAnswerVersion(value => value + 1);
        try {await askBook(bookId, question, chapterId, nodeId, pending.signal, {onAnswer: text => {if (!pending.signal.aborted) append(text);}, onSources: values => {if (!pending.signal.aborted) setSources(values);}}, revisionId, throughChapter);}
        catch (err) {if (!pending.signal.aborted) {stop(); setError(readingError(err));}}
        finally {if (controller.current === pending) {controller.current = null; finish();}}
    };
    return <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-800">问这本书</h3><span className="text-[10px] text-slate-400">范围：{scopeLabel} · 仅依据已分析内容</span></div>
        <form onSubmit={submit} className="mt-3 flex items-end gap-2"><textarea aria-label="图书问题" value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} onKeyDown={event => {
            if (event.key !== 'Enter' || !event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault();
            if (!busy && question.trim()) event.currentTarget.form?.requestSubmit();
        }} placeholder="这件事有哪些前置线索？这个概念如何应用？" rows={2} className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-orange-400"/>{busy ? <button type="button" aria-label="停止回答" onClick={() => {controller.current?.abort(); controller.current = null; stop();}} className="rounded-lg border border-slate-200 p-2.5 text-slate-500"><Square className="h-4 w-4"/></button> : <button disabled={!question.trim()} aria-label="发送问题" className="rounded-lg bg-orange-500 p-2.5 text-white disabled:opacity-40"><Send className="h-4 w-4"/></button>}</form>
        <p className="mt-1.5 text-[10px] text-slate-400">Shift + Enter 发送 · Enter 换行</p>
        {busy && !answer && <p className="mt-3 text-xs text-slate-400">正在寻找原文依据…</p>}<ReadingAnswer key={answerVersion} answer={answer} sources={sources} onRead={onRead}/>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<div ref={answerEnd}/>
    </section>;
}
