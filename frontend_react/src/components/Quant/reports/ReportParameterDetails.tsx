import type {QuantReportReading} from '../../../types/api/quantReading';
import { ArrowUpRight, Cpu, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { ReportParameters } from './ReportParameters';
import { ParameterConfiguration } from '../feedback/ParameterConfiguration';

/** Read the saved report fields; never fill an actual configuration from defaults. */
export function ReportParameterDetails({ report, revealPlan }: { report: QuantReportReading; revealPlan: () => void }) {
    const data = report.data;
    if (report.schemaVersion === 4) {
        return (
            <section aria-label="实验参数分析" className="space-y-4">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs leading-6 text-slate-500">
                    以下是本份实验报告的 AI 参数结论。具体取值与成本以原实验记录为准；有结论不代表已经找到最优参数。
                </div>
                {data.parameterAssessment?.length ? (
                    <div className="grid gap-3">
                        {data.parameterAssessment.map((row, index) => (
                            <article
                                key={index}
                                className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition hover:border-orange-200"
                            >
                                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                                    {row.text}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
                                    <span className="font-medium text-slate-400">实验依据：</span>
                                    <span className="rounded-md bg-orange-50 px-2 py-0.5 font-mono text-orange-700">
                                        {row.evidenceRefs.join('、') || '未提供具体引用'}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center text-sm leading-7 text-slate-500">
                        这份历史报告没有单独保存参数结论，请在报告正文及原实验中查看。
                    </div>
                )}
                {report.proposal && (
                    <a
                        href={`#quant-report-plan-${report.id}`}
                        onClick={event => { event.preventDefault(); revealPlan(); }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                    >
                        <span>查看下一轮 AI 参数与实验方案</span>
                        <ArrowUpRight size={14} />
                    </a>
                )}
            </section>
        );
    }
    if (report.schemaVersion === 5) {
        const native = data.nativeReview;
        const hasValues = !!data.reportedParameters?.length || !!native?.actualParameters.length;
        return (
            <section aria-label="反馈参数分析" className="space-y-4">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs leading-6 text-slate-500">
                    来源报告、配置文件和本机运行的参数分别展示。文件值不证明已实际运行；缺失值不使用源码默认值补齐。
                </div>
                {data.parameterConfiguration && (
                    <ParameterConfiguration
                        configuration={data.parameterConfiguration}
                        comparison={data.parameterComparison}
                    />
                )}
                {!!data.reportedParameters?.length && (
                    <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                            <FileSpreadsheet size={16} className="text-orange-500" />
                            报告声明的参数
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {data.reportedParameters.map((row, index) => (
                                <article
                                    key={index}
                                    className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5"
                                >
                                    <p className="break-words text-sm font-semibold text-slate-800">
                                        <span className="rounded-md bg-white px-2 py-0.5 font-mono text-orange-700 ring-1 ring-slate-200">
                                            {row.name} = {row.value}
                                        </span>
                                        {row.unit && <span className="ml-1.5 text-xs text-slate-500">{row.unit}</span>}
                                    </p>
                                    <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">
                                        原文依据：{row.quote}
                                    </p>
                                </article>
                            ))}
                        </div>
                    </div>
                )}
                {native && (
                    <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                            <Cpu size={16} className="text-orange-500" />
                            本机验证记录的参数
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {native.actualParameters.map((row, index) => (
                                <p
                                    key={index}
                                    className="break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-700"
                                >
                                    {row.name} = {JSON.stringify(row.value)}
                                </p>
                            ))}
                        </div>
                        <p className="whitespace-pre-wrap break-words rounded-xl bg-orange-50/40 p-3.5 text-sm leading-7 text-slate-700">
                            {native.parameterAssessment}
                        </p>
                    </div>
                )}
                {data.computedExecutionJson && (
                    <a
                        href={`#quant-report-execution-${report.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                    >
                        <span>查看完整执行证据中的参数与源码对照</span>
                        <ArrowUpRight size={14} />
                    </a>
                )}
                {!hasValues && !data.parameterConfiguration && !data.computedExecutionJson && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                        <SlidersHorizontal size={20} className="mx-auto mb-2 text-slate-400" />
                        <p className="text-sm leading-7 text-slate-500">
                            这份反馈未保存可单独展示的参数记录，不能解释为没有参数；已有说明仍保留在正文。
                        </p>
                    </div>
                )}
            </section>
        );
    }
    return <ReportParameters parameters={data.parameters} />;
}
