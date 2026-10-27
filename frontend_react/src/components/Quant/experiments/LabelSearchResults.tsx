import type {Readout,Attempt} from './readout';
import {rankIC} from '../../../utils/quantLabelSearch';
import {LabelEvaluation} from '../validations/LabelEvaluation';
export function LabelSearchResults({value,active}:{value:Readout;active?:Attempt}) {
    if(!value.labelTarget)return null;
    const rows=active?.inner?active.inner.folds.map(row=>({name:`内层 ${row.number}`,labels:row.labels})):active?[{name:active.id,labels:active.labels}]:[];
    return <section className="space-y-4 border-t border-slate-100 pt-4" aria-label="标签选择依据"><h4 className="text-sm font-semibold">标签目标 · 未来 {value.labelTarget.horizon_bars} 根收盘收益</h4>
        <p className="text-xs leading-6 text-slate-500">训练段按 Rank IC、覆盖率和复杂度保留 Pareto 候选，再按验证 Rank IC、覆盖率选择。全部内层完整后才使用均值；成交收益、敏感度和成本排名是另列观察。</p>
        {active?.inner?.labelSummary && <p className="text-xs leading-6 text-slate-600">当前尝试完整内层均值：训练 Rank IC {rankIC(active.inner.labelSummary.train.spearman_ic)}；验证 Rank IC {rankIC(active.inner.labelSummary.validation.spearman_ic)}；验证覆盖率 {(active.inner.labelSummary.validation.coverage*100).toFixed(1)}%。</p>}
        <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-right text-xs tabular-nums"><caption className="sr-only">当前尝试各窗口的标签指标</caption><thead><tr>{['窗口','Rank IC（训练 / 验证）','验证配对 / 剔除'].map(text=><th key={text} className="border-b border-slate-200 px-2 py-3 font-medium text-slate-500">{text}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.name}><td className="whitespace-nowrap px-2 py-3 text-left">{row.name}</td><td className="whitespace-nowrap px-2">{rankIC(row.labels?.train?.spearman_ic)} / {rankIC(row.labels?.validation?.spearman_ic)}</td><td className="whitespace-nowrap px-2">{row.labels?.validation?`${row.labels.validation.pairs} / ${row.labels.validation.window.purged_origins}`:'—'}</td></tr>)}</tbody></table></div>
        <p className="text-xs leading-6 text-slate-500">未定义和未完成保持未知，重叠标签不是独立样本；当前测试只对应最后已启动外折，不能按测试表现挑折。</p>
        {value.temporal && <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-right text-xs tabular-nums"><caption className="mb-2 text-left text-slate-500">各外折选择后的测试标签</caption><thead><tr>{['外折 / 固定赢家','测试 Rank IC','测试配对'].map(text=><th key={text} className="whitespace-nowrap border-b border-slate-200 px-2 py-3 font-medium text-slate-500">{text}</th>)}</tr></thead><tbody>{value.temporal.folds.map(fold=><tr key={fold.number}><td className="whitespace-nowrap px-2 py-3 text-left">{fold.number} · {fold.selectedId || '未选中'}</td><td className="px-2">{rankIC(fold.labelHoldout?.spearman_ic)}</td><td className="px-2">{fold.labelHoldout?.pairs ?? '—'}</td></tr>)}</tbody></table></div>}
        <h5 className="text-sm font-medium">{value.walkForward?'最后已启动外折的测试标签':'选择后的留出标签'}</h5>
        <LabelEvaluation purpose="test" target={value.labelTarget} value={value.labelHoldout}/>
    </section>;
}
