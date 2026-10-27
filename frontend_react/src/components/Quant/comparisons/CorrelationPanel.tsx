import type {QuantComparison} from '../../../types/api/quantComparison';
import {useQuantCorrelation} from '../../../hooks/useQuantCorrelation';
import {readCorrelation} from '../../../utils/quantCorrelation';
import {QuantButton} from '../ui';
export function CorrelationPanel({collection,comparison,completed}:{collection:string;comparison:QuantComparison;completed:boolean}) {
    const state=useQuantCorrelation(collection,comparison);
    let evidence,error='';
    try {if(state.record)evidence=readCorrelation(state.record,comparison);}catch(cause){error=cause instanceof Error?cause.message:'统计关系无法读取';}
    const s=evidence?.statistics;
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label="固定样本相关分析">
        <h4 className="text-sm font-semibold text-slate-800">同一时点的输出相关</h4>
        <p className="text-xs leading-6 text-slate-500">使用本次固定行情、实际参数和显式预热段，只配对同一行的有效输出，不移位。相关性不证明公式等价、组合互补或收益。</p>
        {!state.record&&<QuantButton disabled={!completed||state.busy} onClick={()=>void state.create()}>{state.busy?'正在计算样本相关…':'计算并保存样本相关'}</QuantButton>}
        {!completed&&<p className="text-xs text-slate-500">完整输出对照完成后可分析；读取页面不会开始计算。</p>}
        {(state.error||error)&&<p role="alert" className="text-xs text-red-600">{state.error||error}</p>}
        {s&&<>
            {s.local_demo&&<p className="rounded-lg bg-orange-50 p-3 text-xs leading-6 text-orange-800">本地人工相关样例，未计算导入行情，也未调用模型。</p>}
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><p>Pearson <strong className="font-mono">{s.pearson??'未定义'}</strong></p><p>Spearman <strong className="font-mono">{s.spearman??'未定义'}</strong></p></div>
            <p className="text-xs leading-6 text-slate-600">共同有效 {s.counts.common_valid} / {s.counts.compared_rows} 行，覆盖 {(s.coverage*100).toFixed(1)}%；左缺失 {s.counts.left_missing}、右缺失 {s.counts.right_missing}、共同缺失 {s.counts.both_missing}。{s.status==='insufficient'?'共同有效不足30行，不提供系数。':s.status==='undefined'?'存在常量或近常量输出，保留未定义状态。':''}</p>
            <p className="text-xs leading-6 text-slate-500">{s.start} → {s.end}。Spearman 并列值取平均秩；布尔输出明确按 0/1 处理。时序配对可能重叠，不提供 p 值或独立样本量，不晋升验证等级。统计关系已保留在图谱。</p>
            <details className="text-xs text-slate-500"><summary className="cursor-pointer">统计方法、配对与版本指纹</summary><pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-all leading-6 scrollbar-hide">{JSON.stringify(evidence,null,2)}</pre></details>
        </>}
    </section>;
}
