import { useQuantCopyFeedback } from '../../hooks/useQuantCopyFeedback';
import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Code2, Copy, Lightbulb, ShieldAlert } from 'lucide-react';
import type { FindingSeverity, QuantSourceFinding } from '../../types/api/quantFindings';

const order: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const labels: Record<FindingSeverity, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
    info: '提示',
};
const severityStyle: Record<
    FindingSeverity,
    { badge: string; border: string; accent: string }
> = {
    critical: {
        badge: 'bg-red-100 text-red-800 border-red-200',
        border: 'border-l-4 border-l-red-500 border-red-200/70 bg-red-50/15',
        accent: 'text-red-600',
    },
    high: {
        badge: 'bg-red-50 text-red-700 border-red-200/80',
        border: 'border-l-4 border-l-orange-500 border-orange-200/70 bg-orange-50/15',
        accent: 'text-orange-600',
    },
    medium: {
        badge: 'bg-amber-50 text-amber-700 border-amber-200/80',
        border: 'border-l-4 border-l-amber-400 border-slate-200 bg-white',
        accent: 'text-amber-600',
    },
    low: {
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
        border: 'border-l-4 border-l-slate-300 border-slate-200 bg-white',
        accent: 'text-slate-500',
    },
    info: {
        badge: 'bg-sky-50 text-sky-700 border-sky-200/80',
        border: 'border-l-4 border-l-sky-400 border-slate-200 bg-white',
        accent: 'text-sky-600',
    },
};
const fields = { code: '源码', description: '说明', web_markdown: '网页正文' };

export function SourceFindings({
    version,
    findings,
    note,
}: {
    version?: number;
    findings?: QuantSourceFinding[];
    note?: string;
}) {
    const [filter, setFilter] = useState<FindingSeverity | 'all'>('all');
    const [expandAll, setExpandAll] = useState(false);
    const { copiedKey, error: copyError, copy } = useQuantCopyFeedback();

    if (version === undefined) {
        return (
            <p className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs leading-6 text-slate-500">
                这份历史报告未提供独立的问题清单，风险说明仍保留在正文中。
            </p>
        );
    }
    if (version !== 1 || !findings || !note) {
        return (
            <p
                role="status"
                className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800"
            >
                问题清单暂不可读，不能据此判断源码没有严重问题。
            </p>
        );
    }

    const rows = [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
    const critical = rows.filter((row) => row.severity === 'critical').length;
    const high = rows.filter((row) => row.severity === 'high').length;
    const visibleRows = filter === 'all' ? rows : rows.filter((row) => row.severity === filter);
    const availableSeverities = order.filter((sev) => rows.some((r) => r.severity === sev));

    return (
        <div
            id="quant-sec-findings"
            className="mb-6 scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs"
            data-source-findings
        >
            {copyError && <p role="alert" className="mb-3 text-xs text-red-600">{copyError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                        <ShieldAlert size={17} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">问题清单与严重度</h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                AI 原稿判断 · {rows.length} 项
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                            严重度独立于五维评分。AI 对原文的判断仍需核对，不代表编译或运行验证；编辑正文不会改写这份原稿清单。
                        </p>
                    </div>
                </div>

                {rows.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpandAll((prev) => !prev)}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-600"
                    >
                        {expandAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expandAll ? '收起全部依据' : '展开全部依据'}
                    </button>
                )}
            </div>

            {(critical > 0 || high > 0) && (
                <div
                    role="status"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 p-3.5 text-sm leading-6 text-red-800"
                >
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-600" />
                    <p>
                        {critical > 0 && `${critical} 项严重问题`}
                        {critical > 0 && high > 0 && '，'}
                        {high > 0 && `${high} 项高影响问题`}
                        。研究总分不能视为通过结论，请先核对原文、影响及验证建议。
                    </p>
                </div>
            )}

            <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50/80 px-3.5 py-2.5 text-xs leading-6 text-slate-600">
                {note}
            </p>

            {availableSeverities.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setFilter('all')}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            filter === 'all'
                                ? 'bg-orange-500 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                    >
                        全部 ({rows.length})
                    </button>
                    {availableSeverities.map((sev) => {
                        const count = rows.filter((r) => r.severity === sev).length;
                        return (
                            <button
                                key={sev}
                                type="button"
                                onClick={() => setFilter(sev)}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                    filter === sev
                                        ? 'bg-orange-500 text-white shadow-2xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                                }`}
                            >
                                {labels[sev]} ({count})
                            </button>
                        );
                    })}
                </div>
            )}

            {rows.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-slate-200 py-5 text-center text-sm text-slate-500">
                    本次 AI 未列出具体问题，这不证明源码没有缺陷。
                </p>
            ) : (
                <div className={`mt-3 grid gap-3 ${visibleRows.length > 1 ? 'md:grid-cols-2' : ''}`}>
                    {visibleRows.map((row, index) => {
                        const style = severityStyle[row.severity] || severityStyle.low;
                        return (
                            <article
                                key={`${row.title}-${index}`}
                                className={`rounded-xl border p-4 transition ${style.border}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-start gap-2.5">
                                        <span
                                            className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                                        >
                                            {labels[row.severity]}
                                        </span>
                                        <h4 className="min-w-0 break-words text-sm font-bold leading-6 text-slate-900">
                                            {row.title}
                                        </h4>
                                    </div>
                                    <span className="rounded-md bg-slate-100/90 px-2 py-0.5 text-[11px] text-slate-500">
                                        {row.certainty === 'source_fact' ? 'AI 判定为原文事实' : '影响待验证的假设'} · 涉及
                                        {row.affectedDimensions.join('、')}
                                    </span>
                                </div>

                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-lg bg-white/80 p-3 ring-1 ring-slate-100">
                                        <span className="text-[11px] font-semibold text-slate-400">问题影响</span>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700 sm:text-sm">
                                            {row.impact}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-orange-50/30 p-3 ring-1 ring-orange-100/70">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600">
                                            <Lightbulb size={12} />
                                            验证与处理建议
                                        </span>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700 sm:text-sm">
                                            建议：{row.recommendation}
                                        </p>
                                    </div>
                                </div>

                                <details key={`${index}-${expandAll ? 'open' : 'closed'}`} open={expandAll} className="mt-3">
                                    <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100/80 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-orange-50 hover:text-orange-600">
                                        <Code2 size={13} />
                                        <span>查看原文依据 · {row.evidence.length} 处</span>
                                    </summary>
                                    <div className="mt-3 space-y-2.5">
                                        {row.evidence.map((evidence, i) => {
                                            const copyId = `${index}-${i}`;
                                            return (
                                                <div
                                                    key={i}
                                                    className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-900 text-slate-100"
                                                >
                                                    <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-400">
                                                        <span>{fields[evidence.field]}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                void copy(evidence.quote, copyId);
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white"
                                                        >
                                                            {copiedKey === copyId ? (
                                                                <Check size={11} className="text-lime-400" />
                                                            ) : (
                                                                <Copy size={11} />
                                                            )}
                                                            {copiedKey === copyId ? '已复制' : '复制引文'}
                                                        </button>
                                                    </div>
                                                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-6 text-slate-100 scrollbar-hide">
                                                        {evidence.quote}
                                                    </pre>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
