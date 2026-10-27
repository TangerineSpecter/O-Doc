import type {QuantLabelEvaluation, QuantLabelInput, QuantLabelTarget} from '../types/api/quantLabels';
const obj=(value:unknown):Record<string,unknown>=>{if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('标签合同无效');return value as Record<string,unknown>;};
const integer=(v:unknown,min=0,max=20000):number=>{if(typeof v!=='number' || !Number.isInteger(v) || v<min || v>max)throw new Error('标签范围无效');return v;};
export function freezeLabelTarget(input:QuantLabelInput):QuantLabelTarget {
    if(input.version!==1)throw new Error('标签目标版本无效');
    return {version:1,horizon_bars:integer(input.horizonBars,1,2000),kind:'close_to_future_close_simple_return',
        formula:'close[t+horizon_bars]/close[t]-1',predictor:'closed_bar_factor_at_t',
        boundary:'purge_origins_whose_label_end_exceeds_segment_end',time_unit:'supplied_bars_not_calendar_duration',
        inference:'descriptive_no_p_value_or_independence_claim'};
}
export function readLabelTarget(raw:unknown):QuantLabelTarget {
    const value=obj(raw),expected=freezeLabelTarget({version:value.version as 1,horizonBars:value.horizon_bars as number});
    if(Object.keys(value).length!==Object.keys(expected).length || Object.entries(expected).some(([key,item])=>value[key]!==item))throw new Error('标签目标含义或边界不一致');
    return expected;
}
export function readLabelEvaluation(raw:unknown,target:QuantLabelTarget,selectionUsed=false):QuantLabelEvaluation {
    const value=obj(raw),read=readLabelTarget(value.target),bounds=obj(value.window);
    const start=integer(bounds.start),end=integer(bounds.end),last=integer(bounds.last_origin);
    const possible=integer(bounds.possible_pairs,5),purged=integer(bounds.purged_origins,1,2000);
    const pairs=integer(value.pairs),missing=integer(value.missing_predictors);
    const coefficient=(v:unknown)=>v===null || typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=1;
    const times=[value.start_timestamp,value.end_timestamp,value.last_origin_timestamp];
    const validTimes=times.every(t=>typeof t==='string' && Number.isFinite(Date.parse(t)));
    if(read.horizon_bars!==target.horizon_bars || value.version!==(selectionUsed?2:1) || last!==end-target.horizon_bars || last<start
        || possible!==last-start+1 || purged!==target.horizon_bars || bounds.rule!==target.boundary || pairs+missing!==possible
        || typeof value.coverage!=='number' || !Number.isFinite(value.coverage) || Math.abs(value.coverage-pairs/possible)>1e-12
        || !coefficient(value.pearson_ic) || !coefficient(value.spearman_ic) || !validTimes
        || Date.parse(String(times[0]))>Date.parse(String(times[2])) || Date.parse(String(times[2]))>=Date.parse(String(times[1]))
        || value.independent_observations!==null || value.p_value!==null || value.selection_used!==selectionUsed
        || typeof value.pairs_hash!=='string' || !/^[a-f0-9]{64}$/.test(value.pairs_hash)
        || !Array.isArray(value.limitations) || value.limitations.some(t=>typeof t!=='string'))throw new Error('标签评价数值或范围无效');
    const reason=pairs<5?'too_few_valid_pairs':value.pearson_ic===null || value.spearman_ic===null?'constant_or_near_constant_input':'';
    if(value.reason!==reason || value.status!==(reason?'insufficient':'completed') || pairs<5 && (value.pearson_ic!==null || value.spearman_ic!==null))throw new Error('标签评价状态不一致');
    return value as unknown as QuantLabelEvaluation;
}
