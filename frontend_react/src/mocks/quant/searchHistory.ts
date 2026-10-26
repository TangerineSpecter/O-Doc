/** Same simulated account only. Counts saved artificial attempts; no price/source execution. */
import type {MockExperiment} from './experiments';
import type {QuantSearchHistory,SearchHistoryRequest,SearchAttemptStatus} from '../../types/api/quantSearchHistory';
import {quantState} from './state';
const statuses:SearchAttemptStatus[]=['evaluated','rejected','cancelled','budget_stopped'];
export function mockSearchHistory(current:MockExperiment):QuantSearchHistory {
    const state=quantState(),target=state.datasets.find(row=>row.data.id===current.input.datasetId)!.data;
    const eligible=state.experiments.filter(row=>{const market=state.datasets.find(d=>d.data.id===row.input.datasetId)?.data;return market?.symbol===target.symbol && market.timeframe===target.timeframe;});
    const peers=eligible.filter(row=>row!==current).sort((a,b)=>b.data.createdAt.localeCompare(a.data.createdAt)||a.data.id.localeCompare(b.data.id));
    const records:SearchHistoryRequest[]=[];let size=0;
    for(const record of [current,...peers.slice(0,199)]) {
        const points=JSON.parse(record.data.attemptsJson || '[]') as {id:string;status:SearchAttemptStatus}[];
        const row:SearchHistoryRequest={request_id:record.data.id,request_hash:'a'.repeat(64),collection_id:record.collection,
            dataset_id:record.input.datasetId,dataset_hash:'b'.repeat(64),created_at:record.data.createdAt,candidate_budget:record.input.config.maxCandidates,
            outcome:['completed','partial','cancelled','failed'].includes(record.data.status)?{id:`result-${record.data.id}`,content_hash:'c'.repeat(64),status:record.data.status as 'completed'|'partial'|'cancelled'|'failed'}:null,
            checkpoints:points.map((point,i)=>({id:`${record.data.id}-${i+1}`,ordinal:i+1,content_hash:'d'.repeat(64),status:point.status}))};
        const length=JSON.stringify(row).length;if(size+length>160000)break;size+=length;records.push(row);
    }
    records.sort((a,b)=>a.request_id.localeCompare(b.request_id));
    const counts=Object.fromEntries(statuses.map(status=>[status,records.reduce((n,row)=>n+row.checkpoints.filter(p=>p.status===status).length,0)])) as QuantSearchHistory['status_counts'];
    return {version:1,scope:'same_owner_private_quant_exact_symbol_timeframe_requests_v1',market:{symbol:target.symbol,timeframe:target.timeframe},
        current_request_id:current.data.id,observed_at:new Date().toISOString(),scan_limit:200,max_chars:160000,eligible_requests:eligible.length,
        complete_scan:records.length===eligible.length,request_count:records.length,attempt_count:Object.values(counts).reduce((a,b)=>a+b,0),status_counts:counts,
        reserved_candidate_budget:records.reduce((n,row)=>n+row.candidate_budget,0),without_published_result:records.filter(row=>!row.outcome).length,
        manifest:records,external_trials:'unattested',independent_validation:false,limitations:[
            '纯local同一模拟账号、精确标的与周期的人工尝试记账；未计算导入行情或调用模型。',
            '相同配方重复尝试仍逐次计数；失败、取消和未完成请求的已保存尝试保留。没有保存记录不证明从未执行。',
            '预约上限不是实际尝试或剩余额度；同市场归集不等于同一假设，不合并收益、扩大本次CSCV或证明显著性。',
            '外部、其他别名/周期和未同步设备未知，完整独立性未证明。']};
}
export function mockHistoryFacts(value:QuantSearchHistory) {
    return {version:value.version,scope:value.scope,market:value.market,observedAt:value.observed_at,completeScan:value.complete_scan,
        eligibleRequests:value.eligible_requests,requestCount:value.request_count,attemptCount:value.attempt_count,
        statusCounts:{evaluated:value.status_counts.evaluated,rejected:value.status_counts.rejected,cancelled:value.status_counts.cancelled,budgetStopped:value.status_counts.budget_stopped},
        reservedCandidateBudget:value.reserved_candidate_budget,withoutPublishedResult:value.without_published_result,externalTrials:value.external_trials,independentValidation:false as const};
}
export function mockHistoryMarkdown(value?:ReturnType<typeof mockHistoryFacts>) {
    if(!value)return '';
    return `\n\n### 跨请求尝试记录\n\n人工样例：${value.market.symbol} / ${value.market.timeframe}，已记录${value.requestCount}个请求、${value.attemptCount}次尝试（含本次）。\n\n已评价${value.statusCounts.evaluated}；未通过${value.statusCounts.rejected}；取消${value.statusCounts.cancelled}；预算停止${value.statusCounts.budgetStopped}。\n\n${value.completeScan?'已扫描记录均纳入。':'扫描未完整覆盖，次数仅为已记录下限。'}预约候选上限合计${value.reservedCandidateBudget}，不是实际次数或剩余额度；未证明显著性或独立性。`;
}
