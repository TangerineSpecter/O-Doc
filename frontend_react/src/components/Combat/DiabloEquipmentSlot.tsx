import {useState, type ComponentType} from 'react';
import type {CombatEquipment} from '../../types/api/combat';
import {
    formatRatio,
    isRatioStat,
    normalizeStatKey,
    qualityLabels,
    slotLabels,
    statLabels,
} from './presentation';
import {EquipmentPortrait} from './atlas/EquipmentPortrait';
import {Crown, Footprints, Gem, Hand, Shield, Sparkles, Sword} from 'lucide-react';

const slotIcons: Record<string, ComponentType<{className?: string}>> = {
    weapon: Sword,
    offhand: Shield,
    head: Crown,
    body: Shield,
    hands: Hand,
    feet: Footprints,
    accessory: Gem,
    ring_1: Gem,
    ring_2: Gem,
};

export type SlotPlacement =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'mid-left'
    | 'mid-center'
    | 'mid-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

export interface DiabloEquipmentSlotProps {
    slot: string;
    item?: CombatEquipment;
    sourceSlot?: string;
    hasCandidate?: boolean;
    disabled?: boolean;
    placement?: SlotPlacement;
    onInspect: (item: CombatEquipment, remove?: boolean, slot?: string) => void;
    onHover?: (slot: string | null) => void;
    className?: string;
}

