import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, ChevronRight, ExternalLink } from 'lucide-react';
import type { QuantReport } from '../../../types/api/quant';
import { ReportScoreDetails } from './ReportScoreDetails';
import { scoreColor } from './scoreColors';

export function ReportScore({ report }: { report: QuantReport }) {
    const data = report.data;
    const [selected, setSelected] = useState<number | 'all' | null>(null);
    if (!data.scores) return null;

    const total = data.totalScore ?? null;
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const progress = total !== null ? Math.max(0, Math.min(100, total)) : 0;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <section
            id="quant-sec-score"
            className="scroll-mt-24 flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm"
            aria-label="研究评分与依据"
        >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex min-w-0 items-center gap-3.5">
                    {/* 环形分数仪表 — 固定 56x56 尺寸，防止窄宽度下折行 */}
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                        <svg className="h-14 w-14 -rotate-90 transform" viewBox="0 0 68 68" aria-hidden="true">
                            <circle
                                cx="34"
                                cy="34"
                                r={radius}
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="6"
                                className="text-slate-800"
                            />
                            {total !== null && (
                                <circle
                                    cx="34"
                                    cy="34"
                                    r={radius}
                                    fill="transparent"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                    className={
                                        total >= 80
                                            ? 'text-emerald-400'
                                            : total >= 60
                                              ? 'text-orange-400'
                                              : 'text-amber-400'
                                    }
                                />
                            )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <strong className="font-mono text-base font-extrabold tabular-nums leading-none text-white">
                                {total ?? '—'}
                            </strong>
                            <span className="mt-0.5 whitespace-nowrap font-mono text-[9px] leading-none text-slate-400">
                                /100
                            </span>
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                                <Award size={14} className="shrink-0 text-orange-400" />
                                <span className="truncate">
                                    {report.schemaVersion === 4 ? 'AI 实验研究评价' : 'AI 原稿研究质量分'}
                                </span>
                            </span>
                            <span className="shrink-0 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-orange-300">
                                五维等权
                            </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
                            按五维等权汇总；缺少证据时不计算总分。不代表盈利能力，人工编辑正文不改变原稿评分。
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setSelected('all')}
                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white"
                >
                    <ExternalLink size={12} />
                    查看全部依据
                </button>
            </div>

            <div className="mt-3 grid gap-1.5">
                {data.scores.map((item, index) => {
                    const palette = scoreColor(item.score);
                    return (
                        <button
                            type="button"
                            key={`${item.dimension}-${index}`}
                            onClick={() => setSelected(index)}
                            aria-label={`查看${item.dimension}评分依据${item.score === null ? '，未评估' : `，${item.score} / 5`}`}
                            className="w-full rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2 text-left transition hover:border-slate-700"
                        >
                            <div className="flex items-center justify-between gap-2 text-xs leading-5">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                                    <span className="truncate font-semibold text-slate-100">{item.dimension}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2.5">
                                    {/* 5 格可视化能量条 */}
                                    <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                                        {[1, 2, 3, 4, 5].map((step) => (
                                            <span
                                                key={step}
                                                className={`h-1.5 w-4 rounded-full transition-colors ${
                                                    item.score !== null && step <= item.score
                                                        ? palette.bar
                                                        : 'bg-slate-700'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <span
                                        className={`inline-flex min-w-[3.5rem] justify-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${palette.badge}`}
                                    >
                                        {item.score === null ? '未评估' : `${item.score} / 5`}
                                    </span>
                                    <ChevronRight size={13} className="text-slate-400" />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
            {selected !== null && createPortal(
                <ReportScoreDetails report={report} selected={selected} close={() => setSelected(null)} />,
                document.body,
            )}
        </section>
    );
}
