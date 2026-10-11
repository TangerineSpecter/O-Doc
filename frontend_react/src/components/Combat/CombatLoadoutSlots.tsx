import type {ComponentType} from 'react';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {qualityLabels, slotLabels} from './presentation';
import {Crown, Footprints, Gem, Hand, Shield, Sparkles, Sword} from 'lucide-react';

const slotIcons: Record<string, ComponentType<{className?: string}>> = {
    weapon: Sword,
    head: Crown,
    body: Shield,
    hands: Hand,
    feet: Footprints,
    accessory: Gem,
};

// 按照 RPG 身体拓扑重排：左列攻伐外装（武器、手套、护符），右列防御披挂（头饰、护甲、靴子）
const topologySlots: {slot: string; group: 'offense' | 'defense'}[] = [
    {slot: 'weapon', group: 'offense'},
    {slot: 'head', group: 'defense'},
    {slot: 'hands', group: 'offense'},
    {slot: 'body', group: 'defense'},
    {slot: 'accessory', group: 'offense'},
    {slot: 'feet', group: 'defense'},
];

export default function CombatLoadoutSlots({
    profile,
    disabled,
    onInspect,
}: {
    profile: CombatProfile;
    disabled?: boolean;
    onInspect: (item: CombatEquipment, remove?: boolean) => void;
}) {
    const equippedCount = Object.values(profile.loadout).filter(Boolean).length;

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-orange-500" />
                    <span>装备装配（纸娃娃六槽）</span>
                </h4>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                        已装配 <strong className="text-orange-600 font-bold">{equippedCount}</strong> / 6
                    </span>
                </div>
            </div>

            {/* 六槽位网格：左攻右守双列对称排列 */}
            <div className="grid grid-cols-2 gap-2">
                {topologySlots.map(({slot}) => {
                    const equipmentId = profile.loadout[slot];
                    const item = profile.equipment.find(e => e.id === equipmentId);
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
                                onClick={() => onInspect(item, true)}
                                title={`已装备：${gear.name} (Lv.${gear.level})，点击卸下或查看`}
                                className={`group flex flex-col justify-between rounded-xl border p-2 text-left transition-all active:scale-[0.98] ${borderStyle}`}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
                                            <Icon className="h-3 w-3" />
                                        </span>
                                        <span className="text-[10px] font-semibold text-slate-500 truncate">{label}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">Lv.{gear.level}</span>
                                </div>
                                <div className="mt-1.5 flex items-baseline justify-between gap-1">
                                    <span className="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600">
                                        {gear.name}
                                    </span>
                                    <span
                                        className={`text-[9px] shrink-0 font-bold px-1 py-0.2 rounded ${
                                            isGold
                                                ? 'bg-amber-100/70 text-amber-700'
                                                : isBlue
                                                  ? 'bg-sky-100/70 text-sky-700'
                                                  : 'bg-slate-100 text-slate-600'
                                        }`}
                                    >
                                        {qualityLabels[gear.quality] || gear.quality}
                                    </span>
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
