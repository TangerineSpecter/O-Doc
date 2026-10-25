import type {FindingSeverity, QuantSourceFinding} from '../../types/api/quantFindings';

const order: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const labels: Record<FindingSeverity, string> = {critical: '严重', high: '高', medium: '中', low: '低', info: '提示'};
const fields = {code: '源码', description: '说明', web_markdown: '网页正文'};

export function SourceFindings({version, findings, note}: {version?: number; findings?: QuantSourceFinding[]; note?: string}) {
    if (version === undefined) return <p className="mb-5 text-sm leading-6 text-slate-500">这份历史报告未提供独立的问题清单，风险说明仍保留在正文中。</p>;
    if (version !== 1 || !findings || !note) return <p role="status" className="mb-5 text-sm text-orange-800">问题清单暂不可读，不能据此判断源码没有严重问题。</p>;
    const rows = [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
    const critical = rows.filter(row => row.severity === 'critical').length;
    const high = rows.filter(row => row.severity === 'high').length;
    return <div className="mb-6 rounded-xl border border-slate-200 p-4" data-source-findings>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">问题清单与严重度</h3>
            <span className="text-xs text-slate-500">AI 原稿判断 · {rows.length} 项</span>
        </div>
        {(critical > 0 || high > 0) && <p role="status" className="mt-3 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">
            {critical > 0 && `${critical} 项严重问题`}{critical > 0 && high > 0 && '，'}{high > 0 && `${high} 项高影响问题`}。研究总分不能视为通过结论，请先核对原文、影响及验证建议。
        </p>}
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{note}</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">严重度独立于五维评分。AI 对原文的判断仍需核对，不代表编译或运行验证；编辑正文不会改写这份原稿清单。</p>
        {rows.length === 0 ? <p className="mt-3 text-sm text-slate-600">本次 AI 未列出具体问题，这不证明源码没有缺陷。</p>
            : <div className="mt-4 divide-y divide-slate-100">{rows.map((row, index) => <article key={index} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3"><span className={`shrink-0 rounded px-2 py-0.5 text-xs ${row.severity === 'critical' || row.severity === 'high' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{labels[row.severity]}</span>
                    <h4 className="min-w-0 break-words text-sm font-semibold leading-6 text-slate-800">{row.title}</h4></div>
                <p className="mt-2 text-xs text-slate-500">{row.certainty === 'source_fact' ? 'AI 判定为原文事实' : '影响待验证的假设'} · 涉及{row.affectedDimensions.join('、')}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{row.impact}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">建议：{row.recommendation}</p>
                <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">查看原文依据 · {row.evidence.length} 处</summary>
                    <div className="mt-3 space-y-3">{row.evidence.map((evidence, i) => <div key={i}><p className="mb-1 text-xs text-slate-500">{fields[evidence.field]}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-700 scrollbar-hide">{evidence.quote}</pre></div>)}</div>
                </details>
            </article>)}</div>}
    </div>;
}
