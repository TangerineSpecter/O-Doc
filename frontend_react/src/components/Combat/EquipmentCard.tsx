import type {CombatEquipment} from '../../types/api/combat';
import {qualityLabels, slotLabels, statLabels} from './presentation';
import {Heart, ShieldCheck, Tag} from 'lucide-react';

export default function EquipmentCard({
    item,
    worn,
    disabled,
    onEquip,
    onUnequip,
    onFavorite,
    onSell,
}: {
    item: CombatEquipment;
    worn?: boolean;
    disabled?: boolean;
    onEquip?: () => void;
    onUnequip?: () => void;
    onFavorite?: () => void;
    onSell?: () => void;
}) {
    const gear = item.snapshot;
    const isGold = gear.quality === 'gold';
    const isBlue = gear.quality === 'blue';

    const cardBorderBg = isGold
        ? 'border-amber-300 bg-gradient-to-br from-amber-50/30 to-white hover:border-amber-400'
        : isBlue
          ? 'border-sky-200 bg-gradient-to-br from-sky-50/30 to-white hover:border-sky-300'
          : 'border-slate-200 bg-white hover:border-slate-300';

    const qualityBadge = isGold
        ? 'bg-amber-100 text-amber-800 border-amber-200/70'
        : isBlue
          ? 'bg-sky-100 text-sky-700 border-sky-200/70'
          : 'bg-slate-100 text-slate-600 border-slate-200/70';

    return (
        <article className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all shadow-2xs ${cardBorderBg}`}>
            <div>
                {/* 顶部标题与品质 */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="text-sm font-bold text-slate-800 truncate">{gear.name}</strong>
                            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${qualityBadge}`}>
                                {qualityLabels[gear.quality] || gear.quality}
                            </span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 leading-none">
                                Lv.{gear.level}
                            </span>
                        </div>
                        {/* 槽位与状态标签 */}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
                            <span className="font-medium text-slate-600">{slotLabels[gear.slot] || gear.slot}</span>
                            {worn && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700 border border-emerald-200/60">
                                    <ShieldCheck className="w-2.5 h-2.5" />
                                    已穿戴
                                </span>
                            )}
                            {item.bound && (
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-500">
                                    绑定
                                </span>
                            )}
                            {item.locked && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.2 text-[10px] text-rose-600 border border-rose-200/60">
                                    <Heart className="w-2.5 h-2.5 fill-rose-500" />
                                    收藏
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 主属性列表 */}
                <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1 rounded-lg bg-slate-50/80 p-2 text-xs">
                    {Object.entries(gear.stats)
                        .filter(([, value]) => Boolean(value))
                        .map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center text-slate-600">
                                <dt className="text-slate-400">{statLabels[key] || key}</dt>
                                <dd className="font-semibold text-slate-800">
                                    {value < 1 ? `+${(value * 100).toFixed(1)}%` : `+${value}`}
                                </dd>
                            </div>
                        ))}
                </dl>

                {/* 随机词条 */}
                {gear.affixes.length > 0 && (
                    <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Tag className="w-3 h-3 text-orange-500" />
                            <span>词条属性</span>
                        </div>
                        <ul className="space-y-0.5 text-xs text-orange-700">
                            {gear.affixes.map(affix => (
                                <li key={affix.id} className="flex items-center justify-between text-[11px] bg-orange-50/50 rounded px-1.5 py-0.5">
                                    <span>{statLabels[affix.stat] || '附加属性'}</span>
                                    <span className="font-semibold text-orange-800">
                                        +{['accuracy', 'evasion', 'critical', 'critical_damage'].includes(affix.stat)
                                            ? `${(affix.value * 100).toFixed(1)}%`
                                            : affix.value}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* 底部回收价与操作按钮 */}
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs">
                <span className="text-[11px] text-slate-400">
                    回收 <strong className="text-slate-600 font-medium">¥{item.value}</strong>
                </span>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {onFavorite && (
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={onFavorite}
                            className={`rounded-md px-2 py-1 text-xs transition-colors whitespace-nowrap shrink-0 ${
                                item.locked
                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                        >
                            {item.locked ? '取消收藏' : '收藏'}
                        </button>
                    )}

                    {onSell && (
                        <button
                            type="button"
                            disabled={disabled || worn || item.bound || item.locked}
                            onClick={onSell}
                            title={worn ? '已穿戴不可出售' : item.bound ? '已绑定不可出售' : item.locked ? '已收藏不可出售' : ''}
                            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 whitespace-nowrap shrink-0"
                        >
                            出售
                        </button>
                    )}

                    {worn && onUnequip ? (
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={onUnequip}
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                            卸下预览
                        </button>
                    ) : onEquip ? (
                        <button
                            type="button"
                            disabled={disabled || worn}
                            onClick={onEquip}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 ${
                                worn
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-orange-500 text-white hover:bg-orange-600 shadow-2xs'
                            }`}
                        >
                            {worn ? '已穿戴' : '穿戴预览'}
                        </button>
                    ) : null}
                </div>
            </div>
        </article>
    );
}
