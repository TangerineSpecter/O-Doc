import {HttpResponse} from 'msw';
import type {QuantComparisonPlan,QuantComparisonResult,QuantCorrelation,QuantCorrelationEvidence} from '../../types/api/quantComparison';
import {quantState,persistQuantState,quantId} from './state';
const fail=(status:number,msg:string)=>HttpResponse.json({code:status,msg,data:null},{status});
export async function resolveCorrelation(request:Request,collection:string,id:string) {
    if(request.method!=='POST')return fail(405,'统计关系须明确计算，读取不执行');
    const text=await request.text();try {if(text&&Object.keys(JSON.parse(text)).length)return fail(400,'只使用固定对照，不接受覆盖参数');}catch{return fail(400,'统计请求JSON无效');}
    const record=quantState().comparisons.find(row=>row.collection===collection&&row.data.id===id);
    if(!record)return fail(404,'固定对照不存在或无权访问');
    if(record.data.correlation)return structuredClone(record.data.correlation);
    const plan=JSON.parse(record.data.planJson!) as QuantComparisonPlan,result=JSON.parse(record.data.resultJson!) as QuantComparisonResult;
    if(result.evaluation_status!=='completed')return fail(400,'请先完成固定样本对照');
    const counts={total_rows:result.counts.total_rows,warmup_rows:result.counts.warmup_rows,compared_rows:result.counts.compared_rows,
        common_valid:result.counts.common_valid!,left_missing:result.counts.left_missing!,right_missing:result.counts.right_missing!,both_missing:result.counts.both_missing!};
    const known=counts.common_valid>=30,identical=result.status==='pass';
    const method='fixed-output-association-1',claim='descriptive_aligned_outputs_not_equivalence_complementarity_or_profit';
    const value:QuantCorrelationEvidence={version:1,method,claim,comparison_id:id,comparison_hash:record.data.contentHash,dataset_id:record.data.datasetId,dataset_hash:plan.dataset_hash,
        statistics:{version:1,method,claim,local_demo:true,status:known?'completed':'insufficient',reason:known?'':'fewer_than_30_common_rows',counts,
            coverage:counts.common_valid/counts.compared_rows,pearson:known?(identical?1:.72):null,spearman:known?(identical?1:.68):null,
            output_types:[plan.left.candidate.outputType||plan.left.candidate.output_type,plan.right.candidate.outputType||plan.right.candidate.output_type] as ('numeric_series'|'boolean_series')[],
            start:result.comparison_start,end:result.end,paired_start:known?result.comparison_start:null,paired_end:known?result.end:null,
            paired_indices_hash:'local-demo-paired-indices',output_hashes:result.output_hashes,minimum_common_rows:30,
            inference:'no_p_value_or_independent_sample_size',alignment:'same_row_and_timestamp_no_shift_pairwise_common_finite_after_explicit_warmup'}};
    const saved:QuantCorrelation={id:quantId('correlation'),createdAt:new Date().toISOString(),contentHash:'local-demo-correlation-'+id,evidenceJson:JSON.stringify(value)};
    record.data.correlation=saved;persistQuantState();return structuredClone(saved);
}
