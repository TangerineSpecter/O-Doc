import {useQuantDocument} from '../../hooks/useQuantDocument';
import type {QuantWorkspace} from '../../types/api/quantReading';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    Cpu,
    FileCode2,
    Compass,
    Settings2,
} from 'lucide-react';
import { ResearchWorkflow } from './workflows/ResearchWorkflow';
import type { ResearchStage } from '../../types/api/quantWorkflow';
import { quantApi } from '../../api/quant';
import { createRequestKey } from '../../utils/requestKey';
import { quantDate } from '../../utils/quant';
import { type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantSource } from '../../types/api/quant';
import { QuantEmpty, QuantModal, cardClass } from './ui';
import { ReportAnalysisSettings } from './reports/ReportAnalysisSettings';
import { sourceAnalysisRuns } from '../../utils/quantSourceImpact';
import {ReportExecutionEvidence} from './reports/ReportExecutionEvidence';
import { ExecutionAssessment } from './feedback/evidence/ExecutionAssessment';
import { ReportEditor } from './reports/ReportEditor';
import { ReportUpdates } from './reports/ReportUpdates';
import { SourceSupplement } from './sources/SourceSupplement';
import { ResearchDetails, type ResearchDetailsTab } from './ResearchDetails';
import { ReportSkeleton } from './QuantWorkbenchSkeleton';

