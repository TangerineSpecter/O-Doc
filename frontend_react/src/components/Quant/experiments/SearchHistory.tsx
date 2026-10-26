import type {QuantSearchHistory} from '../../../types/api/quantSearchHistory';
const labels={completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消'};
export function SearchHistory({value}:{value:QuantSearchHistory}) {
    const rows=value.manifest;
    const negative=rows.find(row=>row.outcome?.status==='failed' || row.outcome?.status==='cancelled' || row.checkpoints.some(p=>p.status!=='evaluated'));
    const selected=(negative?[negative,...rows.filter(row=>row!==negative)]:rows).slice(0,12);
    return <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-6" aria-label="跨请求搜索记账">
        <h5 className="text-sm font-medium text-slate-800">同市场累计尝试</h5>
        <p className="text-slate-600">{value.market.symbol} · {value.market.timeframe} · 已记录{value.request_count}个请求、{value.attempt_count}次尝试（含本次）。{value.complete_scan?'已扫描记录均纳入。':'扫描未完整覆盖，以上只是已记录下限。'}</p>
        <p className="text-slate-600">已评价{value.status_counts.evaluated}次 · 未通过{value.status_counts.rejected}次 · 取消{value.status_counts.cancelled}次 · 预算停止{value.status_counts.budget_stopped}次。</p>
        <p className="text-slate-500">{value.without_published_result}个请求尚无发布成果；已保存尝试仍计入。候选预算合计{value.reserved_candidate_budget}，不等于实际尝试或剩余额度。</p>
        <details><summary className="cursor-pointer text-orange-700">查看跨请求范围与记录</summary><div className="mt-2 space-y-3 text-slate-500">
            {value.limitations.map(t=><p key={t}>{t}</p>)}
            {selected.map(row=><p key={row.request_id} className="break-all">{row.outcome?labels[row.outcome.status]:'尚无成果'} · {row.checkpoints.length}次已保存尝试 · {row.created_at}<br/>{row.request_id} · 文集 {row.collection_id}</p>)}
            {rows.length>selected.length && <p>另有{rows.length-selected.length}个请求未展开，完整清单随研究记录保留。</p>}
        </div></details>
    </section>;
}
