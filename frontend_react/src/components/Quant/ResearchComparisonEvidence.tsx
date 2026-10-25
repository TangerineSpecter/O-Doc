import {quantDate} from '../../utils/quant';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const shown = (value: unknown) => value === null || value === undefined ? '未知' : typeof value === 'string' ? value : JSON.stringify(value);
const scalarMap = (value: unknown) => object(value) ? Object.entries(value).map(([name, item]) => `${name}=${shown(item)}`).join('；') || '无' : '未知';

/** A direct sample comparison is distinct from curation and economic performance. */
export function ResearchComparisonEvidence({evidence}: {evidence: Record<string, unknown>}) {
    const result = object(evidence.result) ? evidence.result : null;
    const sides = object(evidence.sides) ? evidence.sides : null;
    const dataset = object(evidence.dataset) ? evidence.dataset : null;
    const policy = object(evidence.policy) ? evidence.policy : null;
    const history = object(evidence.logical_merges) ? evidence.logical_merges : null;
    if (!result || !sides || !dataset || !policy || !history || !['pass', 'fail', 'inconclusive'].includes(String(result.status)) ||
        !Array.isArray(history.items) || history.items.some(row => !object(row))) {
        return <p role="alert" className="mt-3 text-xs leading-6 text-orange-700">对照摘要结构无法读取，请展开原始证据核对。</p>;
    }
    const counts = object(result.counts) ? result.counts : {};
    const verdict = {pass: '固定样本输出相同', fail: '固定样本存在差异', inconclusive: '当前对照证据不足'}[result.status as 'pass' | 'fail' | 'inconclusive'];
    return <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
        <p className="font-semibold text-slate-800">{verdict}</p>
        {evidence.local_demo === true && <p className="text-orange-700">人工本地样例，未执行真实对照或调用模型。</p>}
        <p>{shown(dataset.symbol)} · {shown(dataset.timeframe)} · {shown(dataset.timezone)}<br/>{shown(dataset.start)} 至 {shown(dataset.end)}<br/>共同有效 {shown(counts.common_valid)} 行；数值差异 {shown(counts.value_mismatches)} 行，缺失差异 {shown(counts.missing_mismatches)} 行。<br/>共同预热 {shown(policy.warmup_bars)} 行；绝对容差 {shown(policy.absolute_tolerance)}，相对容差 {shown(policy.relative_tolerance)}。</p>
        <div className="grid gap-3 sm:grid-cols-2">{(['left', 'right'] as const).map(side => {
            const value = object(sides[side]) ? sides[side] : {};
            const definition = object(value.definition) ? value.definition : {};
            return <div key={side} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3"><p className="break-words font-semibold">{side === 'left' ? '左侧' : '右侧'} · {shown(definition.name)}</p><p className="mt-1 break-words">{shown(definition.formula)}</p><p className="mt-2 break-all font-mono">实际参数：{scalarMap(value.parameters)}<br/>输入映射：{scalarMap(value.bindings)}</p></div>;
        })}</div>
        <div><p className="font-medium">当时的直接逻辑合并 · {shown(history.included)} / {shown(history.total)} 份</p>
            {Number(history.omitted) > 0 && <p>{shown(history.omitted)} 份未纳入本次摘要，其他整理状态保留未知。</p>}
            {!history.items.length && <p>本次未提供直接合并；不推导其他候选间的关系。</p>}
            {history.items.filter(object).map((row, index) => {
                const withdrawal = object(row.withdrawal) ? row.withdrawal : null;
                return <div key={String(row.id || index)} className="mt-2 border-l-2 border-slate-200 pl-3"><p className="break-words">{shown(row.name)} · {row.active_at_cutoff === true ? '当时有效' : row.active_at_cutoff === false ? '当时已撤销' : '状态未知'}</p><p className="whitespace-pre-wrap break-words">{shown(row.reason)}</p>{withdrawal && <p className="whitespace-pre-wrap break-words">撤销：{shown(withdrawal.reason)} · {quantDate(String(withdrawal.created_at))}</p>}</div>;
            })}
        </div>
        <p>这份证据限于所列样本、输入和参数；逻辑合并是人工整理，不证明传递等价、原平台等价或盈利。</p>
    </div>;
}
