import {useState} from 'react';
import {changeChapterBoundary, readingError} from '../../api/bookAnalysis';
import type {ChapterGuide} from '../../types/bookAnalysis';

export default function ChapterBoundary({bookId, chapter, disabled, onSaved}: {bookId: string; chapter: ChapterGuide; disabled: boolean; onSaved: () => void}) {
    const [title, setTitle] = useState(chapter.title);
    const [offset, setOffset] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async (action: 'rename' | 'split' | 'merge') => {
        setBusy(true); setError('');
        try {await changeChapterBoundary(bookId, chapter.id, action, title, offset); onSaved();}
        catch (err) {setError(readingError(err));}
        finally {setBusy(false);}
    };
    return <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-xs text-slate-500">修正章节标题与边界</summary><div className="mt-3 space-y-3"><p className="text-[11px] text-slate-400">拆分或合并会改变分析范围，需要重新分析；人工图谱修正仍保留。</p><input aria-label="章节标题" value={title} maxLength={255} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm"/><div className="flex flex-wrap gap-2"><button disabled={disabled || busy || !title.trim()} onClick={() => void save('rename')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">保存标题</button><button disabled={disabled || busy} onClick={() => void save('merge')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">与下一章合并</button></div><label className="block text-xs text-slate-500">在第几字处拆分（本章共 {chapter.charCount.toLocaleString()} 字）<input aria-label="章节拆分位置" type="number" min={1} max={chapter.charCount - 1} value={offset} onChange={e => setOffset(Number(e.target.value))} className="ml-2 w-24 rounded-lg border border-slate-200 p-2"/></label><button disabled={disabled || busy || offset <= 0 || offset >= chapter.charCount} onClick={() => void save('split')} className="rounded-lg border border-orange-200 px-3 py-2 text-xs text-orange-700 disabled:opacity-40">拆分正文</button><pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-500">{chapter.sourcePreview || '原文尚未恢复，请先从书架恢复正文。'}</pre><p className="text-[10px] text-slate-400">预览最多显示前 5000 字。</p>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div></details>;
}
