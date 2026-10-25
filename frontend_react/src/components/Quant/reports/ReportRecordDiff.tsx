import type {NamedReportChange, ReportRecordDiff} from '../../../types/quantReportDiff';
import type {QuantAnalysis} from '../../../types/api/quant';
import {factorRoles} from '../factorPresentation';
import {describeParameterDomain} from '../../../utils/quantParameterDomain';

const statuses = {added: '新增条目', removed: '移除条目', changed: '内容变化', unchanged: '相同', ambiguous: '同名多项，无法配对'};
const parameterFields: Record<string, string> = {defaultValue: '默认值', type: '类型', category: '用途', meaning: '含义/单位', constraints: '约束', effect: '影响', suggestion: '候选建议', evidence: '原文依据', domain: '结构化约束'};
const categories: Record<string, string> = {signal: '信号', risk: '仓位/风险', execution: '执行', display: '显示', constant: '写死常量', state: '内部状态'};
const severity = {critical: '严重', high: '高', medium: '中', low: '低', info: '提示'};
const score = (value?: number | null) => value === undefined || value === null ? '未评估' : String(value);
const delta = (value: number | null) => value === null ? '—' : value === 0 ? '0' : value > 0 ? `+${value}` : String(value);
const changed = <T,>(rows: NamedReportChange<T>[]) => rows.filter(row => row.status !== 'unchanged');

function ParameterCell({value}: {value?: QuantAnalysis['parameters'][number]}) {
    if (!value) return <p className="text-xs text-slate-400">此侧无对应条目</p>;
    return <div className="min-w-0 space-y-1 break-words text-xs leading-6 text-slate-600"><p>默认值：<span className="font-mono">{value.defaultValue || '未知'}</span> · {value.type} · {categories[value.category] || value.category}</p><p>{value.meaning}</p><p>约束：{value.constraints}</p><p>建议：{value.suggestion}</p>
        <details><summary className="cursor-pointer text-slate-500">影响与原文依据</summary><div className="mt-2 space-y-2 whitespace-pre-wrap"><p>变化影响：{value.effect}</p><p>依据：{value.evidence}</p>{value.domain && <p>结构化约束：{describeParameterDomain(value.name, value.domain)}</p>}</div></details>
    </div>;
}

