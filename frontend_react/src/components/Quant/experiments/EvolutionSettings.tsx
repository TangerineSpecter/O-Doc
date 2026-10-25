import type {QuantEvolutionPolicy, QuantEvolutionOperator} from '../../../types/api/quantExperiment';
import {evolutionNames, type EvolutionDraft} from '../../../utils/quantEvolution';
import {QuantField} from '../ui';
export function EvolutionSummary({policy}: {policy: QuantEvolutionPolicy}) {
    return <div className="space-y-1 text-xs leading-6 text-slate-600"><p>公式演化：{policy.operators.map(op => evolutionNames[op]).join('、')}</p><p>窗口 {policy.windows.join(' / ')} 根；左父代权重 {policy.weights.join(' / ')}；每个新公式最多 {policy.maxNodes} 个节点。</p><p>窗口与权重固定写入新公式，保留父代与变换记录。标准化和时序排序会改变尺度，本轮信号阈值仍需按研究假设解释。</p>{policy.operators.includes('ts_rank') && <p>{rankDescription}</p>}{policy.operators.includes('gate') && <p>门控保留第一父代，第二父代须为布尔过滤条件；不成立时输出缺失，模拟按空仓处理，缺失信号计数也包含主动屏蔽。</p>}{policy.operators.includes('crossover') && <p>{crossoverDescription}</p>}</div>;
}
const rankDescription = '排序比较当前值在完整历史窗口中的相对位置，范围为 0–1，同值取中点；不是跨股票排名。零阈值会让所有有效排序值通过，请在成交假设中核对阈值。';
const crossoverDescription = '交叉从两个父代中选择类型与结构单位相同的片段，替换第一个父代的内部计算节点。窗口配置与单位未知的片段不替换；没有兼容位置的父代对会跳过。保留两个父代的参数、约束及具体位置，结构兼容不代表策略有效。';
export function EvolutionSettings({draft, change}: {draft: EvolutionDraft; change: (value: EvolutionDraft) => void}) {
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label="公式演化配置">
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" className="mt-1 accent-orange-500" checked={draft.enabled} onChange={event => change({...draft, enabled: event.target.checked})}/>探索新的计算公式</label>
        <p className="text-xs leading-6 text-slate-500">从父代生成新公式，按真实计算结果选择下一代。各代共享本轮尝试与时间预算；实际尝试中发现的类型、单位或复杂度问题也会保留记录。</p>
        {draft.enabled && <><div className="grid gap-3 sm:grid-cols-2">{(Object.keys(evolutionNames) as QuantEvolutionOperator[]).map(op => <label key={op} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="accent-orange-500" checked={draft.operators.includes(op)} onChange={event => change({...draft, operators: event.target.checked ? [...draft.operators, op] : draft.operators.filter(value => value !== op)})}/>{evolutionNames[op]}</label>)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><QuantField label="演化窗口（逗号分隔，最多 4 个）" value={draft.windows} onChange={windows => change({...draft, windows})}/><QuantField label="左父代权重（0–1，最多 4 个）" value={draft.weights} onChange={weights => change({...draft, weights})}/><QuantField label="新公式节点上限（8–128）" type="number" value={draft.maxNodes} onChange={maxNodes => change({...draft, maxNodes})}/></div>
            <p className="text-xs leading-6 text-slate-500">至少 2 代，并在原始父代与参数组之外保留尝试额度。条件交集／并集只接受布尔信号；标准化、排序、平滑、加权与残差只接受数值序列。门控保留第一父代信号，第二父代须为布尔过滤条件；关闭时输出缺失，模拟按空仓处理。</p></>}
        {draft.enabled && draft.operators.includes('ts_rank') && <p className="text-xs leading-6 text-slate-600">{rankDescription}</p>}
        {draft.enabled && draft.operators.includes('crossover') && <p className="text-xs leading-6 text-slate-600">{crossoverDescription}</p>}
    </section>;
}
