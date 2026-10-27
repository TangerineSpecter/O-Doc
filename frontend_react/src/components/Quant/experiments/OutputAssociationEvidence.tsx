import {readOutputAssociations} from '../../../utils/quantOutputAssociations';
import {QuantButton} from '../ui';
export function OutputAssociationEvidence({json, openComparison}: {json?: string | null; openComparison?: (id: string) => void}) {
    let value;
    try {value = readOutputAssociations(json);} catch {return <p role="alert" className="text-xs text-amber-700">本次解读的历史统计清单暂时无法读取，原报告仍保留。</p>;}
    if (!value) return null;
    return <details className="min-w-0 rounded-xl border border-slate-200 bg-white p-4" aria-label="本次解读的历史输出统计">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">本次解读参考了 {value.items.length} 条固定样本统计</summary>
        <p className="mt-3 text-xs leading-6 text-slate-500">冻结于 {new Date(value.cutoff).toLocaleString()}。这是原完整对照样本的输出相关，可能包含已查看留出；不代表本轮各窗口、独立验证或组合互补，也不参与本轮选优。</p>
        {!value.complete_scan && <p className="mt-2 text-xs leading-6 text-slate-500">仅提供最近最多 8 条，至少 {value.omitted_at_least} 条未展开；不能据此推断其他候选不相关。</p>}
        {!value.items.length && <p className="mt-3 text-sm text-slate-500">本次没有符合候选与行情范围的已保存观察，相关性仍未知。</p>}
        <div className="mt-3 space-y-4">{value.items.map(row => <article key={row.relation_id} className="min-w-0 space-y-3 border-t border-slate-100 pt-4">
            <h5 className="break-words text-sm font-semibold text-slate-700">{row.comparison_name}</h5>
            <p className="text-xs leading-6 text-slate-600">Pearson：{row.statistics.pearson === null ? '未知' : row.statistics.pearson.toFixed(4)} · Spearman：{row.statistics.spearman === null ? '未知' : row.statistics.spearman.toFixed(4)}<br/>共同有效 {row.statistics.counts.common_valid} / {row.statistics.counts.compared_rows} 行 · 覆盖率 {(row.statistics.coverage * 100).toFixed(1)}% · 预热 {row.policy.warmup_bars} 行</p>
            <p className="break-words text-xs leading-6 text-slate-500">{row.dataset.symbol} / {row.dataset.timeframe}<br/>{row.statistics.start} — {row.statistics.end}</p>
            <p className={`text-xs leading-6 ${row.baseline_scope === 'historical_configuration_only' ? 'text-amber-700' : 'text-slate-600'}`}>{row.baseline_scope === 'historical_configuration_only' ? '至少一侧参数或输入与当前基线不同，系数仅限原配置。' : '两侧与当前基线参数及输入一致，仍不证明变体或本轮子窗口具有相同相关性。'}</p>
            {row.sides.map((side, index) => <div key={side.candidate_id} className="rounded-lg bg-slate-50 p-3 text-xs leading-6"><p className="break-words font-medium text-slate-700">{index ? '右侧' : '左侧'} · {side.name} · {side.current_baseline_matches ? '基线配置一致' : '历史配置'}</p><p className="break-all font-mono text-slate-600">参数：{JSON.stringify(side.parameters)}</p><p className="break-all text-slate-500">输入：{JSON.stringify(side.bindings)}</p></div>)}
            {row.statistics.local_demo && <p className="text-xs leading-6 text-slate-500">人工 local 统计样例，未计算导入行情或调用模型。</p>}
            {openComparison && <QuantButton onClick={() => openComparison(row.comparison_id)}>查看原固定对照</QuantButton>}
            <details className="text-xs text-slate-500"><summary className="cursor-pointer">原记录与数据指纹</summary><p className="mt-2 break-all leading-6">对照：{row.comparison_id}<br/>对照指纹：{row.comparison_hash}<br/>行情：{row.dataset.id}<br/>行情指纹：{row.dataset.content_hash}<br/>统计：{row.relation_id}<br/>统计指纹：{row.relation_hash}</p></details>
        </article>)}</div>
    </details>;
}