export function ReportRecordDiff({diff}: {diff: ReportRecordDiff}) {
    const parameters = changed(diff.parameters), factors = changed(diff.factors), findings = changed(diff.findings);
    return <div className="space-y-5">
        <section className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">原稿研究评分</h4>
            <p className="text-xs leading-6 text-slate-500">评分变化只表示 AI 研究评价变化，不是收益变化。未知评分不按零分计算，分差 — 表示无法比较；正文修订不改变这些原始数值。</p>
            {!diff.scoresComparable && <p className="text-xs leading-6 text-orange-800">评分规则版本不同或未提供，展示原值，不计算分差。基准：{diff.rubricBefore || '未知'}；所选：{diff.rubricAfter || '未知'}。</p>}
            <div className="overflow-hidden rounded-lg border border-slate-200"><table className="w-full table-fixed text-xs leading-6"><thead><tr className="border-b border-slate-100 text-left text-slate-500"><th className="w-[40%] px-3 py-2 font-normal">维度</th><th className="px-1 py-2 text-right font-normal">基准</th><th className="px-1 py-2 text-right font-normal">所选</th><th className="px-3 py-2 text-right font-normal">分差</th></tr></thead><tbody>
                <tr className="border-b border-slate-100 font-medium text-slate-800"><td className="px-3 py-2">总分 / 100</td><td className="px-1 py-2 text-right tabular-nums">{score(diff.total.before)}</td><td className="px-1 py-2 text-right tabular-nums">{score(diff.total.after)}</td><td className="break-words px-3 py-2 text-right tabular-nums">{delta(diff.total.delta)}</td></tr>
                {diff.scores.map(row => <tr key={row.dimension} className="border-b border-slate-100 last:border-0"><td className="break-words px-3 py-2 text-slate-700"><details><summary className="cursor-pointer">{row.dimension} / 5</summary><div className="mt-2 space-y-2 text-slate-500"><p>基准理由：{row.before?.reason || '未提供'}<br/>依据：{row.before?.evidence || '未提供'}</p><p>所选理由：{row.after?.reason || '未提供'}<br/>依据：{row.after?.evidence || '未提供'}</p></div></details></td>
                    <td className="px-1 py-2 text-right align-top tabular-nums">{score(row.before?.score)}</td><td className="px-1 py-2 text-right align-top tabular-nums">{score(row.after?.score)}</td><td className="break-words px-3 py-2 text-right align-top tabular-nums">{delta(row.delta)}</td></tr>)}
            </tbody></table></div>
        </section>
        <section className="space-y-3"><h4 className="text-sm font-semibold text-slate-800">原稿参数与候选建议</h4>
            <p className="text-xs leading-6 text-slate-500">按大小写敏感的变量名配对；这里比较源码默认值及 AI 建议，实际运行配置仍需另行核对。</p>
            {!diff.parametersAvailable ? <p className="text-sm text-slate-500">至少一份报告未提供结构化参数，无法判断参数新增、删除或变化。</p> : !parameters.length ? <p className="text-sm text-slate-600">结构化参数记录相同。</p> : <div className="space-y-3">{parameters.map(row => <div key={row.name} className="rounded-lg border border-slate-200 p-3">
                <p className="break-all text-sm font-medium text-slate-800">{row.name} <span className="font-normal text-slate-500">· {statuses[row.status]}</span></p>
                {row.status === 'ambiguous' ? <p className="mt-2 text-xs text-orange-800">基准 {row.beforeCount} 项，所选 {row.afterCount} 项；请核对原稿，没有自动选择对应关系。</p>
                    : <><p className="mt-1 text-xs text-slate-500">{row.changedFields.map(field => parameterFields[field] || field).join('、') || '条目数量变化'}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs text-slate-400">基准</p><ParameterCell value={row.before}/></div><div><p className="mb-1 text-xs text-slate-400">所选</p><ParameterCell value={row.after}/></div></div></>}
            </div>)}</div>}
        </section>
        <section className="space-y-3"><h4 className="text-sm font-semibold text-slate-800">原稿候选与问题清单</h4>
            <p className="text-xs leading-6 text-slate-500">候选按用途和名称、问题按类别和标题配对。字面变化不证明公式等价、问题新近出现或实证表现改变。</p>
            {!diff.factorsAvailable ? <p className="text-sm text-slate-500">至少一份报告未提供候选提取记录，无法判断候选增减。</p> : !factors.length ? <p className="text-sm text-slate-600">原稿候选记录相同。</p> : <ul className="space-y-2 text-sm text-slate-700">{factors.map(row => {const item = row.after || row.before; return <li key={row.name} className="break-words"><strong className="font-medium">{item ? `${factorRoles[item.role]} · ${item.name}` : row.name}</strong> · {statuses[row.status]}{row.status === 'changed' && <span className="text-xs text-slate-500">（含定义、参数、限制或依据的字面变化，详见正文）</span>}</li>;})}</ul>}
            {!diff.findingsAvailable ? <p className="text-sm leading-6 text-slate-500">至少一份报告未提供同版本的问题清单，不能把覆盖差异解读为问题新增或消失。</p> : !findings.length ? <p className="text-sm leading-6 text-slate-600">已列出的问题条目相同；审查范围说明仍需在正文中分别核对。</p> : <ul className="space-y-2 text-sm text-slate-700">{findings.map(row => <li key={row.name} className="break-words"><strong className="font-medium">{row.before?.title || row.after?.title || row.name}</strong> · {statuses[row.status]}{row.before && row.after && row.before.severity !== row.after.severity && <span>（严重度 {severity[row.before.severity]} → {severity[row.after.severity]}）</span>}</li>)}</ul>}
        </section>
    </div>;
}
