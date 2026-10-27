import type {QuantReport} from '../../../types/api/quant';

export function ReportScore({report}:{report:QuantReport}) {
    const data=report.data;
    if(!data.scores)return null;
    return <section className="mb-6 rounded-xl border border-slate-200 p-4" aria-label="研究评分与依据">
        <div className="mb-3 flex flex-wrap items-baseline gap-3"><strong className="text-2xl font-semibold tabular-nums text-slate-900">{data.totalScore??'—'}</strong>
            <span className="text-sm text-slate-600">/ 100 · {report.schemaVersion===4?'AI 实验研究评价':'AI 原稿研究质量分'}</span></div>
        <p className="mb-3 text-xs leading-6 text-slate-500">按五维等权汇总；缺少证据时不计算总分。这是研究评价，不代表盈利能力；人工编辑正文不会改变原始评分。</p>
        <div className="divide-y divide-slate-100">{data.scores.map(item=><details key={item.dimension} className="py-2.5">
            <summary className="cursor-pointer text-sm leading-6"><span className="ml-1 inline-flex w-[calc(100%-1.5rem)] justify-between gap-3 align-top"><span>{item.dimension}</span><span className="shrink-0 tabular-nums text-slate-600">{item.score===null?'未评估':`${item.score} / 5`}</span></span></summary>
            <div className="mt-2 space-y-2 text-xs leading-6 text-slate-600"><p className="whitespace-pre-wrap break-words">评分理由：{item.reason}</p><p className="whitespace-pre-wrap break-words">依据与未知项：{item.evidence}</p></div>
        </details>)}</div>
    </section>;
}
