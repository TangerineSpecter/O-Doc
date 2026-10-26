/** Artificial block means for UI only. Never derives returns from imported prices. */
import type {MockExperiment} from './experiments';
import type {QuantSelectionDiagnostic,SelectionFamily,SelectionAnalysis} from '../../types/api/quantSelectionDiagnostic';
import {analyzeSelectionBlocks,selectionPolicy} from '../../utils/quantSelectionDiagnostic';
import {quantState,quantId} from './state';
export function mockSelectionDiagnostic(record:MockExperiment) {
    const output=JSON.parse(record.data.resultJson!).output;
    const count=quantState().datasets.find(row=>row.data.id===record.input.datasetId)!.data.rowCount;
    const schedules=output.walk_forward?.folds || [{number:null,partitions:{train:[1,Math.max(2,Math.floor(count*.6))],validation:[Math.max(4,Math.floor(count*.6)+2),Math.max(5,Math.floor(count*.8))]},attempt_ids:output.attempts.map((r:{id:string})=>r.id)}];
    const families:SelectionFamily[]=schedules.map((schedule:{number:number|null;partitions:SelectionFamily['partitions'];attempt_ids:string[]})=>{
        const attempts=output.attempts.filter((row:{id:string})=>schedule.attempt_ids.includes(row.id)) as {id:string;status:string}[];
        const evaluated=attempts.filter(row=>row.status==='evaluated'),p=schedule.partitions;
        const n=p.train[1]-p.train[0]+p.validation[1]-p.validation[0];
        const means=Object.fromEntries(evaluated.map((row,i)=>[row.id,Array.from({length:8},(_,b)=>(b<4)===(i%2===0)?.02:-.01)]));
        const analysis=evaluated.length>=2 && n>=40?{available_intervals:n,used_intervals:Math.floor(n/8)*8,dropped_oldest_intervals:n%8,block_intervals:Math.floor(n/8),...analyzeSelectionBlocks(means)} as SelectionAnalysis:null;
        return {fold:schedule.number,attempt_ids:attempts.map(row=>row.id),attempted:attempts.length,
            status_counts:Object.fromEntries(['evaluated','rejected','cancelled','budget_stopped'].map(status=>[status,attempts.filter(row=>row.status===status).length])) as SelectionFamily['status_counts'],
            distinct_evaluated:evaluated.length,evaluated_duplicates:0,evaluated_ids:evaluated.map(row=>row.id),partitions:{train:p.train,validation:p.validation},
            status:analysis?.status || 'insufficient',reason:analysis?(analysis.status==='insufficient'?'all_combinations_ambiguous':''):evaluated.length<2?'insufficient_distinct_candidates':'insufficient_development_intervals',matrix_hash:analysis?'a'.repeat(64):null,analysis};
    });
    const done=families.filter(row=>row.status==='completed').length;
    const data:QuantSelectionDiagnostic={local_demo:true,version:1,method:'cscv-fixed-family-mean-net-v1',policy:selectionPolicy,
        scope:'one_recorded_request_per_fold_fixed_development_family',status:done && done===families.length?'completed':done?'partial':'insufficient',families,final_holdout_used:false,independent_validation:false,
        limitations:['纯local人工收益块只用于界面验证，没有执行源公式、读取价格收益或调用模型。','并列组合保留歧义；范围不是置信区间，低反转率不证明盈利或显著性。'],
        binding:{request_id:record.data.id,request_hash:record.data.contentHash,result_id:`result-${record.data.id}`,result_hash:'artificial-local-result',dataset_hash:'artificial-local-dataset'}};
    if (record.input.config.walkForward?.version === 2) data.limitations.push('仅针对各外折最后内层窗口的人工固定家族样例，不覆盖整个嵌套搜索或跨请求校正。');
    return {id:quantId('selection-diagnostic'),contentHash:'artificial-local-diagnostic',createdAt:new Date().toISOString(),dataJson:JSON.stringify(data)};
}
