import type {QuantReportReading} from '../../../types/api/quantReading';
import { useState } from 'react';
import { Award, ChevronDown, ChevronUp } from 'lucide-react';
import { QuantModal } from '../ui';
import { scoreColor } from './scoreColors';
import { ScoreExplanation } from './ScoreExplanation';

export function ReportScoreDetails({ report, selected, close }: { report: QuantReportReading; selected: number | 'all'; close: () => void }) {
    const data = report.data;
    const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
        Object.fromEntries((report.data.scores || []).map((item, index) => [item.dimension, selected === 'all' || selected === index])),
    );
    if (!data.scores) return null;

    const allOpen = data.scores.length > 0 && data.scores.every((item) => openMap[item.dimension]);
    const toggleAll = () => {
        if (allOpen) {
            setOpenMap({});
        } else {
            const next: Record<string, boolean> = {};
            for (const item of data.scores || []) next[item.dimension] = true;
            setOpenMap(next);
        }
    };

    const total = data.totalScore ?? null;
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const progress = total !== null ? Math.max(0, Math.min(100, total)) : 0;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <QuantModal title="评分详情" close={close} wide>
            <section
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white sm:p-5"
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
                                        {report.schemaVersion === 4 ? 'AI 实验研究评价' : '源码质量评价'}
                                    </span>
                                </span>
                                <span className="shrink-0 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-orange-300">
                                    五维等权
                                </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
                                {report.schemaVersion === 4 ? '按实验记录评价，五维等权汇总。' : '评价计算逻辑、实现、时序、参数与复用；运行验证单列说明。'} 分数不代表盈利能力。
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={toggleAll}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white"
                    >
                        {allOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {allOpen ? '收起全部说明' : '展开全部说明'}
                    </button>
                </div>

                <div className="mt-3 grid gap-1.5">
                    {data.scores.map((item) => {
                        const isOpen = Boolean(openMap[item.dimension]);
                        const palette = scoreColor(item.score);
                        return (
                            <details
                                key={item.dimension}
                                open={isOpen}
                                onToggle={(e) => {
                                    const open = e.currentTarget.open;
                                    setOpenMap((prev) =>
                                        prev[item.dimension] === open ? prev : { ...prev, [item.dimension]: open },
                                    );
                                }}
                                className="group rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2 transition hover:border-slate-700"
                            >
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs leading-5">
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
                                        <ChevronDown
                                            size={13}
                                            className="text-slate-400 transition-transform duration-150 group-open:rotate-180"
                                        />
                                    </div>
                                </summary>
                                <ScoreExplanation reason={item.reason} evidence={item.evidence} />
                            </details>
                        );
                    })}
                </div>
            </section>
        </QuantModal>
    );
}
