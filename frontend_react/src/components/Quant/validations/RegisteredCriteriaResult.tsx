import type {QuantRegisteredCriteria,QuantCriteriaAssessment} from '../../../types/api/quantValidationCriteria';
import {criteriaKeys,criteriaLabels,criteriaStatusLabels,criteriaEligibilityLabels} from '../../../utils/quantValidationCriteria';

export function RegisteredCriteriaResult({criteria,assessment,currentAudit}: {criteria:QuantRegisteredCriteria;assessment?:QuantCriteriaAssessment;currentAudit?:{complete_scan:boolean;conflict_count:number}}) {
    const changed=assessment?.eligibility==='fresh_scope_criteria_met' && currentAudit && (!currentAudit.complete_scan || currentAudit.conflict_count!==0);
    const format=(value:number|null,unit:string)=>value===null?'未知':unit==='count'?String(value):`${Number((value*100).toFixed(4))}${unit==='percentage_points'?' 个百分点':'%'}`;
    return <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4" aria-label="登记标准与代码判定">
        <div><h5 className="text-sm font-semibold text-slate-800">{assessment?criteriaStatusLabels[assessment.status]:'数值标准已冻结，待计算判定'}</h5>
            <p className="mt-1 text-xs leading-6 text-slate-500">{assessment?criteriaEligibilityLabels[assessment.eligibility]:'下列已填写项须全部满足；未填写的维度没有附加要求。'}</p></div>
        <div className="grid gap-2 sm:grid-cols-2">{criteriaKeys.filter(key=>criteria[key]!==null).map(key=>{
            const row=assessment?.rules.find(item=>item.criterion===key),unit=key==='min_entries'?'count':key==='min_excess_return'?'percentage_points':'fraction';
            return <div key={key} className="min-w-0 rounded-lg border border-slate-100 bg-white p-3 text-xs leading-6">
                <p className="font-medium text-slate-700">{criteriaLabels[key]} {key==='max_drawdown'?'≤':'≥'} {format(criteria[key],unit)}</p>
                <p className="break-words text-slate-500">实测 {format(row?.observed ?? null,unit)} · {row?{met:'满足',not_met:'未满足',unknown:'证据不足'}[row.status]:'待计算'}</p>
                {row && <details open={row.status==='not_met' && format(row.observed,unit)===format(row.threshold,unit)}><summary className="cursor-pointer text-slate-400">查看精确小数与比较容差</summary><p className="break-all font-mono text-slate-500">实测 {row.observed===null?'未知':String(row.observed)} · 标准 {String(row.threshold)} · 容差 {row.tolerance}</p></details>}
            </div>;
        })}</div>
        {changed && <p role="status" className="text-xs leading-6 text-amber-800">当前重用审计已变化，现已不满足原发布时的已知新数据条件。冻结的数值判定与历史层级保留，请结合下方当前审计阅读。</p>}
        <p className="text-xs leading-6 text-slate-500">代码按冻结标准计算本次判定，AI 负责解释。结论仅限本公式、参数、费用与区间；外部数据使用、原生平台等价和跨市场稳健性仍未知。</p>
    </section>;
}
