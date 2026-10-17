import type {ComponentType} from 'react';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {qualityLabels, slotLabels} from './presentation';
import {resolveLoadoutSlots} from './loadoutPresentation';
import {EquipmentPortrait} from './atlas/EquipmentPortrait';
import {Crown, Footprints, Gem, Hand, Shield, Sword} from 'lucide-react';

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

// 按照 RPG 身体拓扑重排：主手与副手相邻，防护部位沿右列排列。
const topologySlots: {slot: string; group: 'offense' | 'defense'}[] = [
    {slot: 'weapon', group: 'offense'},
    {slot: 'offhand', group: 'defense'},
    {slot: 'head', group: 'defense'},
    {slot: 'hands', group: 'offense'},
    {slot: 'body', group: 'defense'},
    {slot: 'accessory', group: 'offense'},
    {slot: 'ring_1', group: 'offense'},
    {slot: 'ring_2', group: 'offense'},
    {slot: 'feet', group: 'defense'},
];

export default function CombatLoadoutSlots({
    profile,
    disabled,
    onInspect,
}: {
    profile: CombatProfile;
    disabled?: boolean;
    onInspect: (item: CombatEquipment, remove?: boolean, slot?: string) => void;
}) {
    const equippedSlots = resolveLoadoutSlots(profile);
    const equippedCount = equippedSlots.size;

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-orange-500" />
                    <span>装备装配（纸娃娃九槽）</span>
                </h4>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                         已装配 <strong className="text-orange-600 font-bold">{equippedCount}</strong> / 9
                    </span>
                </div>
            </div>

            {/* 九槽位网格：双戒指独立占位 */}
            <div className="grid grid-cols-2 gap-2">
                {topologySlots.map(({slot}) => {
                    const equipped = equippedSlots.get(slot);
                    const item = equipped?.item;
                    const Icon = slotIcons[slot] || Shield;
                    const label = slotLabels[slot] || slot;

                    if (item) {
                        const gear = item.snapshot;
                        const isGold = gear.quality === 'gold';
                        const isBlue = gear.quality === 'blue';
                        const borderStyle = isGold
                            ? 'border-amber-300 bg-gradient-to-br from-amber-50/40 to-yellow-50/20 hover:border-amber-400 hover:shadow-xs'
                            : isBlue
                              ? 'border-sky-200 bg-gradient-to-br from-sky-50/40 to-cyan-50/20 hover:border-sky-300 hover:shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs';

                        const iconBg = isGold
                            ? 'bg-amber-100 text-amber-700'
                            : isBlue
                              ? 'bg-sky-100 text-sky-600'
                              : 'bg-slate-100 text-slate-600';

                        return (
                            <button
                                key={slot}
                                type="button"
                                disabled={disabled}
                                onClick={() => onInspect(item, true, equipped?.sourceSlot)}
                                title={`已装备：${gear.name} (Lv.${gear.level})，点击卸下或查看`}
                                className={`group flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition-all active:scale-[0.98] ${borderStyle}`}
                            >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border p-0.5 ${iconBg} ${isGold ? 'border-amber-200' : isBlue ? 'border-sky-200' : 'border-slate-200'}`}>
                                    <EquipmentPortrait
                                        equipmentId={gear.templateId || item.templateId || item.id}
                                        name={gear.name}
                                        slot={gear.slot}
                                        equipmentType={gear.equipmentType || item.displayType}
                                        bossOnly={(gear.templateId || item.templateId || item.id).includes('boss')}
                                        decorative
                                        className="h-full w-full"
                                        fallbackClassName="h-5 w-5"
                                    />
                                </span>
                                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                                    <div className="flex min-w-0 items-center justify-between gap-1">
                                        <span className="truncate text-[10px] font-semibold text-slate-500">{label}</span>
                                        <span className="shrink-0 text-[10px] font-medium text-slate-400">Lv.{gear.level}</span>
                                    </div>
                                    <div className="flex min-w-0 items-center justify-between gap-1">
                                        <span className="truncate text-xs font-bold text-slate-800 group-hover:text-orange-600">
                                            {gear.name}
                                        </span>
                                        <span className={`shrink-0 rounded px-1 py-0.2 text-[9px] font-bold ${
                                            isGold ? 'bg-amber-100/70 text-amber-700' : isBlue ? 'bg-sky-100/70 text-sky-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {qualityLabels[gear.quality] || gear.quality}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    }

                    return (
                        <div
                            key={slot}
                            className="flex flex-col justify-between rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 p-2 transition-colors hover:border-slate-300"
                        >
                            <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                                        <Icon className="h-3 w-3" />
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-400">{label}</span>
                                </div>
                                <span className="text-[9px] text-slate-300">待装配</span>
                            </div>
                            <span className="mt-1.5 text-[11px] text-slate-400 font-medium">空槽位</span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
