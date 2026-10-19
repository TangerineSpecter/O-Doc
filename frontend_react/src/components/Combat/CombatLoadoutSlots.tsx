import {useState} from 'react';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {resolveLoadoutSlots} from './loadoutPresentation';
import {DiabloHumanSilhouette} from './DiabloHumanSilhouette';
import {DiabloEquipmentSlot, type SlotPlacement} from './DiabloEquipmentSlot';
import {Shield, Sparkles} from 'lucide-react';

export default function CombatLoadoutSlots({
    profile,
    disabled,
    onInspect,
}: {
    profile: CombatProfile;
    disabled?: boolean;
    onInspect: (item: CombatEquipment, remove?: boolean, slot?: string) => void;
}) {
    const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
    const equippedSlots = resolveLoadoutSlots(profile);
    const equippedCount = equippedSlots.size;

    // 计算已穿戴平均装等 (Gear Score)
    const equippedList = Array.from(equippedSlots.values()).map(v => v.item);
    const avgLevel =
        equippedList.length > 0
            ? (
                  equippedList.reduce((acc, curr) => acc + (curr.snapshot.level || 1), 0) /
                  equippedList.length
              ).toFixed(1)
            : '-';

    // 统计高品质装备数量 (金装 / 蓝装)
    const goldCount = equippedList.filter(item => item.snapshot.quality === 'gold').length;
    const blueCount = equippedList.filter(item => item.snapshot.quality === 'blue').length;

    const renderSlot = (
        slotKey: string,
        placement: SlotPlacement,
        positionClass: string,
    ) => {
        const isCurrentHovered = hoveredSlot === slotKey;
        // 关键修复：悬停当前槽位时，必须赋予最顶层的 stacking context (z-50)，确保弹出的 Tooltip 绝不会被其他槽位遮挡！
        const zIndexClass = isCurrentHovered ? 'z-50' : 'z-10';
        const equipped = equippedSlots.get(slotKey);
        return (
            <div key={slotKey} className={`absolute ${positionClass} ${zIndexClass}`}>
                <DiabloEquipmentSlot
                    slot={slotKey}
                    item={equipped?.item}
                    sourceSlot={equipped?.sourceSlot}
                    disabled={disabled}
                    placement={placement}
                    onInspect={onInspect}
                    onHover={setHoveredSlot}
                />
            </div>
        );
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
            {/* 顶部标题与装等概览 */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-orange-500" />
                        <span>装备装配</span>
                    </h4>
                    {goldCount > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                            <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                            <span>{goldCount} 传奇</span>
                        </span>
                    )}
                    {blueCount > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-sky-50 border border-sky-200/80 px-1.5 py-0.2 text-[10px] font-bold text-sky-700">
                            <span>{blueCount} 稀有</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2.5 text-[11px]">
                    <span className="text-slate-400">
                        平均装等 <strong className="font-mono text-slate-700 font-bold">{avgLevel}</strong>
                    </span>
                    <span className="text-slate-200">|</span>
                    <span className="text-slate-400">
                        已装配 <strong className="text-orange-600 font-bold">{equippedCount}</strong> / 9
                    </span>
                </div>
            </div>

            {/* 白色现代主题：英雄装备纸娃娃展台 (overflow-visible 保证 Tooltip 浮窗不被截断) */}
            <div className="relative w-full h-[410px] sm:h-[430px] rounded-2xl bg-gradient-to-b from-slate-50/90 via-white to-orange-50/20 border border-slate-200/90 shadow-2xs select-none">
                {/* 独立背景裁剪层 (背景光晕与包角不超出圆角) */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    {/* 展台四角精致浅橙色现代几何包角 */}
                    <div className="absolute top-2.5 left-2.5 w-3 h-3 border-t-2 border-l-2 border-orange-300/60 rounded-tl-sm" />
                    <div className="absolute top-2.5 right-2.5 w-3 h-3 border-t-2 border-r-2 border-orange-300/60 rounded-tr-sm" />
                    <div className="absolute bottom-2.5 left-2.5 w-3 h-3 border-b-2 border-l-2 border-orange-300/60 rounded-bl-sm" />
                    <div className="absolute bottom-2.5 right-2.5 w-3 h-3 border-b-2 border-r-2 border-orange-300/60 rounded-br-sm" />

                    {/* 展台中心空灵魔导星盘水印剪影 */}
                    <div className="absolute inset-0 flex items-center justify-center p-2">
                        <DiabloHumanSilhouette
                            activeSlot={hoveredSlot}
                            className="h-full w-full max-w-[340px] max-h-[420px]"
                        />
                    </div>
                </div>

                {/* 9 个暗黑纸娃娃装备槽位 (根据 hover 动态提升 z-index，彻底解决装备遮挡 Tooltip) */}
                {/* 1. 中轴线防具 (头部 -> 胸甲 -> 双足) */}
                {renderSlot('head', 'top-center', 'top-[3.5%] left-1/2 -translate-x-1/2')}
                {renderSlot('body', 'mid-center', 'top-[36%] left-1/2 -translate-x-1/2')}
                {renderSlot('feet', 'bottom-center', 'bottom-[3.5%] left-1/2 -translate-x-1/2')}

                {/* 2. 左翼部位 (上：手套 -> 中：武器 -> 下：戒指位 1) */}
                {renderSlot('hands', 'top-left', 'top-[12%] left-[4%] sm:left-[6%]')}
                {renderSlot('weapon', 'mid-left', 'top-[42%] left-[4%] sm:left-[6%]')}
                {renderSlot('ring_1', 'bottom-left', 'bottom-[9%] left-[6%] sm:left-[9%]')}

                {/* 3. 右翼部位 (上：吊坠 -> 中：副手 -> 下：戒指位 2) */}
                {renderSlot('accessory', 'top-right', 'top-[12%] right-[4%] sm:right-[6%]')}
                {renderSlot('offhand', 'mid-right', 'top-[42%] right-[4%] sm:right-[6%]')}
                {renderSlot('ring_2', 'bottom-right', 'bottom-[9%] right-[6%] sm:right-[9%]')}
            </div>
        </section>
    );
}
