import type {StrategyDraft} from '../../../utils/quantStrategy';
import {Select} from '../../common/Select';
import {QuantField} from '../ui';

const numeric: [keyof StrategyDraft['values'], string][] = [['positionPercent', '开仓占当时净值（%）'], ['longExit', '多头退出：信号≤此值'],
    ['shortEntry', '空头入场：信号＜此值'], ['shortExit', '空头退出：信号≥此值'], ['holding', '最多持有柱数（0停用）'],
    ['cooldown', '退出后冷却柱数'], ['entries', '每段最多开仓次数'], ['borrowBps', '做空每根借券费用（bps）']];
export function StrategySettings({draft, change, threshold}: {draft: StrategyDraft; change: (value: StrategyDraft) => void; threshold: string}) {
    const update = (key: keyof StrategyDraft['values'], value: string) => change({...draft, values: {...draft.values, [key]: value}});
    return <section className="space-y-4 rounded-xl border border-slate-200 p-4" aria-label="策略执行规则">
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.enabled} onChange={event => change({...draft, enabled: event.target.checked})} className="mt-1 accent-orange-500"/>使用明确的策略执行规则</label>
        <p className="text-xs leading-6 text-slate-500">执行与风控假设在本批固定，公式演化不会修改它们。停用时保留原来的全仓做多／空仓模型。启用不代表原平台源码或账户配置已被验证。</p>
        {draft.enabled && <>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-xs text-slate-600">允许开仓方向</label><Select menuPortal aria-label="策略开仓方向" value={draft.direction} onChange={value => change({...draft, direction: value as StrategyDraft['direction'], booleanSide: value === 'short_only' ? 'short' : value === 'long_only' ? 'long' : draft.booleanSide})} options={[{value: 'long_only', label: '只做多'}, {value: 'short_only', label: '只做空'}, {value: 'long_short', label: '允许双向'}]}/></div><div><label className="mb-2 block text-xs text-slate-600">布尔信号为true时</label><Select menuPortal aria-label="布尔信号开仓方向" value={draft.booleanSide} onChange={value => change({...draft, booleanSide: value as StrategyDraft['booleanSide']})} options={[{value: 'long', label: '做多'}, {value: 'short', label: '做空'}]}/></div></div>
            <p className="text-xs leading-6 text-slate-600">数值多头入场使用预算中的阈值：信号＞{threshold || '待填写'}。阈值单位取自因子输出；布尔false只表示不触发，不自动做反向。</p>
            <div className="grid gap-4 sm:grid-cols-2">{numeric.map(([key, label]) => <QuantField key={key} label={label} type="number" value={draft.values[key]} onChange={value => update(key, value)}/>)}</div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.stopEnabled} onChange={event => change({...draft, stopEnabled: event.target.checked})}/>启用固定价格止损</label>{draft.stopEnabled && <QuantField type="number" label="止损幅度（%）" value={draft.values.stopPercent} onChange={value => update('stopPercent', value)}/>}</div><div className="space-y-2"><label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.profitEnabled} onChange={event => change({...draft, profitEnabled: event.target.checked})}/>启用固定价格止盈</label>{draft.profitEnabled && <QuantField type="number" label="止盈幅度（%）" value={draft.values.profitPercent} onChange={value => update('profitPercent', value)}/>}</div></div>
            <label className="flex items-start gap-2 text-xs leading-6"><input type="checkbox" checked={draft.sameOpenReversal} onChange={event => change({...draft, sameOpenReversal: event.target.checked})} className="mt-1"/>信号反向时允许同开盘先平后开（要求冷却为0）</label>
            <p className="rounded-lg bg-orange-50 p-3 text-xs leading-6 text-slate-600">同柱同时触及止损与止盈，先按止损；跳空止损按开盘，止盈保守按目标价，再计不利滑点与费用。参考模型使用分数数量，不模拟保证金强平、手数、借券可用性、成交量或T+1；0费用仅是实验假设。</p>
        </>}
    </section>;
}
