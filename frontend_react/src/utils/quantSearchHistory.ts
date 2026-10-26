import type {QuantSearchHistory,SearchStatusCounts,SearchAttemptStatus} from '../types/api/quantSearchHistory';
const states:SearchAttemptStatus[]=['evaluated','rejected','cancelled','budget_stopped'];
const count=(v:unknown):v is number=>typeof v==='number' && Number.isSafeInteger(v) && v>=0;
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string' && v.length>0 && v.length<=80;
const marketText=(v:unknown):v is string=>typeof v==='string' && v.length>0 && v.length<=300;
const time=(v:unknown):v is string=>typeof v==='string' && Number.isFinite(Date.parse(v));
const hash=(v:unknown):v is string=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
export function readSearchHistory(raw:unknown,requestId:string):QuantSearchHistory {
    if(!object(raw))throw new Error('跨请求记账格式无效');
    const v=raw as unknown as QuantSearchHistory;
    if(v.version!==1 || v.scope!=='same_owner_private_quant_exact_symbol_timeframe_requests_v1' || !object(v.market) || !marketText(v.market.symbol) || !marketText(v.market.timeframe) || v.current_request_id!==requestId || !time(v.observed_at) || v.scan_limit!==200 || v.max_chars!==160000 || !count(v.eligible_requests) || typeof v.complete_scan!=='boolean' || !Array.isArray(v.manifest) || v.manifest.length>200 || v.request_count!==v.manifest.length || v.eligible_requests<v.request_count || v.complete_scan!==(v.eligible_requests===v.request_count) || v.external_trials!=='unattested' || v.independent_validation!==false || !Array.isArray(v.limitations) || v.limitations.some(t=>typeof t!=='string'))throw new Error('跨请求记账版本或范围无效');
    const counts:SearchStatusCounts={evaluated:0,rejected:0,cancelled:0,budget_stopped:0};let budget=0,unpublished=0;
    const requests=new Set<string>();
    for(const row of v.manifest) {
        if(!object(row) || !id(row.request_id) || requests.has(row.request_id) || !hash(row.request_hash) || !id(row.collection_id) || !id(row.dataset_id) || !hash(row.dataset_hash) || !time(row.created_at) || Date.parse(row.created_at)>Date.parse(v.observed_at) || !count(row.candidate_budget) || row.candidate_budget<1 || row.candidate_budget>32 || !Array.isArray(row.checkpoints) || row.checkpoints.length>32)throw new Error('跨请求记录来源无效');
        requests.add(row.request_id);budget+=row.candidate_budget;
        if(row.outcome===null)unpublished++;
        else if(!object(row.outcome) || !id(row.outcome.id) || !hash(row.outcome.content_hash) || !['completed','partial','failed','cancelled'].includes(row.outcome.status))throw new Error('跨请求成果无效');
        const points=new Set<string>();let ordinal=0;
        for(const point of row.checkpoints) {
            if(!object(point) || !id(point.id) || points.has(point.id) || !count(point.ordinal) || point.ordinal<=ordinal || point.ordinal>32 || !hash(point.content_hash) || !states.includes(point.status))throw new Error('跨请求尝试清单无效');
            ordinal=point.ordinal;points.add(point.id);counts[point.status]++;
        }
    }
    if(!requests.has(requestId) || [...requests].sort().join('|')!==v.manifest.map(row=>row.request_id).join('|') || !object(v.status_counts) || Object.keys(v.status_counts).sort().join('|')!==[...states].sort().join('|') || states.some(s=>v.status_counts[s]!==counts[s]) || v.attempt_count!==Object.values(counts).reduce((a,b)=>a+b,0) || v.reserved_candidate_budget!==budget || v.without_published_result!==unpublished)throw new Error('跨请求次数或覆盖状态不一致');
    return v;
}
