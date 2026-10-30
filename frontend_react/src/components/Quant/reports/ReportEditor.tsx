import {ReportHistory} from './ReportHistory';
import type {QuantReportReading} from '../../../types/api/quantReading';
import { useQuantCopyFeedback } from '../../../hooks/useQuantCopyFeedback';
import { memo, useId, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowUpRight,
    Award,
    BookOpen,
    Check,
    Columns2,
    Copy,
    ListTree,
    PenLine,
    Save,
    SlidersHorizontal,
    Sparkles,
} from 'lucide-react';
import type { QuantController } from '../../../hooks/useQuant';
import type { QuantRegisterDraft } from '../../../hooks/useQuantNavigation';
import { useQuantReportDraft } from '../../../hooks/useQuantReportDraft';
import { extractMarkdownHeadings, quantDate } from '../../../utils/quant';
import { logicReportBody } from '../../../utils/quantLogicReport';
import { factorReadingNotes } from '../../../utils/quantFactorReading';
import { QuantBadge, QuantButton, cardClass } from '../ui';
import { ReportMarkdown } from '../ReportMarkdown';
import { SourceFindings } from '../SourceFindings';
import { ParameterConfiguration } from '../feedback/ParameterConfiguration';
import { ReportScore } from './ReportScore';
import { ReportParameterDetails } from './ReportParameterDetails';
import { StaticLogicReport } from './StaticLogicReport';

