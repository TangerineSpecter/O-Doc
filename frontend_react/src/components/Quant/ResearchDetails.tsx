import {useNavigate} from 'react-router-dom';
import {ArrowUpRight, FlaskConical} from 'lucide-react';
import type {QuantAIRun, QuantEntryDetail, QuantReport, QuantSource} from '../../types/api/quant';
import type {ResearchStage} from '../../types/api/quantWorkflow';
import type {QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import {QuantBadge, QuantButton, cardClass} from './ui';
import {factorFamilies, factorRoles} from './factorPresentation';
import {InitialExperimentPlan} from './experiments/InitialExperimentPlan';
import {SourceImpactPanel} from './sourceImpact/SourceImpactPanel';
import {ResearchWorkflow} from './workflows/ResearchWorkflow';
import {NativeAudit} from './nativePython/NativeAudit';
import {ReportComparison} from './reports/ReportComparison';
import {ResearchMemory} from './ResearchMemory';

export type ResearchDetailsTab = 'all' | 'experiment' | 'source';

export function ResearchDetails({entry, report, source, collection, register, request, openFactors, openExperiments,
    inspectorTab, setInspectorTab, staticReports, lastRun, reportRun, entryActive, controllerBusy,
    start, incremental, analyzeDisabledReason, resume, inModal}: {
    entry: QuantEntryDetail; report?: QuantReport; source?: QuantSource; collection: string;
    register: QuantRegisterDraft; request: (action: () => void) => void;
    openFactors: () => void; openExperiments: (id?: string) => void;
    inspectorTab: ResearchDetailsTab; setInspectorTab: (tab: ResearchDetailsTab) => void;
    staticReports: QuantReport[]; lastRun?: QuantAIRun; reportRun?: QuantAIRun; entryActive?: QuantAIRun;
    controllerBusy: boolean; start: () => void; incremental: (id: string) => void;
    analyzeDisabledReason: string; resume: (stage?: ResearchStage) => void; inModal: boolean;
}) {
    const navigate = useNavigate();
    return (
        <div className="min-w-0 space-y-4">
        <div role="group" aria-label="研究详情分类" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm">
                {(
                    [
                        ['all', '全部'],
                        ['experiment', '实验规划'],
                        ['source', '源码与进度'],
                    ] as const
                ).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={inspectorTab === id}
                        onClick={() => setInspectorTab(id)}
                        className={`rounded-lg px-3 py-1.5 font-medium transition ${
                            inspectorTab === id
                                ? 'bg-white text-orange-700 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        {label}
                    </button>
                ))}
        </div>

        {/* 自动提取的因子候选预览与入口 */}
        {(inspectorTab === 'all' || inspectorTab === 'experiment') &&
            report?.data.extractionVersion === 1 && ![2, 3].includes(report.schemaVersion) && (
                <section id="quant-candidates-section" className={`${cardClass} scroll-mt-24 space-y-3.5 !p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                                <FlaskConical size={16} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    已自动归档 {report.data.factors?.length || 0} 个研究候选
                                </h3>
                            </div>
                        </div>
                        <QuantButton size="sm" primary onClick={() => request(openFactors)}>
                            <span>查看因子候选库</span>
                            <ArrowUpRight size={13} />
                        </QuantButton>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{report.data.extractionNote}</p>

                    {!!report.data.factors?.length && (
                        <div className="space-y-2.5">
                            {report.data.factors.map((factor, idx) => (
                                <div
                                    key={`${factor.name}-${idx}`}
                                    className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 transition hover:border-orange-200 hover:bg-white"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-extrabold text-slate-900">
                                            {factor.name}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <QuantBadge tone="orange" className="!px-1.5 !py-0 text-[10px]">
                                                {factorRoles[factor.role] || factor.role}
                                            </QuantBadge>
                                            <QuantBadge tone="slate" className="!px-1.5 !py-0 text-[10px]">
                                                {factorFamilies[factor.family] || factor.family}
                                            </QuantBadge>
                                        </div>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                                        {factor.summary}
                                    </p>
                                    {factor.formula && (
                                        <pre className="mt-2 truncate rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-orange-300">
                                            {factor.formula}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

        {/* AI 实验方案 */}
        {(inspectorTab === 'all' || inspectorTab === 'experiment') && report && (
            <InitialExperimentPlan
                key={`plan-${report.id}`}
                report={report}
                collection={collection}
                register={register}
                request={request}
                openExperiments={openExperiments}
            />
        )}

        {/* 源码变更影响预览 */}
        {(inspectorTab === 'all' || inspectorTab === 'source') && (
            <div id="quant-source-impact-section" className="scroll-mt-24">
                <SourceImpactPanel
                    inModal={inModal}
                    entry={entry}
                    collection={collection}
                    source={source}
                    currentReport={report}
                    analyze={start}
                    incremental={incremental}
                    analyzeDisabledReason={analyzeDisabledReason}
                />
            </div>
        )}

        {/* 研究阶段进度流水线 */}
        {(inspectorTab === 'all' || inspectorTab === 'source') && lastRun?.workflow && (
            <div id="quant-workflow-section" className="scroll-mt-24">
                <ResearchWorkflow
                    inModal={inModal}
                    key={lastRun.id}
                    run={lastRun}
                    collection={collection}
                    busy={controllerBusy || !!entryActive}
                    resume={resume}
                />
            </div>
        )}

        {(inspectorTab === 'all' || inspectorTab === 'source') && reportRun?.nativeReviewWorkflow && (
            <div className={cardClass}>
                <NativeAudit
                    key={reportRun.id}
                    collection={collection}
                    entryId={entry.id}
                    runId={reportRun.id}
                    workflow={reportRun.nativeReviewWorkflow}
                />
            </div>
        )}

        {/* 静态报告对照 */}
        {(inspectorTab === 'all' || inspectorTab === 'source') && report && (
            <div id="quant-comparison-section" className="scroll-mt-24">
                <ReportComparison
                    inModal={inModal}
                    key={`comparison-${report.id}`}
                    report={report}
                    reports={staticReports}
                    runs={entry.runs}
                />
            </div>
        )}

        {/* 跨来源历史研究记忆 */}
        {(inspectorTab === 'all' || inspectorTab === 'source') && report && (
            <div id="quant-memory-section" className="scroll-mt-24">
                <ResearchMemory
                    json={
                        report.researchMemoryJson ||
                        entry.runs.find((run) => run.id === report.runId)?.researchMemoryJson
                    }
                    note={report.data.memoryNote}
                    assessments={report.data.memoryAssessment}
                    openEntry={(id) =>
                        request(() =>
                            navigate(
                                `/quant/${encodeURIComponent(collection)}/entries/${encodeURIComponent(id)}`,
                            ),
                        )
                    }
                />
            </div>
        )}
        </div>
    );
}
