import {useCallback, useState} from 'react';
import {MessageSquareQuote, Plus, Sparkles, BookOpenCheck} from 'lucide-react';
import type {QuantEntryDetail} from '../../../types/api/quant';
import {feedbackModes} from '../../../types/api/quantFeedback';
import type {QuantController} from '../../../hooks/useQuant';
import {useQuantFactors} from '../../../hooks/useQuantFactors';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {quantApi} from '../../../api/quant';
import {createRequestKey} from '../../../utils/requestKey';
import {quantDate} from '../../../utils/quant';
import {QuantBadge, QuantButton, QuantEmpty, cardClass} from '../ui';
import {FeedbackImport} from './FeedbackImport';
import {ParameterConfiguration} from './ParameterConfiguration';
import {ResearchMemory} from '../ResearchMemory';
import {useNavigate} from 'react-router-dom';
import {ExecutionEvidence} from './evidence/ExecutionEvidence';
import {ExecutionAssessment} from './evidence/ExecutionAssessment';

export function FeedbackPanel({entry, collection, controller, register, request, openReport}: {
    entry: QuantEntryDetail; collection: string; controller: QuantController; register: QuantRegisterDraft;
    request: (action: () => void) => void; openReport: (id: string) => void;
}) {
    const [creating, setCreating] = useState(false);
    const navigate = useNavigate();
    const [notice, setNotice] = useState('');
    const saved = useCallback((value: string) => {setNotice(value); setCreating(false);}, []);
    const sources = (entry.sources || []).filter(row => row.payload.provenance === 'external_feedback');
    const factors = useQuantFactors(collection, {entryId: entry.id, groupBy: 'none', limit: 100});
    return <div className="space-y-5">
        <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                        <MessageSquareQuote size={18} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">使用反馈与外部报告</h2>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">把实际用过的参数、回测报告和失败情况交给 AI，保留支持与反驳证据，继续积累研究。</p>
                    </div>
                </div>
                <QuantButton primary onClick={() => request(() => setCreating(true))}>
                    <Plus size={15} />
                    收集使用反馈
                </QuantButton>
            </div>
            {notice && <p role="status" className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-700">反馈已保存，分析尚未启动：{notice}</p>}
        </section>
        {!sources.length && <QuantEmpty title="还没有使用反馈" description="粘贴或导入外部报告，由 AI 提取参数和指标、对照原始研究；缺少的信息会明确列出。"/>}
        {sources.map(source => {
            const data = source.payload;
            const runs = entry.runs.filter(row => row.kind === 'feedback_review' && row.sourceId === source.id);
            const run = runs[0];
            const active = runs.find(row => ['pending', 'running'].includes(row.status));
            const report = entry.reports?.find(row => row.sourceId === source.id && row.schemaVersion === 5);
            const target = entry.sources?.find(row => row.id === data.targetSourceId);
            return <article key={source.id} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{data.title}</h3>
                            <QuantBadge tone={report ? 'emerald' : active ? 'orange' : 'slate'}>
                                {feedbackModes[data.mode || 'unknown']}
                            </QuantBadge>
                        </div>
                        <p className="mt-1.5 text-xs leading-6 text-slate-500">{data.platform || '平台未说明'} · {quantDate(source.createdAt)}</p>
                    </div>
                    <QuantButton primary={!report} disabled={controller.busy || !!active} onClick={() => void controller.safe(() => quantApi.run(collection, entry.id, {kind: 'feedback_review', sourceId: source.id, requestKey: createRequestKey()}))}>
                        <Sparkles size={14} />
                        {active ? '分析中…' : report ? '重新分析反馈' : '分析反馈'}
                    </QuantButton>
                </div>
                <p className="mt-3 rounded-xl bg-slate-50/80 px-3.5 py-2 text-xs text-slate-600">关联来源：{target?.payload.title || target?.payload.language || '已保存的来源快照'}{data.factorId ? ` · ${factors.items.find(row => row.id === data.factorId)?.data.name || '已关联具体因子'}` : ''}{data.experimentResultId ? ' · 已关联本机实验' : ''}</p>
                {data.parameterConfiguration && <div className="mt-4"><ParameterConfiguration configuration={data.parameterConfiguration} comparison={data.parameterComparison}/></div>}
                {(report?.data.computedExecutionJson || run?.result.feedback?.computedExecutionJson) && <div className="mt-5"><ExecutionAssessment json={report?.data.computedExecutionJson || run?.result.feedback?.computedExecutionJson} assessment={report?.data.executionAssessment || run?.result.feedback?.executionAssessment}/></div>}
                {data.executionPreviewJson && <details className="mt-5 rounded-xl border border-slate-200 p-4" open={!report}><summary className="cursor-pointer text-sm font-semibold text-slate-700">完整执行证据与核算</summary><div className="mt-4"><ExecutionEvidence json={data.executionPreviewJson}/></div></details>}
                {run?.feedbackMemory && <details className="mt-3 text-xs leading-6 text-slate-500"><summary className="cursor-pointer">最近分析依据 · {run.feedbackMemory.candidateIds.length} 个自动候选 · {run.feedbackMemory.historyIds.length} 份历史反馈</summary>
                    <p className="mt-2">候选与历史记录在分析发起时固定。同来源历史只作对照，重复反馈不作为独立验证。</p>
                    {run.feedbackMemory.candidateIds.map(id => <p key={id}>候选：{factors.items.find(row => row.id === id)?.data.name || '已保存的候选'}</p>)}
                    {run.feedbackMemory.historyIds.map(id => <details key={id} className="mt-2"><summary className="cursor-pointer">历史：{entry.sources?.find(row => row.id === id)?.payload.title || '已保存的反馈'}</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words scrollbar-hide">{entry.sources?.find(row => row.id === id)?.payload.document}</pre></details>)}
                </details>}
                {run?.researchMemoryJson && <div className="mt-4"><ResearchMemory json={run.researchMemoryJson} note={run.result.feedback?.memoryNote} assessments={run.result.feedback?.memoryAssessment} openEntry={id => request(() => navigate(`/quant/${encodeURIComponent(collection)}/entries/${encodeURIComponent(id)}`))}/></div>}
                {active && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-orange-50/70 p-3 text-sm text-orange-800"><p role="status">{active.preview || '正在分析，可以离开页面稍后查看。'}</p><QuantButton size="sm" onClick={() => void controller.safe(() => quantApi.cancel(collection, entry.id, active.id))}>取消分析</QuantButton></div>}
                {run && ['failed', 'interrupted', 'cancelled'].includes(run.status) && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-orange-700">{run.error || '上次分析已停止'}；原始反馈仍保留。</p>}
                {report && <div className="mt-4 space-y-3 rounded-xl border border-orange-200/70 bg-orange-50/30 p-4"><p className="text-sm leading-7 text-slate-700">{report.data.summary}</p><p className="text-xs text-slate-500">外部声明尚未独立验证，AI 提取仍需核对。</p><QuantButton onClick={() => request(() => openReport(report.id))}><BookOpenCheck size={14} className="text-orange-500" />阅读报告与修订</QuantButton></div>}
                <details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-orange-600">查看保存的原始反馈</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-xs leading-6 scrollbar-hide">{data.document}</pre>{data.notes && <p className="mt-3 whitespace-pre-wrap text-sm">补充说明：{data.notes}</p>}
                    <p className="mt-3 break-all text-xs leading-6 text-slate-500">来源快照：{data.targetSourceId}{data.factorId ? `；因子记录：${data.factorId}` : ''}{data.experimentResultId ? `；实验结果：${data.experimentResultId}` : ''}</p>
                </details>
            </article>;
        })}
        {creating && <FeedbackImport entry={entry} collection={collection} controller={controller} register={register} close={() => request(() => setCreating(false))} saved={saved}/>}
    </div>;
}
