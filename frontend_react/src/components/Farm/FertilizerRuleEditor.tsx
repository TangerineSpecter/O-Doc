import type {FarmRules} from '../../types/api/farm';

export function FertilizerRuleEditor({rules, onChange}: {rules: FarmRules; onChange: (rules: FarmRules) => void}) {
    return <div className="space-y-4">
        <p className="text-xs text-slate-500">每块地每轮只能选择一种肥料。价格每小时独立波动，最低报价须大于零；新配置下小时生效，效果不改变已播种周期。</p>
        {(['quality', 'yield'] as const).map(kind => {
            const rule = rules.fertilizers[kind];
            const update = (field: keyof typeof rule, value: number) => onChange({...rules, fertilizers: {...rules.fertilizers, [kind]: {...rule, [field]: value}}});
            return <section key={kind} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">{rule.name}</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-600">基准价（币）<input aria-label={`${rule.name}基准价`} type="number" min={1} value={rule.basePrice} onChange={e => update('basePrice', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 p-2"/></label>
                    <label className="text-xs text-slate-600">波动 ±（币）<input aria-label={`${rule.name}波动`} type="number" min={0} max={rule.basePrice - 1} value={rule.fluctuation} onChange={e => update('fluctuation', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 p-2"/></label>
                    <label className="col-span-2 text-xs text-slate-600">{kind === 'quality' ? '品质参数加成（0～0.20）' : '基础产量加成（%）'}<input aria-label={`${rule.name}效果`} type="number" min={0} max={kind === 'quality' ? .2 : 100} step={kind === 'quality' ? .01 : 1} value={kind === 'quality' ? rule.qualityBonus : rule.yieldPercentage} onChange={e => update(kind === 'quality' ? 'qualityBonus' : 'yieldPercentage', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 p-2"/></label>
                </div>
                <p className="mt-3 text-xs text-slate-500">报价区间 {rule.basePrice - rule.fluctuation}～{rule.basePrice + rule.fluctuation} 币／份</p>
            </section>;
        })}
    </div>;
}
