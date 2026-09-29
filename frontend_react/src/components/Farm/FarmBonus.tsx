import type {FarmState} from '../../types/api/farm';

export function FarmBonus({farm}: {farm: FarmState}) {
    const bonus = farm.farmBonus;
    const entries = Object.entries(farm.state.yieldRemainders ?? {});
    const names = new Map(farm.inventory.map(item => [item.sku, item.name]));
    for (const plot of farm.state.plots) {
        if (plot.crop) names.set(`crop.${plot.crop.kind}`, plot.crop.rules.name);
    }
    for (const animal of farm.state.animals) {
        names.set(`product.${animal.kind}.normal`, animal.cycle.rules.product);
        names.set(`product.${animal.kind}.gold`, `金色${animal.cycle.rules.product}`);
    }
    return <div className="mt-4 rounded-xl border border-lime-200 bg-lime-50/40 p-3 text-xs leading-5 text-slate-600">
        <p className="font-semibold text-lime-800">{bonus?.professionName || '无职业'} · 农场产量 +{Number(bonus?.percentage ?? 0)}%</p>
        <p>收获后累计额外产量，达到1个自动进入背包；不同产物和品质分别累计。</p>
        {entries.length > 0 && <ul className="mt-2 space-y-1">{entries.map(([sku, value]) => <li key={sku}>{names.get(sku) || sku} · 额外产出进度 {Number(value)}／1</li>)}</ul>}
    </div>;
}
