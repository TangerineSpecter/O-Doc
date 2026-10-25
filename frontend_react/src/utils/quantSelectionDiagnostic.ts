import type {QuantSelectionDiagnostic,SelectionSplit} from '../types/api/quantSelectionDiagnostic';
export const selectionPolicy={version:1,blocks:8,minimum_block_intervals:5,score:'arithmetic_mean_cost_adjusted_return',tie_absolute_tolerance:1e-12,maximum_candidates:32,maximum_intervals:20000,remainder:'drop_oldest_development_intervals'};
const finite=(v:unknown):v is number=>typeof v==='number' && Number.isFinite(v);
const count=(v:unknown):v is number=>finite(v) && Number.isSafeInteger(v) && v>=0;
const ids=(v:unknown):v is string[]=>Array.isArray(v) && v.every(id=>typeof id==='string' && id.length>0 && id.length<=80) && new Set(v).size===v.length;
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);

export function analyzeSelectionBlocks(means:Record<string,number[]>) {
    const keys=Object.keys(means),epsilon=selectionPolicy.tie_absolute_tolerance;
    if (keys.length<2 || keys.length>32 || keys.some(key=>!key || means[key].length!==8 || means[key].some(v=>!finite(v)))) throw new Error('选择诊断需要2–32条对齐的八块有限收益');
    const splits:SelectionSplit[]=[];
    for (let mask=0;mask<256;mask++) {
        const chosen=Array.from({length:8},(_,i)=>i).filter(i=>(mask&(1<<i))!==0);if(chosen.length!==4)continue;
        const other=Array.from({length:8},(_,i)=>i).filter(i=>!chosen.includes(i));
        const score=(key:string,blocks:number[])=>blocks.reduce((sum,i)=>sum+means[key][i],0)/4;
        const best=Math.max(...keys.map(key=>score(key,chosen))),winners=keys.filter(key=>Math.abs(score(key,chosen)-best)<=epsilon).sort();
        const row:SelectionSplit={in_blocks:chosen,winner_ids:winners,relative_oos_rank:null,logit:null,status:'ambiguous_is_tie'};
        if(winners.length===1) {
            const selected=score(winners[0],other),outside=keys.map(key=>score(key,other));
            const below=outside.filter(v=>v<selected-epsilon).length,equal=outside.filter(v=>Math.abs(v-selected)<=epsilon).length;
            const rank=(1+below+(equal-1)/2)/(keys.length+1);
            Object.assign(row,{relative_oos_rank:rank,logit:Math.log(rank/(1-rank)),status:Math.abs(rank-.5)<=epsilon?'ambiguous_oos_median':rank<.5?'reversal':'retained'});
        }
        splits.push(row);
    }
    // Python combinations are lexicographic, independent of bit-mask enumeration.
    splits.sort((a,b)=>{for(let i=0;i<4;i++)if(a.in_blocks[i]!==b.in_blocks[i])return a.in_blocks[i]-b.in_blocks[i];return 0;});
    const reversal=splits.filter(v=>v.status==='reversal').length,retained=splits.filter(v=>v.status==='retained').length,ambiguous=70-reversal-retained;
    return {status:reversal+retained?'completed':'insufficient',combinations:70,reversal_count:reversal,retained_count:retained,ambiguous_count:ambiguous,
        reversal_fraction_resolved:reversal+retained?reversal/(reversal+retained):null,ambiguity_lower:reversal/70,ambiguity_upper:(reversal+ambiguous)/70,
        bounds_kind:'unresolved_combinations_not_confidence_interval',block_means:means,splits};
}
function same(a:unknown,b:unknown,key=''):boolean {
    if(finite(a) && finite(b) && ['relative_oos_rank','logit','reversal_fraction_resolved','ambiguity_lower','ambiguity_upper'].includes(key)) return Math.abs(a-b)<=1e-12;
    if(Array.isArray(a) && Array.isArray(b))return a.length===b.length && a.every((v,i)=>same(v,b[i],key));
    if(object(a) && object(b))return Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|') && Object.keys(a).every(k=>same(a[k],b[k],k));
    return a===b;
}
export function readSelectionDiagnostic(raw:string,requestId:string):QuantSelectionDiagnostic {
    if(raw.length>300000)throw new Error('选择诊断超过读取上限');
    const value=JSON.parse(raw) as QuantSelectionDiagnostic;
    if(!object(value) || value.version!==1 || value.method!=='cscv-fixed-family-mean-net-v1' || !same(value.policy,selectionPolicy) || value.scope!=='one_recorded_request_per_fold_fixed_development_family' || value.final_holdout_used!==false || value.independent_validation!==false || !object(value.binding) || value.binding.request_id!==requestId || Object.values(value.binding).some(v=>typeof v!=='string' || !v) || !Array.isArray(value.limitations) || value.limitations.some(v=>typeof v!=='string') || !Array.isArray(value.families) || value.families.length>5)throw new Error('选择诊断版本、来源或独立性声明无效');
    for(const family of value.families) {
        if(!object(family) || !(family.fold===null || count(family.fold) && family.fold>=1 && family.fold<=5) || !ids(family.attempt_ids) || !ids(family.evaluated_ids) || family.attempt_ids.length>32 || family.attempted!==family.attempt_ids.length || !object(family.status_counts) || !same(Object.keys(family.status_counts).sort(),['budget_stopped','cancelled','evaluated','rejected']) || Object.values(family.status_counts).some(v=>!count(v)) || Object.values(family.status_counts).reduce((a,b)=>a+b,0)!==family.attempted || !count(family.distinct_evaluated) || !count(family.evaluated_duplicates) || family.distinct_evaluated+family.evaluated_duplicates!==family.status_counts.evaluated || family.evaluated_ids.length!==family.distinct_evaluated || family.evaluated_ids.some(id=>!family.attempt_ids.includes(id)) || !object(family.partitions))throw new Error('搜索家族计数或尝试清单不一致');
        for(const part of ['train','validation'] as const) {const bounds=family.partitions[part];if(!Array.isArray(bounds) || bounds.length!==2 || !bounds.every(count) || bounds[1]<=bounds[0])throw new Error('开发区间无效');}
        const n=Object.values(family.partitions).reduce((sum,bounds)=>sum+bounds[1]-bounds[0],0);
        if(family.analysis!==null) {
            const a=family.analysis;
            if(!object(a) || !object(a.block_means) || !same(Object.keys(a.block_means).sort(),[...family.evaluated_ids].sort()) || !Object.values(a.block_means).every(v=>Array.isArray(v) && v.length===8 && v.every(finite)) || a.available_intervals!==n || a.used_intervals!==Math.floor(n/8)*8 || a.dropped_oldest_intervals!==n%8 || a.block_intervals!==Math.floor(n/8) || a.block_intervals<5 || n>20000 || typeof family.matrix_hash!=='string' || !/^[a-f0-9]{64}$/.test(family.matrix_hash))throw new Error('选择诊断的矩阵范围无效');
            const expected={available_intervals:n,used_intervals:Math.floor(n/8)*8,dropped_oldest_intervals:n%8,block_intervals:Math.floor(n/8),...analyzeSelectionBlocks(a.block_means)};
            if(!same(a,expected) || family.status!==a.status || family.reason!==(a.status==='insufficient'?'all_combinations_ambiguous':''))throw new Error('选择诊断排名或歧义界不一致');
        } else if(family.status!=='insufficient' || family.matrix_hash!==null || !['insufficient_distinct_candidates','insufficient_development_intervals','budget_stopped','cancelled','development_replay_unavailable'].includes(family.reason))throw new Error('未知诊断不能携带计算结论');
    }
    const completed=value.families.filter(f=>f.status==='completed').length;
    if(value.status!==(completed && completed===value.families.length?'completed':completed?'partial':'insufficient'))throw new Error('选择诊断汇总状态不一致');
    return value;
}
