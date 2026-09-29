import {Clock, Droplets, Heart, Sparkles, Sprout, Home} from 'lucide-react';
import type {FarmSelection, FarmState} from '../../types/api/farm';
import {FarmBonus} from './FarmBonus';

const animalNames = {chicken: '母鸡', cow: '奶牛', sheep: '绵羊'};

export function FarmDetails({
    farm,
    selection,
    onSelect,
}: {
    farm: FarmState;
    selection: FarmSelection | null;
    onSelect: (value: FarmSelection) => void;
}) {
    const at = Date.parse(farm.serverTime) / 1000;
    const plot =
        selection?.kind === 'plot'
            ? farm.state.plots.find((p) => p.id === selection.id)
            : null;
    const animal =
        selection?.kind === 'animal'
            ? farm.state.animals.find((a) => a.id === selection.id)
            : null;
    const building =
        selection?.kind === 'building'
            ? farm.state.buildings[selection.id as 'coop' | 'barn']
            : null;

    const remaining = (seconds: number) =>
        seconds <= 0 ? '已成熟可收获' : `剩余约 ${Math.ceil(seconds / 60)} 分钟生长时间`;

    return (
        <div className="space-y-3">
            {/* 职业产量加成 */}
            <FarmBonus farm={farm} />

            {/* 观察焦点反馈区 */}
            <div
                aria-live="polite"
                className="rounded-xl border border-lime-200/90 bg-gradient-to-b from-lime-50/70 to-emerald-50/20 p-3 text-xs leading-relaxed text-slate-700 shadow-2xs"
            >
                {plot ? (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-bold text-slate-900">
                                <Sprout className="h-3.5 w-3.5 text-lime-600" />
                                <span>
                                    耕地 #{Number(plot.id) + 1} · {plot.crop?.rules.name || '空闲耕地'}
                                </span>
                            </span>
                            <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    plot.crop
                                        ? plot.crop.rules.growthSeconds <= plot.crop.grown
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-lime-100 text-lime-800'
                                        : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                {plot.crop ? (plot.crop.rules.growthSeconds <= plot.crop.grown ? '已成熟' : '生长中') : '待播种'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 pt-1 text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>
                                {plot.crop
                                    ? remaining(plot.crop.rules.growthSeconds - plot.crop.grown)
                                    : '等待居民自主播种'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-600">
                            <Droplets className="h-3 w-3 text-blue-400 shrink-0" />
                            <span>
                                {plot.wet ??
                                (plot.wateredUntil > at || farm.weather === 'rain')
                                    ? '土壤湿润（水分充足）'
                                    : '土壤干燥（缺水暂停生长）'}
                            </span>
                        </div>
                    </div>
                ) : animal ? (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 font-bold text-slate-900">
                                <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
                                <span>{animalNames[animal.kind]}</span>
                            </span>
                            <span className="font-mono text-xs text-rose-500 font-bold">
                                {animal.halfHearts / 2} / 5 心
                            </span>
                        </div>

                        <p className="pt-1 text-slate-600">
                            {animal.cycle.result ? (
                                <span className="font-semibold text-amber-700">
                                    待收取产物：
                                    {animal.cycle.result.quality === 'gold' ? '金色 ' : '普通 '}
                                    {animal.cycle.rules.product} × {animal.cycle.result.quantity}
                                </span>
                            ) : (
                                remaining(
                                    animal.cycle.rules.periodSeconds - animal.cycle.grown
                                )
                            )}
                        </p>

                        <p className="text-[11px] text-slate-500">
                            {animal.fedUntil > at
                                ? '饲料充足（生产正常）'
                                : '等待喂养，生产暂停'}
                        </p>
                    </div>
                ) : selection?.kind === 'building' ? (
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <Home className="h-3.5 w-3.5 text-orange-500" />
                            <span>{selection.id === 'coop' ? '鸡舍' : '牛羊舍'}</span>
                        </div>
                        <p className="pt-1 text-slate-600">
                            {building
                                ? `${building.level} 级建筑 · 可容纳 ${building.capacity} 只动物`
                                : '尚未建造'}
                        </p>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-slate-600">
                        <Sparkles className="h-4 w-4 text-lime-600 shrink-0" />
                        <span>点击左侧地块、动物或建筑，在此观察其成长与收益。</span>
                    </div>
                )}
            </div>

            {/* 耕地地块快速点选 */}
            <div>
                <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">
                        耕地状态 ({farm.state.plots.length} / 16)
                    </span>
                    <span className="text-[10px] text-slate-400">点击切换聚焦</span>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {farm.state.plots.map((p) => {
                        const isSelected = selection?.kind === 'plot' && selection.id === p.id;
                        const isMature =
                            p.crop && p.crop.rules.growthSeconds <= p.crop.grown;

                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onSelect({kind: 'plot', id: p.id})}
                                className={`rounded-lg border p-1.5 text-center text-xs transition-all ${
                                    isSelected
                                        ? 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20 shadow-2xs'
                                        : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                                }`}
                            >
                                <span className="font-mono font-bold text-[11px] block">
                                    田 #{Number(p.id) + 1}
                                </span>
                                <span
                                    className={`mt-0.5 block truncate text-[10px] ${
                                        isMature
                                            ? 'font-bold text-amber-600'
                                            : p.crop
                                              ? 'text-lime-700 font-medium'
                                              : 'text-slate-400'
                                    }`}
                                >
                                    {p.crop?.rules.name || '空闲'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 牧场与建筑 */}
            <div>
                <span className="font-bold text-xs text-slate-700 block">
                    牧场动物与建筑
                </span>

                <div className="mt-1.5 space-y-1.5">
                    {/* 建筑按钮 */}
                    <div className="grid grid-cols-2 gap-2">
                        {(['coop', 'barn'] as const).map((kind) => {
                            const isSelected =
                                selection?.kind === 'building' && selection.id === kind;
                            const b = farm.state.buildings[kind];

                            return (
                                <button
                                    key={kind}
                                    type="button"
                                    onClick={() => onSelect({kind: 'building', id: kind})}
                                    className={`rounded-lg border p-2 text-left text-xs transition-all ${
                                        isSelected
                                            ? 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20'
                                            : 'border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <div className="font-bold">
                                        {kind === 'coop' ? '鸡舍' : '牛羊舍'}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-slate-400">
                                        {b?.level ? `${b.level} 级 (${b.capacity}只)` : '未建造'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* 动物列表 */}
                    {farm.state.animals.length > 0 && (
                        <div className="space-y-1 pt-1">
                            {farm.state.animals.map((a, i) => (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => onSelect({kind: 'animal', id: a.id})}
                                    className="flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    <span className="font-medium">
                                        {animalNames[a.kind]} #{i + 1}
                                    </span>
                                    <span className="text-rose-500 text-[11px] font-mono">
                                        {'♥'.repeat(Math.floor(a.halfHearts / 2))}
                                        {a.halfHearts % 2 ? '½' : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
