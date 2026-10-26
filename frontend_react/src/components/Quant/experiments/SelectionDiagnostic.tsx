import type {QuantSelectionDiagnosticRecord} from '../../../types/api/quantSelectionDiagnostic';
import {readSelectionDiagnostic} from '../../../utils/quantSelectionDiagnostic';
import {SearchHistory} from './SearchHistory';
const pct=(value:number|null)=>value===null?'未知':`${(value*100).toFixed(1)}%`;
const reasons:Record<string,string>={insufficient_distinct_candidates:'可评价的不同候选不足2项',insufficient_development_intervals:'开发收益区间不足40段',all_combinations_ambiguous:'全部重组组合存在并列或中位歧义',budget_stopped:'本轮计算预算已耗尽',cancelled:'诊断已停止',development_replay_unavailable:'开发收益暂无法完整重放'};
export function SelectionDiagnostic({record,requestId}: {record?:QuantSelectionDiagnosticRecord|null;requestId:string}) {
    if(!record)return <p className="text-xs leading-6 text-slate-500">此记录尚无搜索选择诊断；历史结果不会在读取时自动重算。</p>;
    let data:ReturnType<typeof readSelectionDiagnostic>;
    try{data=readSelectionDiagnostic(record.dataJson,requestId);}catch{return <p role="alert" className="text-xs text-amber-800">搜索选择诊断的版本或数值无法读取，原始实验记录仍保留。</p>;}
    return <section className="min-w-0 space-y-3 border-t border-slate-100 pt-5" aria-label="搜索选择与过拟合诊断"><h4 className="text-sm font-semibold text-slate-800">搜索次数与选择反转</h4>
        {data.local_demo && <p className="text-xs text-amber-800">人工分块收益样例，未计算导入行情或调用模型。</p>}
        {data.search_history?<SearchHistory value={data.search_history}/>:<p className="text-xs leading-6 text-slate-500">这份历史诊断仅记录单次请求，未包含跨请求累计次数。</p>}
        <p className="text-xs leading-6 text-slate-500">把本次固定候选在开发期的净收益分成8块，比较70种对半组合：前半组选出的赢家，在另一半是否落到候选中位以下。它不参与实际选优，也不使用最终留出期。</p>
        {data.families.map((family,i)=><div key={family.fold ?? i} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs leading-6">
            <p className="font-medium text-slate-700">{family.fold?`第${family.fold}折`:'本批搜索家族'} · 尝试{family.attempted}次 · 不同可评价候选{family.distinct_evaluated}项 · 未通过{family.status_counts.rejected}次</p>
            {family.analysis?<><div className="grid gap-3 sm:grid-cols-3">{[['已判定组合中的落后占比',pct(family.analysis.reversal_fraction_resolved)],['计入歧义后的范围',`${pct(family.analysis.ambiguity_lower)}–${pct(family.analysis.ambiguity_upper)}`],['落后 / 保持 / 歧义',`${family.analysis.reversal_count} / ${family.analysis.retained_count} / ${family.analysis.ambiguous_count}`]].map(([label,value])=><div key={label} className="rounded-lg bg-white p-3"><p className="text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>)}</div>
                <p>使用{family.analysis.used_intervals}段开发收益；按固定规则去掉最早余数{family.analysis.dropped_oldest_intervals}段。歧义范围不是统计置信区间。</p></>:<p>{reasons[family.reason] || '证据不足'}；未知不按零风险处理。</p>}
            {family.reason==='all_combinations_ambiguous' && <p className="text-amber-800">{reasons[family.reason]}，不能据此判断风险低。</p>}
            <details><summary className="cursor-pointer text-orange-700">查看家族范围与边界</summary><div className="mt-2 space-y-2"><p className="break-all font-mono">{family.attempt_ids.join('、')}</p>{data.limitations.map(text=><p key={text}>{text}</p>)}</div></details>
        </div>)}
        <p className="text-xs leading-6 text-slate-500">低反转率不证明盈利、显著性或独立验证；{data.search_history?'记账范围之外':'其他请求和外部未记录'}的试验次数仍未知。</p>
    </section>;
}