export function DiabloEquipmentSlot({
    slot,
    item,
    sourceSlot,
    hasCandidate = false,
    disabled,
    placement = 'mid-center',
    onInspect,
    onHover,
    className = '',
}: DiabloEquipmentSlotProps) {
    const [isHovered, setIsHovered] = useState(false);
    const Icon = slotIcons[slot] || Shield;
    const label = slotLabels[slot] || slot;

    const handleMouseEnter = () => {
        setIsHovered(true);
        onHover?.(slot);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        onHover?.(null);
    };

    // 装备品质判断
    const gear = item?.snapshot;
    const isGold = gear?.quality === 'gold';
    const isBlue = gear?.quality === 'blue';

    // 剔除词条影响，计算纯白字基础属性 (精准对齐下划线与驼峰命名)
    const baseStats = gear
        ? Object.entries(gear.stats)
              .map(([key, totalValue]) => {
                  const normalizedKey = normalizeStatKey(key);
                  const affixSum = gear.affixes
                      .filter(a => normalizeStatKey(a.stat) === normalizedKey)
                      .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
                  const baseValue = Math.round((Number(totalValue) - affixSum) * 10000) / 10000;
                  return [key, baseValue] as [string, number];
              })
              .filter(([, baseValue]) => baseValue > 0.0001)
        : [];

    // 智能防溢出 Tooltip 定位策略
    const getTooltipPositionClass = (): string => {
        switch (placement) {
            case 'top-left':
                return 'left-full ml-2.5 top-0';
            case 'top-center':
                return 'left-1/2 -translate-x-1/2 top-full mt-2.5';
            case 'top-right':
                return 'right-full mr-2.5 top-0';
            case 'mid-left':
                return 'left-full ml-2.5 top-1/2 -translate-y-1/2';
            case 'mid-center':
                return 'left-full ml-2.5 top-1/2 -translate-y-1/2';
            case 'mid-right':
                return 'right-full mr-2.5 top-1/2 -translate-y-1/2';
            case 'bottom-left':
                // 底部槽位：底边向上贴齐，防止溢出下边缘
                return 'left-full ml-2.5 bottom-0';
            case 'bottom-center':
                // 靴子：向上弹起
                return 'left-1/2 -translate-x-1/2 bottom-full mb-2.5';
            case 'bottom-right':
                // 右下槽位：向左上方展开，底边对齐，彻底防止截断
                return 'right-full mr-2.5 bottom-0';
            default:
                return 'left-1/2 -translate-x-1/2 bottom-full mb-2.5';
        }
    };

    return (
        <div
            className={`relative group flex flex-col items-center ${className}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {item && gear ? (
                /* 已装配装备槽位卡片 + 底部部位微标签 */
                <>
                    <button
                        type="button"
                        data-loadout-slot-box={slot}
                        disabled={disabled}
                        onClick={() => onInspect(item, true, sourceSlot)}
                        title={`已装备：${gear.name} (Lv.${gear.level})`}
                        className={`relative flex h-[56px] w-[56px] sm:h-[60px] sm:w-[60px] items-center justify-center rounded-[16px] border-2 p-1 text-left backdrop-blur-xs transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed ${
                            isGold
                                ? 'border-amber-400 bg-gradient-to-br from-amber-50/95 to-orange-50/90 shadow-[0_6px_16px_-3px_rgba(245,158,11,0.24),inset_0_0_12px_rgba(251,191,36,0.14)] group-hover:border-amber-500 group-hover:shadow-[0_0_0_3px_rgba(245,158,11,0.24),0_10px_24px_-4px_rgba(245,158,11,0.3)]'
                                : isBlue
                                  ? 'border-[#38bdf8] bg-gradient-to-br from-[#f0f9ff]/95 to-[#e0f2fe]/90 shadow-[0_6px_16px_-3px_rgba(14,165,233,0.22),inset_0_0_12px_rgba(56,189,248,0.12)] group-hover:border-[#0284c7] group-hover:shadow-[0_0_0_3px_rgba(56,189,248,0.28),0_10px_24px_-4px_rgba(14,165,233,0.3)]'
                                  : 'border-[#cbd5e1] bg-gradient-to-br from-white/95 to-slate-100/90 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.85)] group-hover:border-slate-400 group-hover:shadow-[0_0_0_3px_rgba(100,116,139,0.18),0_8px_20px_-4px_rgba(15,23,42,0.12)]'
                        }`}
                    >
                        {/* 右上角：品质胶囊徽标 (金/蓝/白) */}
                        <span
                            className={`absolute top-1 right-1 flex items-center justify-center rounded px-1 py-0.2 text-[8px] font-bold leading-none border select-none ${
                                isGold
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : isBlue
                                      ? 'bg-sky-100 text-sky-700 border-sky-300'
                                      : 'bg-slate-200/90 text-slate-700 border-slate-300'
                            }`}
                        >
                            {isGold ? '金' : isBlue ? '蓝' : '白'}
                        </span>

                        {/* 装备像素肖像 */}
                        <div className="relative h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center overflow-hidden">
                            <EquipmentPortrait
                                equipmentId={gear.templateId || item.templateId || item.id}
                                name={gear.name}
                                slot={gear.slot}
                                equipmentType={gear.equipmentType || item.displayType}
                                bossOnly={(gear.templateId || item.templateId || item.id).includes('boss')}
                                decorative
                                className="h-full w-full object-contain drop-shadow-xs transition-transform duration-200 group-hover:scale-110"
                                fallbackClassName="h-5 w-5"
                            />
                        </div>

                        {/* 左下角：胶囊等级徽标 (Lv.X) */}
                        <span
                            className={`absolute bottom-1 left-1 flex items-center rounded-full px-1.5 py-0.2 font-mono text-[8px] font-bold shadow-xs leading-none select-none ${
                                isGold
                                    ? 'bg-amber-600 text-white'
                                    : isBlue
                                      ? 'bg-sky-600 text-white'
                                      : 'bg-slate-700 text-white'
                            }`}
                        >
                            Lv.{gear.level}
                        </span>
                    </button>
                    <span
                        className={`mt-0.5 text-[10px] font-semibold tracking-tight leading-tight transition-colors select-none ${
                            isHovered ? 'text-orange-500 font-bold' : 'text-slate-500'
                        }`}
                    >
                        {label}
                    </span>
                </>
            ) : (
                /* 空槽位状态 + 底部未装配/可穿戴微标签 */
                <>
                    <div
                        data-loadout-slot-box={slot}
                        className="group/empty relative flex h-[56px] w-[56px] sm:h-[60px] sm:w-[60px] flex-col items-center justify-center gap-0.5 rounded-[16px] border-[1.5px] border-dashed border-slate-300/90 bg-white/80 p-1 text-slate-400 shadow-2xs backdrop-blur-xs transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.03] hover:border-solid hover:border-orange-500 hover:bg-orange-50/40 hover:shadow-[0_0_0_3px_rgba(249,115,22,0.14)]"
                    >
                        {hasCandidate && (
                            <>
                                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
                                <span
                                    className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-orange-500"
                                    title="背包中有可穿戴装备"
                                />
                            </>
                        )}
                        {/* 部位水印图标 */}
                        <Icon className="h-4 w-4 opacity-75 transition-all duration-200 group-hover/empty:scale-110 group-hover/empty:text-orange-500" />
                        {/* 框内部位名称 */}
                        <span className="text-[10px] font-semibold tracking-tight leading-none text-slate-400 transition-colors group-hover/empty:text-orange-500 font-sans">
                            {label}
                        </span>
                    </div>
                    <span
                        className={`mt-0.5 text-[9px] font-medium tracking-tight leading-tight transition-colors select-none ${
                            isHovered
                                ? 'text-orange-500 font-semibold'
                                : hasCandidate
                                  ? 'text-orange-500/85'
                                  : 'text-slate-400'
                        }`}
                    >
                        {hasCandidate ? '可穿戴' : '未装配'}
                    </span>
                </>
            )}

            {/* 实心白底高级浮动卡片 (纯白实底 opacity-100，彻底消除透底污渍与溢出裁剪) */}
            {isHovered && (
                <div
                    className={`absolute z-50 w-56 sm:w-64 rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${getTooltipPositionClass()}`}
                >
                    {item && gear ? (
                        <div className="space-y-2">
                            {/* 标题区：名称与品质 */}
                            <div className="border-b border-slate-100 pb-2">
                                <div className="flex items-center justify-between gap-1.5">
                                    <h5
                                        className={`font-bold text-sm truncate ${
                                            isGold
                                                ? 'text-amber-700'
                                                : isBlue
                                                  ? 'text-sky-700'
                                                  : 'text-slate-800'
                                        }`}
                                    >
                                        {gear.name}
                                    </h5>
                                    <span
                                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                            isGold
                                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                : isBlue
                                                  ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                                        }`}
                                    >
                                        {qualityLabels[gear.quality] || gear.quality}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                                    <span>{label}</span>
                                    <span className="font-mono text-orange-600 font-semibold">装等 Lv.{gear.level}</span>
                                </div>
                            </div>

                            {/* 纯白字基础属性列表 (已彻底剔除词缀属性，绝不重复) */}
                            {baseStats.length > 0 && (
                                <div className="space-y-1 text-xs">
                                    {baseStats.map(([statKey, val]) => (
                                        <div key={statKey} className="flex items-center justify-between">
                                            <span className="text-slate-500">{statLabels[statKey] || statKey}</span>
                                            <strong className="font-mono font-bold text-slate-800">
                                                {isRatioStat(statKey) ? `+${formatRatio(val)}` : `+${val}`}
                                            </strong>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 随机词缀特性 (黄色独立标签展示) */}
                            {gear.affixes && gear.affixes.length > 0 && (
                                <div className="border-t border-slate-100 pt-1.5 space-y-1">
                                    {gear.affixes.map((affix, idx) => (
                                        <div
                                            key={`${affix.stat}-${idx}`}
                                            className="flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 border border-amber-100"
                                        >
                                            <span className="flex items-center gap-1 font-medium">
                                                <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                                                <span>{statLabels[affix.stat] || affix.stat}</span>
                                            </span>
                                            <strong className="font-mono font-bold text-amber-700">
                                                +{isRatioStat(affix.stat) ? formatRatio(affix.value) : affix.value}
                                            </strong>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 底部操作指引 */}
                            <div className="border-t border-slate-100 pt-1.5 text-center">
                                <span className="text-[10px] text-orange-600 font-medium">
                                    点击槽位以查看详情或卸下
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-1 space-y-1">
                            <p className="text-xs font-semibold text-slate-800">
                                空槽位（{label}）
                            </p>
                            <p className="text-[11px] text-slate-500">
                                尚未装配装备，可在右侧行囊中选择穿戴
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
