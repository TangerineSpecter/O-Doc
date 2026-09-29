import type {FarmState} from '../../types/api/farm';

export function FarmBonus({farm}: {farm: FarmState}) {
    const bonus = farm.farmBonus;
    const entries = Object.entries(farm.state.yieldRemainders ?? {});
    const names = new Map(farm.inventory.map((item) => [item.sku, item.name]));
    for (const plot of farm.state.plots) {
        if (plot.crop) names.set(`crop.${plot.crop.kind}`, plot.crop.rules.name);
    }
    for (const animal of farm.state.animals) {
        names.set(`product.${animal.kind}.normal`, animal.cycle.rules.product);
        names.set(`product.${animal.kind}.gold`, `金色${animal.cycle.rules.product}`);
    }

    return (
        <div className="rounded-xl border border-lime-200/90 bg-gradient-to-r from-lime-50/80 to-emerald-50/50 p-2.5 text-xs leading-relaxed text-slate-700 shadow-2xs">
            <div className="flex items-center justify-between">
                <span className="font-bold text-lime-900">
                    {bonus?.professionName || '无职业'} · 产量 +{Number(bonus?.percentage ?? 0)}%
                </span>
                <span className="text-[10px] text-lime-700 font-medium">自动累计入包</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
                收获时累计额外产量，满 1 个自动进入背包；不同产物分别累计。
            </p>
            {entries.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t border-lime-200/60 pt-1 text-[10px] text-lime-800 font-mono">
                    {entries.map(([sku, value]) => (
                        <li key={sku} className="truncate">
                            {names.get(sku) || sku} · 进度 {Number(value)}／1
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
