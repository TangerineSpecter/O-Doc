import type {CombatEquipment} from '../../types/api/combat';
import {equipmentSlotLabel, equipmentTypeLabel, formatRatio, isRatioStat, normalizeStatKey, statLabels} from './presentation';
import {ElementBadge} from './ElementBadge';
import {EquipmentPortrait} from './atlas/EquipmentPortrait';
import {CircleDollarSign, Coins, Heart, ShieldCheck, Sparkles} from 'lucide-react';

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
    const displayType = gear.equipmentType || item.displayType;
    const isGold = gear.quality === 'gold';
    const isBlue = gear.quality === 'blue';
    const templateId = gear.templateId || item.templateId || item.id || '';
    const hasActions = Boolean(onFavorite || onSell || onEquip || (worn && onUnequip));

    const cardBorderBg = isGold
        ? 'border-amber-300 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/20 hover:border-amber-400 shadow-xs'
        : isBlue
          ? 'border-sky-300/80 bg-gradient-to-br from-sky-50/40 via-white to-sky-50/20 hover:border-sky-400 shadow-xs'
          : 'border-slate-200 bg-white hover:border-slate-300';

    const iconBoxBorder = isGold
        ? 'border-amber-300/80 bg-gradient-to-b from-amber-100/70 to-amber-50/40 shadow-xs'
        : isBlue
          ? 'border-sky-300/80 bg-gradient-to-b from-sky-100/70 to-sky-50/40 shadow-xs'
          : 'border-slate-200 bg-gradient-to-b from-slate-100/80 to-slate-50/40';

    const levelBadgeBorder = isGold
        ? 'border-amber-300'
        : isBlue
          ? 'border-sky-300'
          : 'border-slate-300/90';

    const levelPrefixStyle = isGold
        ? 'bg-amber-600 text-amber-50'
        : isBlue
          ? 'bg-sky-600 text-sky-50'
          : 'bg-slate-700 text-slate-100';

    const levelNumberStyle = isGold
        ? 'bg-amber-50/90 text-amber-950'
        : isBlue
          ? 'bg-sky-50/90 text-sky-950'
          : 'bg-slate-50 text-slate-800';

    const baseStats = Object.entries(gear.stats)
        .map(([key, totalValue]) => {
            const normalizedKey = normalizeStatKey(key);
            const affixSum = gear.affixes
                .filter(a => normalizeStatKey(a.stat) === normalizedKey)
                .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
            const baseValue = Math.round((Number(totalValue) - affixSum) * 10000) / 10000;
            return [key, baseValue] as [string, number];
        })
        .filter(([, baseValue]) => baseValue > 0.0001);

    return (
        <article className={`relative flex items-start gap-2.5 rounded-xl border p-2.5 transition-all shadow-2xs ${cardBorderBg}`}>
            {/* 左侧：装备图鉴图标 + 硬朗双拼精工等级勋章 */}
            <div className="relative shrink-0 flex flex-col items-center gap-1.5">
                <div
                    className={`flex h-14 w-14 items-center justify-center rounded-xl border p-1 shadow-2xs ${iconBoxBorder}`}
                >
                    <EquipmentPortrait
                        equipmentId={templateId}
                        name={gear.name}
                        slot={gear.slot}
                        equipmentType={displayType}
                        bossOnly={templateId.includes('boss')}
                        decorative
                        className="h-full w-full object-contain"
                        fallbackClassName="h-7 w-7"
                    />
                </div>
                {worn && (
                    <span
                        className="absolute -top-1 -right-1 flex h-4 items-center gap-0.5 rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white shadow-2xs"
                        title="已穿戴"
                    >
                        <ShieldCheck className="h-2.5 w-2.5" />
                        <span>穿戴</span>
                    </span>
                )}
                {/* 图标下方的等级微章：硬朗微圆角双拼色精工勋章 */}
                <div
                    className={`flex w-14 items-stretch overflow-hidden rounded border select-none shadow-2xs ${levelBadgeBorder}`}
                    title={`装备等级：Lv.${gear.level}`}
                >
                    <span
                        className={`flex items-center justify-center px-1 text-[8px] font-black font-mono tracking-wider ${levelPrefixStyle}`}
                    >
                        LV
                    </span>
                    <span
                        className={`flex-1 flex items-center justify-center px-1 text-[11px] font-black tabular-nums leading-none py-0.5 ${levelNumberStyle}`}
                    >
                        {gear.level}
                    </span>
                </div>
            </div>

            {/* 右侧：信息与操作 */}
            <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch gap-1.5">
                <div>
                    {/* 顶部第 1 行：装备名称（左） + 类型/部位固定右上角展示（右） */}
                    <div className="flex items-center justify-between gap-2">
                        <strong
                            className={`truncate text-xs font-bold sm:text-sm ${
                                isGold ? 'text-amber-950' : isBlue ? 'text-sky-950' : 'text-slate-800'
                            }`}
                            title={gear.name}
                        >
                            {gear.name}
                        </strong>
                        <span className="shrink-0 text-[11px] font-medium text-slate-400 select-none">
                            {equipmentSlotLabel(gear.slot, displayType)}
                        </span>
                    </div>

                    {/* 顶部第 2 行：固定在名称正下方的「通用/类型」标签 + 右侧「金币价格」+ (绑定/收藏) */}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="rounded bg-orange-50 px-1.5 py-0.2 text-[10px] font-semibold text-orange-700">
                            {equipmentTypeLabel(displayType)}
                        </span>
                        {gear.slot === 'weapon' && (
                            <ElementBadge element={gear.element} size="xs" />
                        )}

                        {/* 琥珀金币价格徽标（去掉文字，纯金币+数值） */}
                        {item.value ? (
                            <div
                                className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-yellow-50/40 px-1.5 py-0.2 text-[10px] shadow-2xs select-none"
                                title={`商店回收估价：¥${item.value}`}
                            >
                                <Coins className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                                <span className="font-bold tabular-nums text-amber-700">¥{item.value}</span>
                            </div>
                        ) : null}

                        {item.bound && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] text-slate-500">
                                绑定
                            </span>
                        )}
                        {item.locked && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-50 px-1.5 py-0.2 text-[9px] text-rose-600">
                                <Heart className="h-2.5 w-2.5 fill-rose-500 text-rose-500" />
                                收藏
                            </span>
                        )}
                    </div>

                    {/* 装备本体基础属性（核心主属性卡槽，已剔除词条重复） */}
                    {baseStats.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-0.5">
                            {baseStats.map(([key, value]) => (
                                <div key={key} className="flex items-center gap-1.5 py-0.5">
                                    <span className="text-[11px] font-medium text-slate-500">
                                        {statLabels[key] || key}
                                    </span>
                                    <strong className="font-mono text-xs font-black text-slate-800 tabular-nums">
                                        {value < 1 ? `+${(value * 100).toFixed(1)}%` : `+${value}`}
                                    </strong>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 随机词条（保留现有设计） */}
                    {gear.affixes.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                            {gear.affixes.map(affix => (
                                <span
                                    key={affix.id}
                                    className="inline-flex items-center gap-0.5 rounded border border-orange-200/70 bg-orange-50/80 px-1.5 py-0.5 text-[11px] text-orange-700"
                                    title="随机词条"
                                >
                                    <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-500" />
                                    <span className="text-orange-600">{statLabels[affix.stat] || '附加属性'}</span>
                                    <strong className="font-semibold text-orange-900">
                                        +{isRatioStat(affix.stat) ? formatRatio(affix.value) : affix.value}
                                    </strong>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* 底部操作按钮 */}
                {hasActions && (
                    <div className="mt-1 flex items-center justify-end gap-1.5 border-t border-slate-100/80 pt-1.5 text-xs">
                        {onFavorite && (
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={onFavorite}
                                title={item.locked ? '取消收藏' : '收藏此装备'}
                                className={`group inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all whitespace-nowrap shadow-2xs ${
                                    item.locked
                                        ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300'
                                        : 'border-slate-200/80 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50/50 hover:text-rose-600'
                                }`}
                            >
                                <Heart
                                    className={`h-3 w-3 transition-colors ${
                                        item.locked
                                            ? 'fill-rose-500 text-rose-500'
                                            : 'text-slate-400 group-hover:text-rose-500'
                                    }`}
                                />
                                <span>{item.locked ? '已收藏' : '收藏'}</span>
                            </button>
                        )}

                        {onSell && (
                            <button
                                type="button"
                                disabled={disabled || worn || item.bound || item.locked}
                                onClick={onSell}
                                title={worn ? '已穿戴不可出售' : item.bound ? '已绑定不可出售' : item.locked ? '已收藏不可出售' : '出售换取金币'}
                                className="group inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-all shadow-2xs hover:border-amber-300 hover:bg-amber-50/70 hover:text-amber-800 disabled:opacity-35 disabled:hover:border-slate-200/80 disabled:hover:bg-white disabled:hover:text-slate-600 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                <CircleDollarSign className="h-3 w-3 text-amber-500/80 group-hover:text-amber-600 transition-colors" />
                                <span>出售</span>
                            </button>
                        )}

                        {worn && onUnequip ? (
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={onUnequip}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-40 whitespace-nowrap shadow-2xs"
                            >
                                卸下预览
                            </button>
                        ) : onEquip ? (
                            <button
                                type="button"
                                disabled={disabled || worn}
                                onClick={onEquip}
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40 whitespace-nowrap shadow-2xs ${
                                    worn
                                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20'
                                }`}
                            >
                                {worn ? '已穿戴' : '穿戴预览'}
                            </button>
                        ) : null}
                    </div>
                )}
            </div>
        </article>
    );
}

