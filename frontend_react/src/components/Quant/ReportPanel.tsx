import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    Cpu,
    FileCode2,
    Compass,
    FileSpreadsheet,
    Settings2,
} from 'lucide-react';
import { ResearchWorkflow } from './workflows/ResearchWorkflow';
import type { ResearchStage } from '../../types/api/quantWorkflow';
import { quantApi } from '../../api/quant';
import { createRequestKey } from '../../utils/requestKey';
import { quantDate } from '../../utils/quant';
import { Select } from '../common/Select';
import { type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantEntryDetail, QuantReport, QuantSource } from '../../types/api/quant';
import { QuantEmpty, QuantModal, cardClass } from './ui';
import { ReportAnalysisSettings } from './reports/ReportAnalysisSettings';
import { defaultResearchReport } from '../../utils/quantReportScore';
import { selectedAnalysisSource, sourceAnalysisRuns, staticSourceReports } from '../../utils/quantSourceImpact';
import { ExecutionEvidence } from './feedback/evidence/ExecutionEvidence';
import { ExecutionAssessment } from './feedback/evidence/ExecutionAssessment';
import { ReportEditor } from './reports/ReportEditor';
import { SourceSupplement } from './sources/SourceSupplement';
import { ResearchDetails, type ResearchDetailsTab } from './ResearchDetails';