export function ReportPanel({
    entry,
    collection,
    controller,
    register,
    request,
    code,
    initialReportId = '',
    openFactors,
    openExperiments,
    selectedModelId,
    onModelChange,
}: {
    entry: QuantWorkspace;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    request: (action: () => void) => void;
    code: () => void;
    initialReportId?: string;
    openFactors: () => void;
    openExperiments: (id?: string) => void;
    selectedModelId: string;
    onModelChange: (id: string) => void;
}) {
    const reports = entry.reports;
    const headers = entry.reportHeaders;
    const [sourceId, setSourceId] = useState('');
    const modelId = controller.models.models.some((row) => row.id === selectedModelId)
        ? selectedModelId
        : controller.models.defaultModelId || controller.models.models[0]?.id || '';
    const [selectedId, setSelectedId] = useState(initialReportId);
    const [supplementSource, setSupplementSource] = useState<QuantSource | null>(null);
    const [supplementNotice, setSupplementNotice] = useState('');
    const [initialInspectorTab, setInitialInspectorTab] = useState<ResearchDetailsTab>('all');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const documentState=useQuantDocument(collection,entry.id,`${entry.updatedAt}:${entry.reportHeaders.map(row=>row.id+row.currentRevisionId).join(',')}`,controller.refresh);
    const targetId=selectedId||documentState.document?.report?.id||entry.defaultReportId||'';
    const report=(!selectedId?documentState.document?.report:null)||reports.find(row=>row.id===targetId);
    const ensureReport=controller.ensureReport;
    const setReadError=controller.setReadingError;
    useEffect(()=>{
        if(!targetId||report)return;
        const abort=new AbortController();
        void ensureReport(targetId,abort.signal).catch(cause=>{if(!abort.signal.aborted)setReadError(cause instanceof Error?cause.message:'报告读取失败');});
        return()=>abort.abort();
    },[targetId,report,ensureReport,setReadError]);

    const reportRun = entry.runs.find((row) => row.id === report?.runId);
    const sourceMeta=entry.sourceHeaders.find(row=>row.id===report?.sourceId);
    const targetSourceId=sourceId||sourceMeta?.materialCurrentSourceId||report?.sourceId||entry.sourceHeaders.find(row=>row.provenance!=='external_feedback')?.id;
    const source=entry.sources.find(row=>row.id===targetSourceId);
    const ensureSource=controller.ensureSource;
    useEffect(()=>{
        if(!settingsOpen||!targetSourceId)return;
        const abort=new AbortController();
        void ensureSource(targetSourceId,abort.signal).catch(error=>{if(!abort.signal.aborted)setReadError(error instanceof Error?error.message:'来源读取失败');});
        return()=>abort.abort();
    },[settingsOpen,targetSourceId,ensureSource,setReadError]);
    const sourceRuns = sourceAnalysisRuns(entry, targetSourceId);
    const active = sourceRuns.find((run) => ['pending', 'running'].includes(run.status));
    const lastRun = sourceRuns[0];
    const ensureRun=controller.ensureRun;
    const latestRunId=lastRun?.id;
    const workflowLoaded=!!lastRun?.workflow;
    useEffect(()=>{
        if(!detailsOpen||!latestRunId||workflowLoaded)return;
        const abort=new AbortController();
        void ensureRun(latestRunId,abort.signal).catch(error=>{if(!abort.signal.aborted)setReadError(error instanceof Error?error.message:'研究进度读取失败');});
        return()=>abort.abort();
    },[detailsOpen,latestRunId,workflowLoaded,ensureRun,setReadError]);

    const entryActive = entry.runs.find((run) => ['pending', 'running'].includes(run.status));
    const otherActive = entry.runs.filter(
        (run) => ['pending', 'running'].includes(run.status) && !sourceRuns.some((row) => row.id === run.id),
    );
    const staticReports = headers.filter(row=>[1,2,3].includes(row.schemaVersion));
    const newerCurrentSource=!!(report&&staticReports.some(row=>row.id===report.id)&&sourceMeta?.materialCurrentSourceId&&
        targetSourceId===sourceMeta.materialCurrentSourceId&&targetSourceId!==report.sourceId);
    const sourceReport=staticReports.find(row=>row.sourceId===targetSourceId);
    const analyzeDisabledReason = controller.busy
        ? '当前操作尚未完成。'
        : entryActive
          ? '本条目有任务正在执行，结束后可启动新的完整分析。'
          : !targetSourceId
            ? '请先保存来源资料。'
            : !modelId
              ? '请先选择分析模型。'
              : '';
    const start = () =>
        request(() => {
            void controller.safe(() =>
                quantApi.run(collection, entry.id, {
                    kind: 'analyze',
                    sourceId: targetSourceId,
                    modelId,
                    requestKey: createRequestKey(),
                }),
            );
        });
    const resume = (restartStage?: ResearchStage) => {
        if(lastRun)request(()=>void controller.safe(async()=>{
            setSelectedId(''); controller.pinReportId('');
            const original=await controller.ensureRun(lastRun.id);
            await quantApi.run(collection,entry.id,{kind:'analyze',sourceId:original.sourceId,
                modelId:original.modelId,requirements:original.requirements,resumeRunId:original.id,
                restartStage,requestKey:createRequestKey()});
        }));
    };
    const incremental = (baselineRunId: string) => request(()=>void controller.safe(async()=>{
        const original=await controller.ensureRun(baselineRunId);
        await quantApi.run(collection,entry.id,{kind:'analyze',sourceId:targetSourceId,
            modelId,resumeRunId:baselineRunId,requirements:original.requirements||'',requestKey:createRequestKey()});
    }));
    const revealPlan = useCallback(() => request(() => {
        setInitialInspectorTab('experiment');
        setDetailsOpen(true);
    }), [request, setInitialInspectorTab, setDetailsOpen]);
    const pinReportId=controller.pinReportId;
    const pinReport=useCallback((id:string)=>{const pinned=id===documentState.document?.report?.id?'':id;pinReportId(pinned);setSelectedId(pinned);},[pinReportId,documentState.document?.report?.id]);
    const guardedOpenFactors = useCallback(() => request(openFactors), [request, openFactors]);
    return (
        <div className="space-y-3">
            {/* 报告切换与研究操作 */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 shadow-2xs">
                <ReportUpdates entry={entry} targetId={targetId} state={documentState} collection={collection} request={request}
                    select={id => {const pinned = id === entry.defaultReportId ? '' : id; setSelectedId(pinned); controller.pinReportId(pinned); setSourceId('');}}/>

                <div className="hidden min-w-0 items-center gap-1.5 text-[11px] text-slate-600 2xl:flex">
                    {source && <span className="inline-flex max-w-40 items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                        <FileCode2 size={11} className="shrink-0 text-orange-500" />
                        <span className="truncate">{source.payload.title || source.payload.language || '当前快照'} · {quantDate(source.createdAt)}</span>
                    </span>}
                    <span className="inline-flex max-w-32 items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                        <Cpu size={11} className="shrink-0 text-slate-400" />
                        <span className="truncate">{controller.models.models.find(row => row.id === modelId)?.name || '未配置模型'}</span>
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setSettingsOpen(true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white">
                        {active ? <Activity size={12} className="animate-pulse text-orange-500" /> : <Settings2 size={12} />}
                        <span>{active ? '正在分析' : report ? '重新分析、来源与模型' : '来源与分析设置'}</span>
                    </button>
                    {report && (
                        <button type="button" onClick={() => request(() => { setInitialInspectorTab('all'); setDetailsOpen(true); })}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white">
                            <Compass size={12} />查看研究详情
                        </button>
                    )}
                </div>
            </div>

            {settingsOpen && createPortal(
                <QuantModal title="来源与分析设置" wide close={() => setSettingsOpen(false)}>
                    <ReportAnalysisSettings source={source} report={report} lastRun={lastRun}
                        active={active} otherActive={otherActive} controller={controller} collection={collection} entryId={entry.id}
                        modelId={modelId} onModelChange={onModelChange} setSourceId={setSourceId} start={start} code={code}
                        request={request} openSupplement={value => { setSettingsOpen(false); setSupplementSource(value); }}
                        analyzeDisabledReason={analyzeDisabledReason} supplementNotice={supplementNotice} />
                </QuantModal>, document.body,
            )}
            {!settingsOpen && active && !active.workflow && (
                <p role="status" className="rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5 text-xs text-orange-800">
                    {active.preview || '正在分析材料，可以离开页面，稍后回来查看。'}
                </p>
            )}
            {!settingsOpen && lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && (
                <p role="status" className="rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5 text-xs text-orange-800">
                    {lastRun.error || '上次分析已停止'}。已完成的阶段记录会保留。
                </p>
            )}
            {!settingsOpen && !active && otherActive.length > 0 && (
                <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    本条目有其他研究任务正在执行，可在来源与分析设置中查看。
                </p>
            )}
            {!settingsOpen && supplementNotice && (
                <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">{supplementNotice}</p>
            )}

            {newerCurrentSource && (
                <div
                    role="status"
                    className="rounded-xl border border-orange-200 bg-orange-50/80 p-3.5 text-xs leading-6 text-orange-900 shadow-2xs"
                >
                    <p>
                        同一材料已有新的当前快照。下方正在阅读的报告仍绑定旧来源；
                        {sourceReport
                            ? '所选快照已有另一份静态报告。'
                            : '可先预览变更，或在来源与分析设置中查看对应研究。'}
                    </p>
                    {sourceReport && (
                        <button
                            type="button"
                            className="mt-1.5 text-xs font-semibold text-orange-700 underline underline-offset-4"
                            onClick={() =>
                                request(() => {
                                    setSelectedId(sourceReport.id);controller.pinReportId(sourceReport.id);
                                    setSourceId('');
                                })
                            }
                        >
                            查看所选快照已有报告
                        </button>
                    )}
                </div>
            )}

            {report && report.schemaVersion !== 5 && source && source.id !== report.sourceId && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-500">
                    <span>所选来源用于下一次分析。</span>
                    <button
                        type="button"
                        className="font-semibold text-orange-600 hover:underline"
                        onClick={() => setSourceId(report.sourceId)}
                    >
                        查看当前报告使用的来源
                    </button>
                </div>
            )}

            {report && active?.workflow && !detailsOpen && (
                <ResearchWorkflow key={active.id} run={active} collection={collection}
                    busy={controller.busy || !!entryActive} resume={resume} />
            )}
            <div>
                <div className="min-w-0 space-y-4">
                    {report ? (
                        <ReportEditor
                            key={report.id}
                            report={report}
                            entryId={entry.id}
                            collection={collection}
                            controller={controller}
                            register={register}
                            pin={pinReport}
                            openFactors={guardedOpenFactors}
                            reportTwoColumn={true}
                            revealPlan={revealPlan}
                        />
                    ) : targetId ? (
                        <ReportSkeleton
                            entrySummary={{
                                id: entry.id,
                                title: entry.title,
                                kind: entry.kind,
                                createdAt: entry.createdAt,
                                updatedAt: entry.updatedAt,
                                preview: '',
                                researchScore: entry.researchScore,
                            }}
                        />
                    ) : (
                        <QuantEmpty
                            title={active ? '报告正在生成' : '让 AI 完成第一份研究报告'}
                            description="报告会自动保存在这里，你可以阅读、修改和删减，并保留原稿。"
                        />
                    )}

                    {/* 外部反馈完整执行证据与核算 */}
                    {report?.schemaVersion === 5 &&
                        (report.data.computedExecutionJson || report.data.executionAssessment) && (
                            <section
                                id={`quant-report-execution-${report.id}`}
                                className={`${cardClass} scroll-mt-24 space-y-6`}
                            >
                                <ExecutionAssessment
                                    json={report.data.computedExecutionJson}
                                    assessment={report.data.executionAssessment}
                                />
                                <ReportExecutionEvidence key={report.id} sourceId={report.sourceId} ensureSource={ensureSource}/>
                            </section>
                        )}
                </div>

            </div>

            {!report && <ResearchDetails controller={controller} entry={entry} report={report} source={source} collection={collection} register={register}
                    request={request} openFactors={openFactors} openExperiments={openExperiments} initialTab={initialInspectorTab} lastRun={lastRun} reportRun={reportRun}
                    entryActive={entryActive} controllerBusy={controller.busy} start={start} incremental={incremental}
                    analyzeDisabledReason={analyzeDisabledReason} resume={resume} inModal={false}/> }
            {report && detailsOpen && createPortal(
                <QuantModal title="研究详情" subtitle="查看实验规划、来源对照和研究进度" wide fixedHeight close={() => request(() => setDetailsOpen(false))}>
                    <ResearchDetails controller={controller} entry={entry} report={report} source={source} collection={collection} register={register}
                    request={request} openFactors={openFactors} openExperiments={openExperiments} initialTab={initialInspectorTab} lastRun={lastRun} reportRun={reportRun}
                    entryActive={entryActive} controllerBusy={controller.busy} start={start} incremental={incremental}
                    analyzeDisabledReason={analyzeDisabledReason} resume={resume} inModal />
                </QuantModal>, document.body,
            )}

            {supplementSource && (
                <SourceSupplement
                    key={supplementSource.id}
                    collection={collection}
                    entry={entry.id}
                    source={supplementSource}
                    modelId={modelId}
                    register={register}
                    close={() => request(() => { setSupplementSource(null); setSettingsOpen(true); })}
                    saved={async (result) => {
                        await controller.refresh();
                        setSourceId(result.sourceId);
                        setSupplementSource(null);
                        setSettingsOpen(true);
                        setSupplementNotice(
                            result.notice || '依赖源码已保存为新快照；报告与任务状态见下方。',
                        );
                    }}
                />
            )}
        </div>
    );
}
