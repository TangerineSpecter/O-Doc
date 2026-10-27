import {ResearchWorkflow} from './workflows/ResearchWorkflow';
import {NativeAudit} from './nativePython/NativeAudit';
import type {ResearchStage} from '../../types/api/quantWorkflow';
import {InitialExperimentPlan} from './experiments/InitialExperimentPlan';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { createRequestKey } from '../../utils/requestKey';
import { quantDate } from '../../utils/quant';
import { Select } from '../common/Select';
import { type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantEntryDetail, QuantSource } from '../../types/api/quant';
import { QuantButton, QuantEmpty, cardClass } from './ui';
import { SourcePreview } from './SourcePreview';
import {ResearchMemory} from './ResearchMemory';
import {useNavigate} from 'react-router-dom';
import {selectedAnalysisSource, sourceAnalysisRuns, staticSourceReports} from '../../utils/quantSourceImpact';
import {SourceImpactPanel} from './sourceImpact/SourceImpactPanel';
import {ExecutionEvidence} from './feedback/evidence/ExecutionEvidence';
import {ExecutionAssessment} from './feedback/evidence/ExecutionAssessment';
import {ReportEditor} from './reports/ReportEditor';
import {ReportComparison} from './reports/ReportComparison';
import {SourceSupplement} from './sources/SourceSupplement';