export const ReportEditor = memo(function ReportEditor({
    report,
    collection,
    entryId,
    controller,
    register,
    pin,
    revealPlan,
    openFactors,
    reportTwoColumn,
}: {
    report: QuantReportReading;
    collection: string;
    entryId: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    pin: (reportId: string) => void;
    revealPlan: () => void;
    openFactors: () => void;
    reportTwoColumn: boolean;
}) {
    const state = useQuantReportDraft(report, collection, entryId, controller.safe, register);
    const [view, setView] = useState<'report' | 'parameters'>('report');
    const [splitEdit, setSplitEdit] = useState(false);
    const { copiedKey, error: copyError, copy } = useQuantCopyFeedback();
    const copied = copiedKey === 'copy';

    const data = report.data;
    const isStaticSource = [2, 3].includes(report.schemaVersion);
    const significant =
        data.sourceFindings?.filter((row) => row.severity === 'critical' || row.severity === 'high') || [];

    const headingScope = useId();
    const headings = useMemo(
        () => extractMarkdownHeadings(state.draft, data.title, headingScope, data.summary),
        [state.draft, data.title, data.summary, headingScope],
    );

    const reportCategory =
        report.schemaVersion === 5
            ? data.nativeReview
                ? { badge: 'Python 输出对照', tone: 'blue' as const, desc: '本机Python输出对照解读 · 固定样本' }
                : { badge: '外部反馈解读', tone: 'amber' as const, desc: '外部反馈解读 · 用户声明尚未独立验证' }
            : report.schemaVersion === 4
              ? { badge: '实验复盘解读', tone: 'emerald' as const, desc: '本机实验解读 · 原平台与实盘未验证' }
              : { badge: '源码解读', tone: 'orange' as const, desc: '基于保存的源码' };

    const scrollToAnchor = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <section className={`${cardClass} relative overflow-clip !p-4 sm:!p-6`} aria-label="研究报告内容">
            {/* 顶部装饰彩条 */}
            <div
                aria-hidden="true"
                className="inset-x-0 top-0 -mx-6 -mt-6 mb-4 h-1 bg-gradient-to-r from-slate-900 via-orange-500 to-amber-400"
            />

            {/* 紧凑一体化报告顶栏：标题 + 阅读视图切换 + 工具按钮同层排布 */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="min-w-0 w-full flex-1 sm:min-w-60 sm:w-auto">
                    <div className="flex flex-wrap items-center gap-2">
                        <QuantBadge tone={reportCategory.tone}>{reportCategory.badge}</QuantBadge>
                        {!isStaticSource && data.totalScore !== undefined && data.totalScore !== null && (
                            <QuantBadge tone={data.totalScore >= 80 ? 'emerald' : data.totalScore >= 60 ? 'orange' : 'amber'}>
                                <Award size={11} />
                                质量分 {data.totalScore}
                            </QuantBadge>
                        )}
                        {!isStaticSource && significant.length > 0 && (
                            <QuantBadge tone="red">
                                <AlertTriangle size={11} />
                                {significant.length} 项重点风险
                            </QuantBadge>
                        )}
                        {state.revisionId && <QuantBadge tone="slate">已修订</QuantBadge>}
                        <span className="font-mono text-[11px] text-slate-400">
                            {quantDate(report.createdAt)} · {reportCategory.desc}
                        </span>
                    </div>
                    <h2 className="mt-1.5 break-words text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                        {data.title || '历史代码解释'}
                    </h2>
                </div>

                {/* 右侧：阅读模式分段控制器 + 操作按钮 */}
                <div className="flex flex-wrap items-center gap-2">
                    {!state.editing && (
                        <div
                            role="group"
                            aria-label="报告阅读内容"
                            className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/90 p-0.5"
                        >
                            {(
                                [
                                    ['report', isStaticSource ? '逻辑解读' : '结论与评分', BookOpen],
                                    [
                                        'parameters',
                                        report.schemaVersion === 4
                                            ? '实验参数结论'
                                            : report.schemaVersion === 5
                                              ? '配置与参数'
                                              : `参数分析（${data.parameters?.length || 0}）`,
                                        SlidersHorizontal,
                                    ],
                                ] as const
                            ).map(([id, label, Icon]) => (
                                <button
                                    type="button"
                                    key={id}
                                    aria-pressed={view === id}
                                    onClick={() => setView(id)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                        view === id
                                            ? 'bg-slate-900 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Icon size={13} className={view === id ? 'text-orange-400' : ''} />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    <QuantButton
                        size="sm"
                        onClick={() => {
                            const text = isStaticSource && !state.editing
                                ? logicReportBody(factorReadingNotes(state.draft).body, state.dirty || !!state.revisionId)
                                : state.draft;
                            void copy(text);
                        }}
                    >
                        {copied ? <Check size={13} className="text-lime-600" /> : <Copy size={13} />}
                        {copied ? '已复制正文' : '复制报告'}
                    </QuantButton>
                    {state.editing && (
                        <QuantButton
                            size="sm"
                            onClick={() => setSplitEdit((prev) => !prev)}
                            className={splitEdit ? '!border-orange-300 !bg-orange-50 !text-orange-700' : ''}
                        >
                            <Columns2 size={13} />
                            {splitEdit ? '单栏编辑' : '分屏预览'}
                        </QuantButton>
                    )}
                    <QuantButton
                        size="sm"
                        primary={state.editing && !state.dirty}
                        onClick={() => {
                            pin(report.id);
                            state.setEditing(!state.editing);
                            setView('report');
                        }}
                    >
                        <PenLine size={13} />
                        {state.editing ? '预览报告' : '编辑与删减'}
                    </QuantButton>
                    {state.dirty && (
                        <QuantButton
                            size="sm"
                            primary
                            disabled={controller.busy}
                            onClick={() => void state.save()}
                        >
                            <Save size={13} />
                            保存修订
                        </QuantButton>
                    )}
                </div>
            </div>

            {copyError && <p role="alert" className="mb-3 text-xs text-red-600">{copyError}</p>}

            {/* 主体内容区：编辑态 / 参数页 / 结论与评分页 */}
            {state.editing ? (
                <div className={splitEdit ? 'grid gap-4 lg:grid-cols-2' : ''}>
                    <textarea
                        aria-label="编辑研究报告"
                        value={state.draft}
                        onChange={(e) => {
                            pin(report.id);
                            state.setDraft(e.target.value);
                        }}
                        rows={28}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/40 p-4 font-mono text-sm leading-7 text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 scrollbar-hide"
                    />
                    {splitEdit && (
                        <div className="max-h-[42rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 scrollbar-hide">
                            <div className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-400">
                                实时排版预览
                            </div>
                            <ReportMarkdown
                                text={state.draft}
                                stripTitle={data.title}
                                stripSummary={data.summary}
                            />
                        </div>
                    )}
                </div>
            ) : view === 'parameters' ? (
                <div className="space-y-4">
                    {(data.initialPlanningVersion === 1 || data.feedbackPlanningVersion === 1) && (
                        <a
                            className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 underline underline-offset-4"
                            href={`#quant-report-plan-${report.id}`}
                            onClick={(event) => {event.preventDefault(); revealPlan();}}
                        >
                            查看 AI 实验方案
                        </a>
                    )}
                    <ReportParameterDetails report={report} revealPlan={revealPlan} />
                </div>
            ) : isStaticSource ? (
                <StaticLogicReport report={report} draft={state.draft} revised={state.dirty || !!state.revisionId} openFactors={openFactors} twoColumn={reportTwoColumn}/>
            ) : (
                <>
                    {/* 双栏 Bento 核心看板：左侧 AI 摘要 + 风险预警 + 章节目录，右侧暗黑五维评分矩阵 */}
                    <div
                        className={`mb-5 grid gap-4 ${
                            data.scores?.length ? 'lg:grid-cols-[1.08fr_1fr]' : 'grid-cols-1'
                        }`}
                    >
                        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/60 via-white to-slate-50/60 p-4 shadow-2xs">
                            <div className="space-y-3.5">
                                {data.summary && (
                                    <div>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-orange-700 uppercase">
                                                <Sparkles size={13} className="text-orange-500" />
                                                AI 原稿摘要
                                            </span>
                                            {(data.initialPlanningVersion === 1 ||
                                                data.feedbackPlanningVersion === 1 ||
                                                report.proposal) && (
                                                <a
                                                    href={`#quant-report-plan-${report.id}`}
                                                    onClick={(event) => {event.preventDefault(); revealPlan();}}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-orange-100/80 px-2.5 py-1 text-[11px] font-bold text-orange-700 transition hover:bg-orange-200/70"
                                                >
                                                    <span>查看 AI 实验方案</span>
                                                    <ArrowUpRight size={11} />
                                                </a>
                                            )}
                                        </div>
                                        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                                            {data.summary}
                                        </p>
                                    </div>
                                )}

                                {/* 结构化关键指标速览格 — 消除左卡留白，提供一键直达 */}
                                <div className="grid grid-cols-3 gap-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setView('parameters')}
                                        className="group rounded-xl border border-slate-200/80 bg-white/90 p-2.5 text-left transition hover:border-orange-300 hover:shadow-2xs"
                                    >
                                        <span className="block text-[10px] font-semibold text-slate-400">
                                            识别参数声明
                                        </span>
                                        <div className="mt-1 flex items-baseline justify-between">
                                            <strong className="font-mono text-base font-extrabold text-slate-900 group-hover:text-orange-600">
                                                {data.parameters?.length || 0}
                                            </strong>
                                            <span className="text-[10px] font-medium text-orange-600">查看参数 →</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => scrollToAnchor('quant-sec-findings')}
                                        className="group rounded-xl border border-slate-200/80 bg-white/90 p-2.5 text-left transition hover:border-orange-300 hover:shadow-2xs"
                                    >
                                        <span className="block text-[10px] font-semibold text-slate-400">
                                            原稿风险清单
                                        </span>
                                        <div className="mt-1 flex items-baseline justify-between">
                                            <strong
                                                className={`font-mono text-base font-extrabold ${
                                                    significant.length > 0 ? 'text-red-600' : 'text-slate-900'
                                                }`}
                                            >
                                                {data.sourceFindings?.length || 0}
                                            </strong>
                                            <span className="text-[10px] text-slate-400">
                                                {significant.length > 0 ? `${significant.length} 高危` : '常规核对'}
                                            </span>
                                        </div>
                                    </button>
                                    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5 text-left">
                                        <span className="block text-[10px] font-semibold text-slate-400">
                                            提取候选因子
                                        </span>
                                        <div className="mt-1 flex items-baseline justify-between">
                                            <strong className="font-mono text-base font-extrabold text-slate-900">
                                                {data.factors?.length || 0}
                                            </strong>
                                            <span className="text-[10px] text-slate-400">已归档入库</span>
                                        </div>
                                    </div>
                                </div>

                                {!!significant.length && (
                                    <div
                                        role="status"
                                        className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs leading-5 text-red-800"
                                    >
                                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
                                        <p>
                                            有 {significant.length} 项严重或高影响问题：
                                            {significant
                                                .slice(0, 3)
                                                .map((row) => row.title)
                                                .join('；')}
                                            {significant.length > 3 ? '等' : ''}
                                            。研究总分不代表通过，完整影响和依据见下方问题清单。
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* 章节锚点快速跳转目录条 */}
                            {(Boolean(data.scores?.length) ||
                                ([2, 3].includes(report.schemaVersion) && data.sourceFindingsVersion === 1) ||
                                headings.length > 0) && (
                                <div className="flex flex-wrap items-center gap-1.5 border-t border-orange-200/40 pt-3">
                                    <span className="inline-flex shrink-0 items-center gap-1 pr-1 text-[11px] font-bold text-slate-400">
                                        <ListTree size={12} className="text-orange-500" />
                                        章节速览：
                                    </span>
                                    {Boolean(data.scores?.length) && (
                                        <button
                                            type="button"
                                            onClick={() => scrollToAnchor('quant-sec-score')}
                                            className="shrink-0 whitespace-nowrap rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-2xs ring-1 ring-slate-200/80 transition hover:bg-orange-50 hover:text-orange-600"
                                        >
                                            五维评分
                                        </button>
                                    )}
                                    {[2, 3].includes(report.schemaVersion) && data.sourceFindingsVersion === 1 && (
                                        <button
                                            type="button"
                                            onClick={() => scrollToAnchor('quant-sec-findings')}
                                            className="shrink-0 whitespace-nowrap rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-2xs ring-1 ring-slate-200/80 transition hover:bg-orange-50 hover:text-orange-600"
                                        >
                                            问题清单 ({data.sourceFindings?.length || 0})
                                        </button>
                                    )}
                                    {headings
                                        .filter((h) => h.level <= 2)
                                        .map((h) => (
                                            <button
                                                key={h.id}
                                                type="button"
                                                onClick={() => scrollToAnchor(h.id)}
                                                className="shrink-0 whitespace-nowrap rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-2xs ring-1 ring-slate-200/80 transition hover:bg-orange-50 hover:text-orange-600"
                                            >
                                                {h.text}
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>

                        {data.scores?.length ? <ReportScore report={report} /> : null}
                    </div>

                    {[2, 3].includes(report.schemaVersion) && (
                        <SourceFindings
                            version={data.sourceFindingsVersion}
                            findings={data.sourceFindings}
                            note={data.sourceFindingsNote}
                        />
                    )}
                    {data.parameterConfiguration && (
                        <div className="mb-5">
                            <ParameterConfiguration
                                configuration={data.parameterConfiguration}
                                comparison={data.parameterComparison}
                            />
                        </div>
                    )}
                    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-6">
                        <ReportMarkdown
                            text={state.draft}
                            headingScope={headingScope}
                            stripTitle={data.title}
                            stripSummary={data.summary}
                        />
                    </div>
                </>
            )}

            {state.dirty && (
                <div className="mt-4 flex justify-end">
                    <QuantButton primary disabled={controller.busy} onClick={() => void state.save()}>
                        <Save size={14} />
                        保存修订
                    </QuantButton>
                </div>
            )}

            <ReportHistory report={report} collection={collection} entryId={entryId} controller={controller}/>

        </section>
    );
});
