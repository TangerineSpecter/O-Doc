import {rankIC} from '../../../utils/quantLabelSearch';
import type {InnerEvaluation} from '../../../utils/quantNested';
import {percent} from './readout';

export function InnerValidation({value}: {value?: InnerEvaluation}) {
    if (!value) return null;
    return <section className="space-y-3" aria-label="当前尝试内层验证"><h5 className="text-sm font-semibold text-slate-800">内层验证 · 已启动 {value.folds.length} / {value.planned} 折</h5>
        {value.labelSummary?<p className="text-xs leading-6 text-slate-600">选择使用完整标签均值：训练 Rank IC {rankIC(value.labelSummary.train.spearman_ic)}；验证 Rank IC {rankIC(value.labelSummary.validation.spearman_ic)}。下表成交收益仅作对照。</p>:value.summary ? <p className="text-xs leading-6 text-slate-600">选择使用：训练收益均值 {percent(value.summary.train.totalReturn)}；验证收益均值 {percent(value.summary.validation.totalReturn)}，验证回撤均值 {percent(value.summary.validation.maxDrawdown)}。这些是各段算术均值，不是连续净值。</p> : <p className="text-xs leading-6 text-slate-500">尚无完整内层汇总；此尝试不参与候选选择。</p>}
        <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-right text-xs tabular-nums"><caption className="sr-only">各内层窗口的实际评价指标</caption><thead><tr>{['内层折 / 验证区间', '训练收益', '验证收益', '验证回撤', '验证入场 / 缺失'].map(title => <th className="whitespace-nowrap border-b border-slate-200 px-2 py-3 font-medium text-slate-500" key={title}>{title}</th>)}</tr></thead><tbody>{value.folds.map(row => <tr key={row.number}><td className="whitespace-nowrap px-2 py-3 text-left">第 {row.number} 折<p className="text-slate-500">{row.validation ? `${row.validation.start.slice(0, 10)} — ${row.validation.end.slice(0, 10)}` : '验证尚未完成'}</p></td><td className="px-2">{percent(row.train?.totalReturn)}</td><td className="px-2">{percent(row.validation?.totalReturn)}</td><td className="px-2">{percent(row.validation?.maxDrawdown)}</td><td className="whitespace-nowrap px-2">{row.validation ? `${row.validation.entries} / ${row.validation.missingSignals ?? '未知'}` : '—'}</td></tr>)}</tbody></table></div>
        <p className="text-xs leading-6 text-slate-500">每段独立空仓起止；内层历史可重叠。本尝试的执行摘要及单/联合敏感度描述最后已启动内层；全部窗口参数复核另列共同支持与缺测，选参数仍使用完整内层均值。</p>
    </section>;
}
