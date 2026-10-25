import type {QuantFactorMergeList, QuantFactorMerge} from '../../../types/api/quantComparison';
import {quantDate} from '../../../utils/quant';
import {QuantButton, cardClass} from '../ui';

export function EquivalenceGroups({value, openComparison, withdraw}: {value: QuantFactorMergeList; openComparison: (id: string) => void; withdraw: (merge: QuantFactorMerge) => void}) {
    return <section className={`${cardClass} space-y-4`} aria-label="逻辑合并与撤销历史"><div><h3 className="text-sm font-semibold">逻辑分组与直接证据</h3><p className="mt-2 text-xs leading-6 text-slate-500">主动合并边连接成分组；同组不代表任意两成员已有直接等价证据。撤销桥接关系会拆分分组，历史对照仍保留。</p></div>
        {value.group && value.group.memberIds.length > 1 && <div className="rounded-xl bg-orange-50/50 p-4 text-sm leading-7"><strong>{value.group.memberIds.length} 个成员 · {value.group.activeMergeIds.length} 条主动合并关系</strong><p className="mt-2 break-words text-xs text-slate-600">名称：{value.group.names.join('、')}{value.group.aliases.length > 0 && <><br/>别名：{value.group.aliases.join('、')}</>}</p><details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">成员与关系 ID</summary><p className="mt-2 break-all">成员：{value.group.memberIds.join('、')}<br/>主动合并：{value.group.activeMergeIds.join('、')}</p></details></div>}
        {!value.items.length && <p className="text-sm text-slate-500">尚无主动合并或撤销记录。先完成两个候选的固定样本对照。</p>}
        <div className="divide-y divide-slate-100">{value.items.map(merge => <article key={merge.id} className="space-y-3 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="break-words text-sm font-medium">{merge.name}</h4><span className={`text-xs ${merge.active ? 'text-orange-700' : 'text-slate-500'}`}>{merge.active ? '主动合并' : '已撤销'}</span></div><p className="whitespace-pre-wrap text-xs leading-6 text-slate-600">{merge.reason}</p><p className="text-xs text-slate-500">{quantDate(merge.createdAt)}</p>
            {merge.withdrawal && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">撤销：{quantDate(merge.withdrawal.createdAt)}<br/>{merge.withdrawal.reason}</p>}
            <details className="text-xs leading-6 text-slate-500"><summary className="cursor-pointer">合并时的名称、别名与记录指纹</summary><pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 scrollbar-hide">{merge.curationJson}</pre><p className="mt-2 break-all">合并记录：{merge.id}<br/>直接对照：{merge.comparisonId}<br/>内容指纹：{merge.contentHash}</p></details>
            <div className="flex flex-wrap gap-2"><QuantButton onClick={() => openComparison(merge.comparisonId)}>查看这条直接对照证据</QuantButton>{merge.active && <QuantButton onClick={() => withdraw(merge)}>撤销这条合并</QuantButton>}</div>
        </article>)}</div>
        {value.total > value.items.length && <p className="text-xs leading-6 text-slate-500">当前页 {value.items.length} / {value.total} 条，翻页可查其余历史。</p>}
    </section>;
}
