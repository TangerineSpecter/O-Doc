import type {QuantWalkForwardPolicy} from '../../../types/api/quantExperiment';
import type {TemporalDraft} from '../../../utils/quantTemporal';
import {Select} from '../../common/Select';
import {QuantField} from '../ui';

export function TemporalSummary({policy}: {policy: QuantWalkForwardPolicy}) {
    return <p className="text-xs leading-7 text-slate-600">逐折重新搜索 · {policy.folds} 个外层折 · {policy.mode === 'expanding' ? '扩展训练窗口' : '固定长度滚动训练'}。{policy.version === 2 ? `每个外折综合 ${policy.innerFolds} 个内层验证窗口选参数；` : ''}首个训练窗口 {policy.trainBars} 段、每个验证窗口 {policy.validationBars} 段、外层测试 {policy.testBars} 段；额外预热 {policy.warmupBars} 根。长度按开盘到下一开盘的收益区间计，所有折共用总尝试数和总时限。</p>;
}
export function TemporalSettings({draft, change}: {draft: TemporalDraft; change: (value: TemporalDraft) => void}) {
    const fields = [['folds', '折数（2–5）'], ['trainBars', '首折训练收益区间'], ['validationBars', '每折验证收益区间'], ['testBars', '每折测试收益区间'], ['warmupBars', '首个信号前额外预热根数']] as const;
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4"><label className="flex items-start gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" className="mt-1 accent-orange-500" checked={draft.enabled} onChange={event => change({...draft, enabled: event.target.checked})}/><span>滚动验证：逐折重新搜索</span></label>
        <p className="text-xs leading-6 text-slate-500">每折用当时的训练和验证数据选择方案，再计算后续测试区间。后折可使用已经过去的行情。关闭时使用单次固定分段。</p>
        {draft.enabled && <><label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1 accent-orange-500" checked={draft.nested} onChange={event => change({...draft, nested: event.target.checked})}/><span>多次内层时序验证：综合各窗口结果选参数</span></label>{draft.nested && <><QuantField label="每个外折的内层折数（2–4）" type="number" value={draft.innerFolds} onChange={value => change({...draft, innerFolds: value})}/><p className="text-xs leading-6 text-slate-500">内层按验证窗口长度向前推进，沿用下方训练模式。训练收益、回撤、换手均值参与 Pareto，再按验证收益减回撤的均值选方案；测试期只在选定后评价。内层窗口有历史重叠，不是独立重复样本。</p></>}<Select aria-label="滚动验证训练模式" menuPortal value={draft.mode} onChange={value => change({...draft, mode: value as TemporalDraft['mode']})} options={[{value: 'expanding', label: '扩展训练：逐折保留更多历史'}, {value: 'rolling', label: '滚动训练：保持固定历史长度'}]}/><div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <QuantField key={key} label={label} type="number" value={draft[key]} onChange={value => change({...draft, [key]: value})}/>)}</div><p className="text-xs leading-6 text-slate-500">最后一折测试截止于所选行情末尾。训练与验证、验证与测试之间均使用下方隔离设置；每折从空仓开始，段末平仓。预热不足的信号继续记为缺失。</p></>}
    </section>;
}
