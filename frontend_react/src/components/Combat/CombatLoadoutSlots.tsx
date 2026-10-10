import type {ComponentType} from 'react';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {qualityLabels, slotLabels} from './presentation';
import {Crown, Footprints, Gem, Hand, Shield, Sword} from 'lucide-react';

const slotIcons: Record<string, ComponentType<{className?: string}>> = {
    weapon: Sword,
    head: Crown,
    body: Shield,
    hands: Hand,
    feet: Footprints,
    accessory: Gem,
};

export default function CombatLoadoutSlots({
    profile,
    disabled,
    onInspect,
}: {
    profile: CombatProfile;
    disabled?: boolean;
    onInspect: (item: CombatEquipment, remove?: boolean) => void;
}) {
    const slots = ['weapon', 'head', 'body', 'hands', 'feet', 'accessory'];

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-orange-500" />
                    <span>装备装配（六槽）</span>
                </h4>
                <span className="text-[11px] text-slate-400">
                    已装备 {Object.values(profile.loadout).filter(Boolean).length} / 6
                </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {slots.map(slot => {
                    const equipmentId = profile.loadout[slot];
                    const item = profile.equipment.find(e => e.id === equipmentId);
                    const Icon = slotIcons[slot] || Shield;
                    const label = slotLabels[slot] || slot;

                    if (item) {
                        const gear = item.snapshot;
                        const isGold = gear.quality === 'gold';
                        const isBlue = gear.quality === 'blue';
                        const borderStyle = isGold
                            ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400'
                            : isBlue
                              ? 'border-sky-200 bg-sky-50/20 hover:border-sky-300'
                              : 'border-slate-200 bg-white hover:border-slate-300';

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
                                title="点击卸下或查看装备"
                                className={`group flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all hover:shadow-2xs ${borderStyle}`}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                                            <Icon className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-700 truncate">{label}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 shrink-0">Lv.{gear.level}</span>
                                </div>
                                <div className="mt-2 flex items-baseline justify-between gap-1">
                                    <span className="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600">
                                        {gear.name}
                                    </span>
                                    <span className={`text-[10px] shrink-0 font-medium ${isGold ? 'text-amber-700' : isBlue ? 'text-sky-700' : 'text-slate-500'}`}>
                                        {qualityLabels[gear.quality] || gear.quality}
                                    </span>
                                </div>
                            </button>
                        );
                    }

                    return (
                        <div
                            key={slot}
                            className="flex flex-col justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-2.5 transition-colors"
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                    <Icon className="h-3.5 w-3.5" />
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">{label}</span>
                            </div>
                            <span className="mt-2 text-xs text-slate-400">空槽位</span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
