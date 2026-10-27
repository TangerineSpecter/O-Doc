import type {CombinationPart} from '../../../types/api/quantCombination';
import {readCombinationAnalysis} from '../../../utils/quantCombination';
import {attemptNames, operationNames, percent} from './readout';

const delta = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)} 个百分点`;
export function WindowPart({value, title}: {value: CombinationPart; title: string}) {
    const span = value.ranges[2];
    return <div className="min-w-0 space-y-3 rounded-xl bg-slate-50 p-4">
        <h6 className="text-xs font-semibold text-slate-700">{title} · {value.status === 'comparable' ? '同区间可比' : '尚不可比'}</h6>
        <p className="break-words text-xs text-slate-500">{span ? `${span.start} — ${span.end} · ${span.bars} 个区间` : '缺少本次计算区间'}</p>
        <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-left text-xs"><thead><tr>{['方案', '收益', '最大回撤', '换手'].map(label => <th key={label} className="whitespace-nowrap pb-2 pr-4 font-medium text-slate-400">{label}</th>)}</tr></thead><tbody>{value.values.map((row, index) => <tr key={index}>{[index < 2 ? `父代 ${index + 1}` : '组合', percent(row?.total_return), percent(row?.max_drawdown), row ? row.turnover.toFixed(3) : '未知'].map((cell, col) => <td key={col} className="whitespace-nowrap border-t border-slate-200 py-2 pr-4 tabular-nums">{cell}</td>)}</tr>)}</tbody></table></div>
        {value.deltas ? <div className="space-y-1 text-xs leading-6 text-slate-600"><p>收益相对较高父代：{delta(value.deltas.return_over_best_parent)}</p><p>回撤相对较低父代：{delta(value.deltas.drawdown_over_lower_parent)}</p><p>换手相对父代 1 / 2：{value.deltas.versus_parents.map(row => `${row.turnover > 0 ? '+' : ''}${row.turnover.toFixed(3)}`).join(' / ')}</p></div> : <p className="text-xs text-amber-700">{{missing_metrics: '父代或组合缺少完整指标，增量未知。', window_mismatch: '评价区间不一致，不能计算增量。', parent_scope_mismatch: '父代缺失或不属于同一外折，增量未知。'}[value.reason] || '对照缺失，增量未知。'}</p>}
        {value.labels && <p className="text-xs leading-6 text-slate-600">标签 Rank IC 相对父代 1 / 2：{value.labels.versus_parents?.map(row => row.spearman_ic.toFixed(4)).join(' / ') || '未知'}。标签相关与成交收益分别评价。</p>}
    </div>;
}
export function CombinationAnalysis({json, demo, selectAttempt}: {json?: string; demo: boolean; selectAttempt: (id: string) => void}) {
    let value;
    try {value = readCombinationAnalysis(json);} catch {return <p role="alert" className="text-sm text-amber-700">组合对照记录暂时无法读取，请刷新或升级客户端。原实验仍保留。</p>;}
    if (!value) return null;
    return <section className="min-w-0 space-y-4 border-t border-slate-100 pt-5">
        <div><h4 className="text-sm font-semibold text-slate-800">组合带来了什么 · {value.groups.length} 项对照</h4><p className="mt-2 text-xs leading-6 text-slate-500">{demo ? '人工构造的本地样例；' : ''}同一实验、相同成本下比较两个直接父代与组合，仅使用训练和验证段。收益差越高表示收益增加；回撤差为正表示回撤增加。仍需新数据验证。</p></div>
        {!value.groups.length && <p className="text-sm text-slate-400">本轮尚无双父代组合，组合价值未知。增加组合尝试后可查看对照。</p>}
        {value.groups.map(group => <details key={group.id} className="min-w-0 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer break-words text-sm font-medium text-slate-700">{group.outer_fold ? `第 ${group.outer_fold} 折 · ` : ''}{group.attempt_id} · {operationNames[group.operation] || group.operation} · {attemptNames[group.status] || group.status}</summary><div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">{[...group.parent_ids, group.attempt_id].map((id, index) => <button key={`${index}-${id}`} className="break-all rounded-full bg-orange-50 px-3 py-2 text-orange-700" onClick={() => selectAttempt(id)}>{index < 2 ? `父代 ${index + 1}` : '组合'} · {id}</button>)}</div>
            <p className="break-words text-xs leading-6 text-slate-500">{group.parents.map((row, index) => `父代 ${index + 1}：${attemptNames[row.status] || row.status}${row.reason ? `（${row.reason}）` : ''}`).join('；')}。{group.reason}</p>
            {group.windows.map(window => <div key={window.inner_fold ?? 'single'} className="space-y-3">{window.inner_fold && <h5 className="text-xs font-semibold text-slate-700">内层窗口 {window.inner_fold}</h5>}<div className="grid min-w-0 gap-3 xl:grid-cols-2"><WindowPart title="训练段" value={window.parts.train}/><WindowPart title="验证段" value={window.parts.validation}/></div></div>)}
        </div></details>)}
    </section>;
}
