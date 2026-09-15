import {useState} from 'react';
import {Loader2, Play, RefreshCw, Square} from 'lucide-react';
import {Select} from '../common/Select';
import {inspectBook, runBookAction, startBookRun} from '../../api/bookAnalysis';
import type {BookAnalysisStatus, ReadingMode} from '../../types/bookAnalysis';
import ExecutionTimeline from './ExecutionTimeline';

interface Props {status: BookAnalysisStatus; busy: boolean; running: boolean; perform: (operation: () => Promise<unknown>) => Promise<void>}
export default function AnalysisControls({status, busy, running, perform}: Props) {
    const [chosenMode, setChosenMode] = useState<ReadingMode | null>(null);
    const mode = chosenMode || status.mode;
    const count = status.inspection.chapterCount || 0;
    const [start, setStart] = useState(1);
    const [end, setEnd] = useState<number | null>(null);
    const [force, setForce] = useState(false);
    const finalEnd = end ?? (count > 100 ? Math.min(start + 19, count) : count);
    const id = status.book.bookId;
    const run = status.run;
    const indexFailed = run?.indexState === 'failed' || run?.kind === 'index' && run.state === 'failed';
    if (!status.canManage) return <p className="text-xs text-slate-500">由图书所有者管理分析与修正。</p>;
    return <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
            <div className="w-36"><Select value={mode} options={[{value: 'story', label: '故事模式'}, {value: 'knowledge', label: '知识模式'}]} onChange={setChosenMode} buttonClassName="!min-h-9 !py-1 text-xs"/></div>
            <button disabled={busy || running} onClick={() => void perform(() => inspectBook(id))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5"/>{status.inspection.supported === undefined ? '检测可用内容' : '重新检测'}</button>
            {status.inspection.supported && <><label className="text-[10px] text-slate-500">开始章<input aria-label="开始章节" type="number" min={1} max={count} value={start} onChange={e => setStart(Number(e.target.value))} className="ml-1 h-9 w-16 rounded-lg border border-slate-200 px-2 text-xs"/></label><label className="text-[10px] text-slate-500">结束章<input aria-label="结束章节" type="number" min={start} max={count} value={finalEnd} onChange={e => setEnd(Number(e.target.value))} className="ml-1 h-9 w-16 rounded-lg border border-slate-200 px-2 text-xs"/></label><button disabled={busy || running || start < 1 || finalEnd < start || finalEnd > count} onClick={() => void perform(() => startBookRun(id, mode, start, finalEnd, force))} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Play className="h-3.5 w-3.5"/>}开始分析</button></>}
            {running && run && <button disabled={busy || run.cancelRequested} onClick={() => void perform(() => runBookAction(id, run.id, 'cancel'))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600"><Square className="h-3 w-3"/>{run.cancelRequested ? '正在停止' : '停止'}</button>}
            {run && ['failed', 'cancelled'].includes(run.state) && <button disabled={busy} onClick={() => void perform(() => runBookAction(id, run.id, 'retry'))} className="h-9 rounded-lg border border-orange-200 px-3 text-xs text-orange-700">断点续跑</button>}
            {status.revisionId && <button title="只重新向量化已有分析范围的原文，不重新调用情节抽取；已保存的向量自动复用。" disabled={busy || running} onClick={() => void perform(() => startBookRun(id, status.mode, 1, count, false, 'index'))} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs disabled:opacity-40 ${indexFailed ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'}`}><RefreshCw className="h-3 w-3"/>{indexFailed ? '重试向量化' : '重建向量检索'}</button>}
        </div>
        {status.inspection.supported && <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><span>{count} 章 · {(status.inspection.charCount || 0).toLocaleString()} 字</span><span>本次处理第 {start}–{finalEnd} 章</span>{count > 100 && <button onClick={() => {setStart(1); setEnd(count);}} disabled={running} className="text-orange-600">选择全部批次</button>}<label className="inline-flex items-center gap-1"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)}/>重新生成选中范围（保留人工修正）</label></div>}
        {status.inspection.supported && <p className="text-[11px] leading-5 text-slate-400">分段抽取优先使用简易模型，未配置时使用主对话模型；章节、整书总结及问答使用主对话模型。</p>}
        {status.revisionId && <p className="text-[11px] leading-5 text-slate-400">向量检索（Embedding）用于问答时按语义查找相关原文，不负责生成关系图。导读和图谱无需向量即可查看；向量不可用时，问答退回关键词和图谱证据检索。</p>}
        {run && <><ExecutionTimeline key={run.id} bookId={id} run={run}/>{indexFailed && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2"><p className="text-xs leading-5 text-amber-700">向量化失败，导读和图谱不受影响。可只重试向量化，不必重新分析，已保存的向量会复用。</p><button disabled={busy || running} onClick={() => void perform(() => startBookRun(id, status.mode, 1, count, false, 'index'))} className="shrink-0 rounded-md bg-white px-2.5 py-1.5 text-xs text-orange-700 disabled:opacity-40">立即重试向量化</button></div>}</>}
    </div>;
}
