/** Artificial presentation values only; no label prices or correlations are calculated. */
import type {QuantLabelEvaluation,QuantLabelTarget} from '../../types/api/quantLabels';
export function mockLabelEvaluation(target:QuantLabelTarget,intervals:number,start:string,end:string,last:string):QuantLabelEvaluation {
    const possible=intervals-target.horizon_bars+1;
    return {version:1,target,window:{start:0,end:intervals,last_origin:intervals-target.horizon_bars,
        possible_pairs:possible,purged_origins:target.horizon_bars,rule:target.boundary},
        start_timestamp:start,end_timestamp:end,last_origin_timestamp:last,pairs:possible,missing_predictors:0,coverage:1,
        pearson_ic:0.15,spearman_ic:0.2,status:'completed',reason:'',pairs_hash:'0'.repeat(64),
        independent_observations:null,p_value:null,selection_used:false,
        limitations:['人工展示样例，没有计算上传行情、标签或相关系数。','配对数不是独立样本量，IC不是收益、显著性或参数最优证明。']};
}
