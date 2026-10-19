import {useRef, useState} from 'react';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {
    hasLoadoutSlotCandidate,
    resolveLoadoutHeroArchetype,
    resolveLoadoutSlots,
} from './loadoutPresentation';
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
    const stageRef = useRef<HTMLDivElement | null>(null);
    const equippedSlots = resolveLoadoutSlots(profile);
    const equippedCount = equippedSlots.size;
    const heroArchetype = resolveLoadoutHeroArchetype(profile.progression?.job);

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
        const hasCandidate = !equipped && hasLoadoutSlotCandidate(profile, slotKey, equippedSlots);
        return (
            <div key={slotKey} className={`absolute ${positionClass} ${zIndexClass}`}>
                <DiabloEquipmentSlot
                    slot={slotKey}
                    item={equipped?.item}
                    sourceSlot={equipped?.sourceSlot}
                    hasCandidate={hasCandidate}
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
            <div
                ref={stageRef}
                className="relative w-full h-[480px] sm:h-[500px] rounded-2xl bg-gradient-to-b from-slate-50/95 via-white to-orange-50/20 border border-slate-200/90 shadow-2xs select-none"
            >
                {/* 独立背景裁剪层 (背景光晕、人物立绘、连接引线与包角不超出圆角) */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    {/* 展台四角精致浅橙色现代几何包角 */}
                    <div className="absolute top-3 left-3 w-3.5 h-3.5 border-t-2 border-l-2 border-orange-400/70 rounded-tl-sm" />
                    <div className="absolute top-3 right-3 w-3.5 h-3.5 border-t-2 border-r-2 border-orange-400/70 rounded-tr-sm" />
                    <div className="absolute bottom-3 left-3 w-3.5 h-3.5 border-b-2 border-l-2 border-orange-400/70 rounded-bl-sm" />
                    <div className="absolute bottom-3 right-3 w-3.5 h-3.5 border-b-2 border-r-2 border-orange-400/70 rounded-br-sm" />

                    {/* 展台中心一转职业英雄立绘、脚底光环与解剖对位引线 */}
                    <DiabloHumanSilhouette
                        activeSlot={hoveredSlot}
                        archetype={heroArchetype}
                        equippedSlots={equippedSlots}
                        stageRef={stageRef}
                    />
                </div>

                {/* 9 个环绕式装备槽位 (中心人物与脚底光环 100% 无遮挡，悬停时提升 z-index 防止 Tooltip 遮挡) */}
                {/* 1. 顶部中轴：头饰 */}
                {renderSlot('head', 'top-center', 'top-[1.5%] left-1/2 -translate-x-1/2')}

                {/* 2. 左翼四槽 (手套 -> 武器 -> 护甲 -> 戒指位 1) */}
                {renderSlot('hands', 'top-left', 'top-[13%] left-[3%] sm:left-[4%]')}
                {renderSlot('weapon', 'mid-left', 'top-[36.5%] left-[1.5%] sm:left-[2.5%]')}
                {renderSlot('body', 'mid-left', 'top-[60%] left-[1.5%] sm:left-[2.5%]')}
                {renderSlot('ring_1', 'bottom-left', 'bottom-[2%] left-[7%] sm:left-[8%]')}

                {/* 3. 右翼四槽 (吊坠 -> 副手 -> 靴子 -> 戒指位 2) */}
                {renderSlot('accessory', 'top-right', 'top-[13%] right-[3%] sm:right-[4%]')}
                {renderSlot('offhand', 'mid-right', 'top-[36.5%] right-[1.5%] sm:right-[2.5%]')}
                {renderSlot('feet', 'mid-right', 'top-[60%] right-[1.5%] sm:right-[2.5%]')}
                {renderSlot('ring_2', 'bottom-right', 'bottom-[2%] right-[7%] sm:right-[8%]')}
            </div>
        </section>
    );
}