function reportTypeMeta(row: QuantReport) {
    if (row.schemaVersion === 5) {
        return row.data.nativeReview
            ? { label: 'Python 对照', tone: 'blue' as const }
            : { label: '反馈解读', tone: 'amber' as const };
    }
    if (row.schemaVersion === 4) {
        return { label: '实验复盘', tone: 'emerald' as const };
    }
    return { label: '静态研究', tone: 'orange' as const };
}

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
    entry: QuantEntryDetail;
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
    const sources = (entry.sources || []).filter((row) => row.payload.provenance !== 'external_feedback');
    const reports = entry.reports || [];
    const [sourceId, setSourceId] = useState('');
    const modelId = controller.models.models.some((row) => row.id === selectedModelId)
        ? selectedModelId
        : controller.models.defaultModelId || controller.models.models[0]?.id || '';
    const [selectedId, setSelectedId] = useState(initialReportId);
    const [supplementSource, setSupplementSource] = useState<QuantSource | null>(null);
    const [supplementNotice, setSupplementNotice] = useState('');
    const [inspectorTab, setInspectorTab] = useState<ResearchDetailsTab>('all');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // 优先展示静态研究主报告，避免初次打开被外部反馈报告遮挡核心研究结论
    const defaultReport = defaultResearchReport(reports);
    const report = reports.find((row) => row.id === selectedId) || defaultReport;

    const reportRun = entry.runs.find((row) => row.id === report?.runId);
    const source = selectedAnalysisSource(entry, report, sourceId);
    const sourceRuns = sourceAnalysisRuns(entry, source?.id);
    const active = sourceRuns.find((run) => ['pending', 'running'].includes(run.status));
    const lastRun = sourceRuns[0];
    const entryActive = entry.runs.find((run) => ['pending', 'running'].includes(run.status));
    const otherActive = entry.runs.filter(
        (run) => ['pending', 'running'].includes(run.status) && !sourceRuns.some((row) => row.id === run.id),
    );
    const reportSource = sources.find((row) => row.id === report?.sourceId);
    const staticReports = staticSourceReports(entry);
    const newerCurrentSource =
        report &&
        staticReports.some((row) => row.id === report.id) &&
        reportSource &&
        source &&
        source.id !== reportSource.id &&
        source.materialId === reportSource.materialId &&
        source.id === reportSource.materialCurrentSourceId;
    const sourceReport = staticReports.find((row) => row.sourceId === source?.id);
    const analyzeDisabledReason = controller.busy
        ? '当前操作尚未完成。'
        : entryActive
          ? '本条目有任务正在执行，结束后可启动新的完整分析。'
          : !source
            ? '请先保存来源资料。'
            : !modelId
              ? '请先选择分析模型。'
              : '';
    const start = () =>
        request(() => {
            void controller.safe(() =>
                quantApi.run(collection, entry.id, {
                    kind: 'analyze',
                    sourceId: source?.id,
                    modelId,
                    requestKey: createRequestKey(),
                }),
            );
        });
    const resume = (restartStage?: ResearchStage) => {
        if (lastRun)
            request(() => {
                void controller.safe(() =>
                    quantApi.run(collection, entry.id, {
                        kind: 'analyze',
                        sourceId: lastRun.sourceId,
                        modelId: lastRun.modelId,
                        requirements: lastRun.requirements,
                        resumeRunId: lastRun.id,
                        restartStage,
                        requestKey: createRequestKey(),
                    }),
                );
            });
    };
    const incremental = (baselineRunId: string) =>
        request(() => {
            void controller.safe(() =>
                quantApi.run(collection, entry.id, {
                    kind: 'analyze',
                    sourceId: source?.id,
                    modelId,
                    resumeRunId: baselineRunId,
                    requirements: entry.runs.find((row) => row.id === baselineRunId)?.requirements || '',
                    requestKey: createRequestKey(),
                }),
            );
        });
    return (
        <div className="space-y-3">
            {/* 报告切换与研究操作 */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 shadow-2xs">
                {reports.length > 1 && report ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold text-slate-700">
                            <FileSpreadsheet size={13} className="text-orange-500" />
                            报告 ({reports.length})：
                        </span>
                        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-hide">
                            {reports.map((row) => {
                                const activeReport = row.id === report.id;
                                const meta = reportTypeMeta(row);
                                return (
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() =>
                                            request(() => {
                                                setSelectedId(row.id);
                                                setSourceId('');
                                            })
                                        }
                                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-xs transition-all ${
                                            activeReport
                                                ? 'border-slate-900 bg-slate-900 font-bold text-white shadow-2xs'
                                                : 'border-slate-200/80 bg-slate-50 text-slate-600 hover:border-orange-200 hover:bg-white'
                                        }`}
                                    >
                                        <span
                                            className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                                activeReport
                                                    ? 'bg-orange-500 text-white'
                                                    : 'bg-slate-200/80 text-slate-600'
                                            }`}
                                        >
                                            {meta.label}
                                        </span>
                                        <span className="max-w-[150px] truncate">{row.data.title || '历史报告'}</span>
                                        {row.data.totalScore !== undefined && row.data.totalScore !== null && (
                                            <span
                                                className={`font-mono text-[10px] ${
                                                    activeReport ? 'text-orange-300' : 'text-orange-600'
                                                }`}
                                            >
                                                {row.data.totalScore}分
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <label className="ml-1 hidden items-center gap-1.5 text-xs text-slate-500 2xl:flex">
                            <span className="sr-only">阅读报告</span>
                            <div className="w-48">
                                <Select
                                    value={report.id}
                                    onChange={(id) =>
                                        request(() => {
                                            setSelectedId(id);
                                            setSourceId('');
                                        })
                                    }
                                    options={reports.map((row) => ({
                                        value: row.id,
                                        label: `${row.data.title || '历史报告'} · ${quantDate(row.createdAt)}`,
                                    }))}
                                    buttonClassName="!h-7 !min-h-7 !py-0.5 !text-[11px]"
                                />
                            </div>
                        </label>
                    </div>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-600">
                        <FileSpreadsheet size={13} className="text-orange-500" />
                        <span className="truncate font-bold text-slate-800">
                            {report ? report.data.title || '当前研究报告' : '等待生成研究报告'}
                        </span>
                    </div>
                )}

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
                        <button type="button" onClick={() => request(() => { setInspectorTab('all'); setDetailsOpen(true); })}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white">
                            <Compass size={12} />查看研究详情
                        </button>
                    )}
                </div>
            </div>

            {settingsOpen && createPortal(
                <QuantModal title="来源与分析设置" wide close={() => setSettingsOpen(false)}>
                    <ReportAnalysisSettings source={source} sources={sources} report={report} lastRun={lastRun}
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
                            : '所选快照尚未生成静态报告，可先预览变更再完整分析。'}
                    </p>
                    {sourceReport && (
                        <button
                            type="button"
                            className="mt-1.5 text-xs font-semibold text-orange-700 underline underline-offset-4"
                            onClick={() =>
                                request(() => {
                                    setSelectedId(sourceReport.id);
                                    setSourceId('');
                                })
                            }
                        >
                            查看所选快照已有报告
                        </button>
                    )}
                </div>
            )}

            {report && report.schemaVersion !== 5 && source?.id !== report.sourceId && (
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
                            pin={() => setSelectedId(report.id)}
                            openFactors={() => request(openFactors)}
                            reportTwoColumn={true}
                            revealPlan={() => {
                                request(() => { setInspectorTab('experiment'); setDetailsOpen(true); });
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
                                <details className="rounded-xl border border-slate-200 p-4">
                                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                                        完整执行证据与核算
                                    </summary>
                                    <div className="mt-4">
                                        <ExecutionEvidence
                                            json={
                                                entry.sources?.find((row) => row.id === report.sourceId)?.payload
                                                    .executionPreviewJson
                                            }
                                        />
                                    </div>
                                </details>
                            </section>
                        )}
                </div>

            </div>

            {!report && <ResearchDetails entry={entry} report={report} source={source} collection={collection} register={register}
                    request={request} openFactors={openFactors} openExperiments={openExperiments} inspectorTab={inspectorTab}
                    setInspectorTab={setInspectorTab} staticReports={staticReports} lastRun={lastRun} reportRun={reportRun}
                    entryActive={entryActive} controllerBusy={controller.busy} start={start} incremental={incremental}
                    analyzeDisabledReason={analyzeDisabledReason} resume={resume} inModal={false}/> }
            {report && detailsOpen && createPortal(
                <QuantModal title="研究详情" subtitle="查看实验规划、来源对照和研究进度" wide close={() => request(() => setDetailsOpen(false))}>
                    <ResearchDetails entry={entry} report={report} source={source} collection={collection} register={register}
                    request={request} openFactors={openFactors} openExperiments={openExperiments} inspectorTab={inspectorTab}
                    setInspectorTab={setInspectorTab} staticReports={staticReports} lastRun={lastRun} reportRun={reportRun}
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
