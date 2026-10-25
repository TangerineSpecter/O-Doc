import {LibraryResearchContext} from './LibraryResearchContext';
import {ExperimentProposalCard} from './ExperimentProposalCard';
import {useState} from 'react';
import {Sparkles} from 'lucide-react';
import {quantApi} from '../../../api/quant';
import type {QuantExperiment, QuantExperimentProposal} from '../../../types/api/quantExperiment';
import {createRequestKey} from '../../../utils/requestKey';
import {QuantButton} from '../ui';
import {ReportMarkdown} from '../ReportMarkdown';
import {ResearchMemory} from '../ResearchMemory';
export function ExperimentReviewPanel({collection, experiment, reload, openReport, prepareProposal, startCampaign, openFactor}: {openFactor: (id: string, name: string) => void; startCampaign: (proposal: QuantExperimentProposal) => void; prepareProposal: (proposal: QuantExperimentProposal) => void;collection: string; experiment: QuantExperiment; reload: () => void; openReport: (entryId: string, reportId: string) => void}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [key, setKey] = useState(createRequestKey);
    const latest = experiment.reviews?.[0], active = experiment.reviews?.find(row => ['pending', 'running'].includes(row.run.status));
    const completed = experiment.reviews?.find(row => row.report);
    const report = completed?.report, proposal = completed?.proposal;
    const context = experiment.reviewContext;
    const start = async () => {
        if (!context || busy) return;
        setBusy(true); setError('');
        try {
            await quantApi.run(collection, context.entryId, {kind: 'experiment_review', sourceId: context.sourceId,
                experimentResultId: context.experimentResultId, requestKey: key});
            setKey(createRequestKey()); reload();
        } catch (cause) {setError(cause instanceof Error ? cause.message : '解读提交失败');}
        finally {setBusy(false);}
    };
    const cancel = async () => {
        if (!active || busy) return;
        setBusy(true); setError('');
        try {await quantApi.cancel(collection, active.run.entryId, active.run.id); reload();}
        catch (cause) {setError(cause instanceof Error ? cause.message : '取消解读失败');}
        finally {setBusy(false);}
    };
    return <section className="space-y-4 rounded-xl border border-orange-100 bg-orange-50/30 p-4" aria-label="AI 实验解读">
        <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16}/>AI 实验解读</h4>
            {active ? <QuantButton disabled={busy} onClick={() => void cancel()}>取消解读</QuantButton> : <QuantButton disabled={busy || !context} onClick={() => void start()}>{report ? '重新解读' : '生成实验解读'}</QuantButton>}</div>
        <p className="text-xs leading-6 text-slate-500">实验结束后使用默认对话模型分析参数、表现与失败原因。检索其他来源的可组合因子，一并提供本次参数和结果摘要，不发送完整行情。报告可编辑，下一轮假设仍需新数据验证。</p>
        {active && <p role="status" className="text-sm text-orange-700">{active.run.preview || '正在生成解读…'}</p>}
        {latest && ['cancelled', 'failed', 'interrupted'].includes(latest.run.status) && <p role="status" className="text-xs leading-6 text-slate-500">上次解读{latest.run.status === 'cancelled' ? '已取消' : latest.run.status === 'failed' ? '失败' : '已中断'}，之前保存的报告仍保留。</p>}
        {(error || latest?.run.error) && <p role="alert" className="text-sm text-red-600">{error || latest?.run.error}</p>}
        {!latest && <p className="text-xs leading-6 text-slate-500">尚无解读。默认模型未配置或任务繁忙时，计算结果仍保留，可稍后生成。</p>}
        {report && <>{report.currentRevisionId && <p className="text-xs text-slate-500">正文已有人工修订；摘要和评分保留 AI 原稿。</p>}<p className="text-sm leading-7 text-slate-700">{report.data.summary}</p><p className="text-xs text-slate-500">实验研究评价：{report.data.totalScore === null || report.data.totalScore === undefined ? '证据不足，暂无总分' : `${report.data.totalScore} / 100`}，不代表实盘盈利能力。</p>
            <details><summary className="cursor-pointer text-sm text-orange-700">阅读报告、参数结论与下一轮假设</summary><div className="mt-4"><ReportMarkdown text={report.markdown}/></div></details>
            {context && <QuantButton onClick={() => openReport(context.entryId, report.id)}>打开报告与修订历史</QuantButton>}</>}
        {report?.data.format === 'experiment_review' && report.data.planningNote && <p className="text-xs leading-6 text-slate-600">方案判断：{report.data.planningNote}</p>}
        <LibraryResearchContext value={(completed?.run || latest?.run)?.libraryRetrieval} openFactor={openFactor}/>
        <ResearchMemory json={(completed?.run || latest?.run)?.researchMemoryJson} note={report?.data.memoryNote} assessments={report?.data.memoryAssessment} openEntry={id => openReport(id, '')}/>
        {proposal && <ExperimentProposalCard proposal={proposal} prepare={prepareProposal} startCampaign={startCampaign}/>}
    </section>;
}
