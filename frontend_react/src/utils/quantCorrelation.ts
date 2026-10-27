import type {QuantComparison,QuantCorrelation,QuantCorrelationEvidence} from '../types/api/quantComparison';
import {readComparison} from './quantComparison';
const method='fixed-output-association-1',claim='descriptive_aligned_outputs_not_equivalence_complementarity_or_profit';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown):value is string=>typeof value==='string'&&!!value;
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export function readCorrelation(record:QuantCorrelation,comparison:QuantComparison):QuantCorrelationEvidence {
    const value:unknown=JSON.parse(record.evidenceJson);
    if(!object(value)||value.version!==1||value.method!==method||value.claim!==claim||value.comparison_id!==comparison.id||value.comparison_hash!==comparison.contentHash||value.dataset_id!==comparison.datasetId||!text(value.dataset_hash)||!object(value.statistics))throw new Error('统计关系与当前固定对照不一致');
    const s=value.statistics,raw=s.counts;
    const keys=['total_rows','warmup_rows','compared_rows','common_valid','left_missing','right_missing','both_missing'] as const;
    if(!object(raw)||keys.some(key=>!integer(raw[key])))throw new Error('统计配对计数缺失或无效');
    const c=raw as Record<typeof keys[number],number>;
    const original=readComparison(comparison);
    const types=[original.plan.left,original.plan.right].map(side=>side.candidate.output_type||side.candidate.outputType);
    if(value.dataset_hash!==original.plan.dataset_hash||original.result.evaluation_status!=='completed'||
        keys.some(key=>c[key]!==original.result.counts[key])||s.start!==original.result.comparison_start||s.end!==original.result.end||
        !object(s.output_hashes)||s.output_hashes.left!==original.result.output_hashes.left||s.output_hashes.right!==original.result.output_hashes.right||
        JSON.stringify(s.output_types)!==JSON.stringify(types))throw new Error('统计范围、输出或行情指纹与原始对照不同');
    readCorrelationStatistics(s);
    return value as unknown as QuantCorrelationEvidence;
}

export function readCorrelationStatistics(value: unknown): QuantCorrelationEvidence['statistics'] {
    if (!object(value)||!object(value.counts)) throw new Error('统计配对结构缺失');
    const s=value, raw=value.counts;
    const keys=['total_rows','warmup_rows','compared_rows','common_valid','left_missing','right_missing','both_missing'] as const;
    if(keys.some(key=>!integer(raw[key])))throw new Error('统计配对计数缺失或无效');
    const c=raw as Record<typeof keys[number],number>;
    if(s.version!==1||s.method!==method||s.claim!==claim||(s.local_demo!==undefined&&s.local_demo!==true)||
        c.total_rows>20000||c.warmup_rows>2000||c.compared_rows!==c.total_rows-c.warmup_rows||c.compared_rows<30||c.common_valid!==c.compared_rows-c.left_missing-c.right_missing+c.both_missing||
        c.both_missing>Math.min(c.left_missing,c.right_missing)||Math.max(c.left_missing,c.right_missing,c.common_valid)>c.compared_rows||
        typeof s.coverage!=='number'||!Number.isFinite(s.coverage)||Math.abs(s.coverage-c.common_valid/c.compared_rows)>1e-12||
        !Array.isArray(s.output_types)||s.output_types.length!==2||s.output_types.some(t=>!['numeric_series','boolean_series'].includes(t))||
        !text(s.start)||!text(s.end)||!text(s.paired_indices_hash)||!object(s.output_hashes)||!text(s.output_hashes.left)||!text(s.output_hashes.right)||
        s.minimum_common_rows!==30||s.inference!=='no_p_value_or_independent_sample_size'||s.alignment!=='same_row_and_timestamp_no_shift_pairwise_common_finite_after_explicit_warmup')throw new Error('统计关系的范围或对齐合同无法读取');
    const coefficient=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=-1&&n<=1;
    if(s.status==='completed'?(c.common_valid<30||!coefficient(s.pearson)||!coefficient(s.spearman)||s.reason!==''):
        s.status==='insufficient'?(c.common_valid>=30||s.pearson!==null||s.spearman!==null||s.reason!=='fewer_than_30_common_rows'):
        s.status==='undefined'?(c.common_valid<30||(s.pearson!==null&&!coefficient(s.pearson))||(s.spearman!==null&&!coefficient(s.spearman))||(s.pearson!==null&&s.spearman!==null)||s.reason!=='constant_or_near_constant_output'):true)throw new Error('相关系数与已知或未定义状态不一致');
    return value as unknown as QuantCorrelationEvidence['statistics'];
}