export function ReportPanel({ entry, collection, controller, register, request, code, initialReportId = '', openFactors, openExperiments }: {
    entry: QuantEntryDetail; collection: string; controller: QuantController; register: QuantRegisterDraft;
    request: (action: () => void) => void; code: () => void;
    initialReportId?: string;
    openFactors: () => void;
    openExperiments: (id?: string) => void;
}) {
    const navigate = useNavigate();
    const sources = (entry.sources || []).filter(row => row.payload.provenance !== 'external_feedback');
    const reports = entry.reports || [];
    const [sourceId, setSourceId] = useState('');
    const [modelId, setModelId] = useState(controller.models.defaultModelId || controller.models.models[0]?.id || '');
    const [selectedId, setSelectedId] = useState(initialReportId);
    const [supplementSource,setSupplementSource]=useState<QuantSource | null>(null);
    const [supplementNotice,setSupplementNotice]=useState('');
    const report = reports.find(row => row.id === selectedId) || reports[0];
    const reportRun = entry.runs.find(row => row.id === report?.runId);
    const source = selectedAnalysisSource(entry, report, sourceId);
    const sourceRuns = sourceAnalysisRuns(entry, source?.id);
    const active = sourceRuns.find(run => ['pending', 'running'].includes(run.status));
    const lastRun = sourceRuns[0];
    const entryActive = entry.runs.find(run => ['pending', 'running'].includes(run.status));
    const otherActive = entry.runs.filter(run => ['pending', 'running'].includes(run.status) && !sourceRuns.some(row => row.id === run.id));
    const reportSource = sources.find(row => row.id === report?.sourceId);
    const staticReports = staticSourceReports(entry);
    const newerCurrentSource = report && staticReports.some(row => row.id === report.id) && reportSource && source && source.id !== reportSource.id && source.materialId === reportSource.materialId && source.id === reportSource.materialCurrentSourceId;
    const sourceReport = staticReports.find(row => row.sourceId === source?.id);
    const analyzeDisabledReason = controller.busy ? '当前操作尚未完成。' : entryActive ? '本条目有任务正在执行，结束后可启动新的完整分析。' : !source ? '请先保存来源资料。' : !modelId ? '请先选择分析模型。' : '';
    const start = () => request(() => { void controller.safe(() => quantApi.run(collection, entry.id, {
        kind: 'analyze', sourceId: source?.id, modelId, requestKey: createRequestKey(),
    })); });
    const resume = (restartStage?: ResearchStage) => {if (lastRun) request(() => {void controller.safe(() => quantApi.run(collection, entry.id, {
        kind: 'analyze', sourceId: lastRun.sourceId, modelId: lastRun.modelId, requirements: lastRun.requirements,
        resumeRunId: lastRun.id, restartStage, requestKey: createRequestKey(),
    }));});};
    const incremental = (baselineRunId: string) => request(() => {void controller.safe(() => quantApi.run(collection, entry.id, {
        kind: 'analyze', sourceId: source?.id, modelId, resumeRunId: baselineRunId,
        requirements: entry.runs.find(row => row.id === baselineRunId)?.requirements || '', requestKey: createRequestKey(),
    }));});
    const settingsOpen=!report||!!active||!!otherActive.length||!!newerCurrentSource||!!supplementNotice
        ||!!(lastRun&&['failed','interrupted','cancelled'].includes(lastRun.status))
        ||!!(report&&report.schemaVersion!==5&&source?.id!==report.sourceId);
    return <div className="space-y-5">
        <details className={cardClass} open={settingsOpen}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">{active?'正在分析 · 查看进度与来源':report?'重新分析、来源与模型':'自动研究与来源设置'}</summary>
            <section className="mt-4 min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">AI 研究报告</h2>
                <p className="mt-1 text-sm text-slate-500">整理原理、参数与评分，提取可复用因子，并提出首轮实验方案。</p></div>
                <div className="flex flex-wrap gap-2"><QuantButton disabled={!source?.payload.code || source.id!==source.materialCurrentSourceId || controller.busy} onClick={()=>request(()=>{if(source)setSupplementSource(source);})}>补充依赖源码</QuantButton><QuantButton primary disabled={!!analyzeDisabledReason} onClick={start}><Sparkles size={15} />{active ? '分析中…' : (report?.schemaVersion === 4 || report?.schemaVersion === 5) ? '分析来源资料' : report ? '重新分析' : '生成研究报告'}</QuantButton></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="min-w-0 space-y-2 text-sm text-slate-600"><span className="block">分析来源</span>
                <Select value={source?.id || ''} onChange={setSourceId} options={sources.map((row, i) => ({ value: row.id, label: `${row.payload.fetchStatus === 'fetched' ? '网页快照' : row.payload.fetchStatus === 'failed' ? '获取失败快照' : row.payload.provenance === 'code_version' ? '代码快照' : '提交资料'} · ${row.payload.title || row.payload.language || '文字'} · ${quantDate(row.createdAt)} · ${i + 1}${row.materialCurrentSourceId === row.id ? ' · 材料当前快照' : ''}` }))} emptyMessage="尚无来源材料" /></label>
                <label className="min-w-0 space-y-2 text-sm text-slate-600"><span className="block">分析模型</span><Select value={modelId} onChange={setModelId} options={controller.models.models.map(row => ({ value: row.id, label: row.name }))} emptyMessage="请先配置对话模型" /></label></div>
            {!source && <div className="mt-4"><QuantButton onClick={code}>添加或保存代码版本</QuantButton></div>}
            {!controller.models.models.length && <p className="mt-3 text-sm text-slate-500">资料已归档。配置对话模型后即可开始分析。</p>}
            {active && <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600"><span role="status">{active.preview || '正在分析材料，可以离开页面，稍后回来查看。'}</span><QuantButton onClick={() => void controller.safe(() => quantApi.cancel(collection, entry.id, active.id))}>取消分析</QuantButton></div>}
            {otherActive.map(run => <div key={run.id} role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600"><p className="min-w-0 flex-1">本条目有{run.kind === 'analyze' ? '其他来源的分析' : '其他研究'}任务正在执行，结束后可启动新的完整分析。<span className="block break-words text-xs text-slate-500">来源：{sources.find(row => row.id === (run.resolvedSourceId || run.sourceId))?.payload.title || run.sourceId || '未指定'} · {run.preview || (run.status === 'pending' ? '等待执行' : '执行中')}</span></p><QuantButton disabled={controller.busy} onClick={() => void controller.safe(() => quantApi.cancel(collection, entry.id, run.id))}>取消该任务</QuantButton></div>)}
            {lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && <p role="status" className="mt-4 text-sm text-orange-700">{lastRun.error || '上次分析已停止'}。已完成的阶段记录会保留。</p>}
            {supplementNotice && <p role="status" className="mt-3 text-sm leading-7 text-slate-600">{supplementNotice}</p>}
            {source && <SourcePreview source={source} />}
            </section>
        </details>
            {newerCurrentSource && <div role="status" className="mt-4 rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800"><p>同一材料已有新的当前快照。下方正在阅读的报告仍绑定旧来源；{sourceReport ? '所选快照已有另一份静态报告。' : '所选快照尚未生成静态报告，可先预览变更再完整分析。'}</p>{sourceReport && <button type="button" className="mt-2 text-xs font-medium underline underline-offset-4" onClick={() => request(() => {setSelectedId(sourceReport.id); setSourceId('');})}>查看所选快照已有报告</button>}</div>}
            {report && report.schemaVersion !== 5 && source?.id !== report.sourceId && <p className="mt-3 text-xs text-slate-500">所选来源用于下一次分析。<button className="ml-1 text-orange-600" onClick={() => setSourceId(report.sourceId)}>查看当前报告使用的来源</button></p>}
        {reports.length > 1 && <label className="block space-y-2 text-sm text-slate-600"><span>阅读报告</span><Select value={report.id} onChange={id => request(() => {setSelectedId(id); setSourceId('');})} options={reports.map(row => ({ value: row.id, label: `${row.data.title || '历史报告'} · ${quantDate(row.createdAt)}` }))} /></label>}
        {report && <ReportEditor key={report.id} report={report} entryId={entry.id} collection={collection} controller={controller} register={register} pin={() => setSelectedId(report.id)} />}
        <SourceImpactPanel entry={entry} collection={collection} source={source} currentReport={report} analyze={start} incremental={incremental} analyzeDisabledReason={analyzeDisabledReason}/>
        {lastRun?.workflow && <ResearchWorkflow key={lastRun.id} run={lastRun} collection={collection} busy={controller.busy || !!entryActive} resume={resume}/>}
        {reportRun?.nativeReviewWorkflow && <div className={cardClass}><NativeAudit key={reportRun.id} collection={collection} entryId={entry.id} runId={reportRun.id} workflow={reportRun.nativeReviewWorkflow}/></div>}
        {report && <ReportComparison key={`comparison-${report.id}`} report={report} reports={staticReports} runs={entry.runs}/>}
        {report?.data.extractionVersion === 1 && <section className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}>
            <div><h3 className="text-sm font-semibold">已自动归档 {report.data.factors?.length || 0} 个研究候选</h3><p className="mt-2 text-sm leading-6 text-slate-500">{report.data.extractionNote}</p></div>
            <QuantButton onClick={() => request(openFactors)}>查看因子候选库</QuantButton>
        </section>}
        {report && <InitialExperimentPlan key={`plan-${report.id}`} report={report} collection={collection} register={register} request={request} openExperiments={openExperiments}/>}
        {report && <ResearchMemory json={report.researchMemoryJson || entry.runs.find(run => run.id === report.runId)?.researchMemoryJson} note={report.data.memoryNote} assessments={report.data.memoryAssessment} openEntry={id => request(() => navigate(`/quant/${encodeURIComponent(collection)}/entries/${encodeURIComponent(id)}`))}/>}
        {report?.schemaVersion === 5 && (report.data.computedExecutionJson || report.data.executionAssessment) && <section id={`quant-report-execution-${report.id}`} className={`${cardClass} space-y-6`}><ExecutionAssessment json={report.data.computedExecutionJson} assessment={report.data.executionAssessment}/><details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">完整执行证据与核算</summary><div className="mt-4"><ExecutionEvidence json={entry.sources?.find(row => row.id === report.sourceId)?.payload.executionPreviewJson}/></div></details></section>}
        {supplementSource && <SourceSupplement key={supplementSource.id} collection={collection} entry={entry.id} source={supplementSource} modelId={modelId} register={register} close={()=>request(()=>setSupplementSource(null))} saved={async result=>{
            await controller.refresh();setSourceId(result.sourceId);setSupplementSource(null);
            setSupplementNotice(result.notice || '依赖源码已保存为新快照；报告与任务状态见下方。');
        }}/>}
        {!report && <QuantEmpty title={active ? '报告正在生成' : '让 AI 完成第一份研究报告'} description="报告会自动保存在这里，你可以阅读、修改和删减，并保留原稿。" />}
    </div>;
}
