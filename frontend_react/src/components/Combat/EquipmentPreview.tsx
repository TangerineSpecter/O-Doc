import {useEffect, useState} from 'react';
import {ArrowDown, ArrowRight, ArrowUp} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import EquipmentCard from './EquipmentCard';
import {previewCombatEquipment} from '../../api/combat';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {equipmentTypeLabels, slotLabels, statLabels} from './presentation';

type LoadoutSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'accessory' | 'ring_1' | 'ring_2';

export default function EquipmentPreview({
    profile,
    item,
    initialSlot,
    remove = false,
    busy,
    onConfirm,
    onClose,
}: {
    profile: CombatProfile;
    item: CombatEquipment;
    initialSlot?: string;
    remove?: boolean;
    busy: boolean;
    onConfirm: (slot: string) => void;
    onClose: () => void;
}) {
    const isRing = item.snapshot.equipmentType === 'ring';
    const suggestedSlot = (): LoadoutSlot => {
        if (initialSlot) return initialSlot as LoadoutSlot;
        if (!isRing) return item.snapshot.slot as LoadoutSlot;
        return profile.loadout.ring_1 ? 'ring_2' : 'ring_1';
    };
    const [targetSlot, setTargetSlot] = useState<LoadoutSlot>(suggestedSlot);
    const [preview, setPreview] = useState<Record<string, number | string> | null>(null);
    const [error, setError] = useState('');
    const replacesOffhand =
        !remove && item.snapshot.slot === 'weapon' &&
        item.snapshot.grip === 'two_handed' && Boolean(profile.loadout.offhand);

    useEffect(() => {
        setTargetSlot(suggestedSlot());
    }, [initialSlot, item.id, isRing, profile.actorId, profile.loadout.ring_1, profile.loadout.ring_2]);

    useEffect(() => {
        const controller = new AbortController();
        setPreview(null);
        setError('');
        previewCombatEquipment(
            profile.actorId,
            {[targetSlot]: remove ? null : item.id},
            controller.signal,
        ).then(data => {
            if (!controller.signal.aborted) setPreview(data.attributes);
        }).catch(reason => {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '预览失败');
        });
        return () => controller.abort();
    }, [profile.actorId, item.id, targetSlot, remove]);

    const occupiedRing = (slot: 'ring_1' | 'ring_2') => {
        const identity = profile.loadout[slot];
        return identity ? profile.equipment.find(gear => gear.id === identity)?.snapshot.name : undefined;
    };

    return (
        <WorldDialog title="换装预览" size="compact" onClose={onClose}>
            <EquipmentCard item={item} />
            {isRing && !remove && (
                <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">选择戒指槽位</p>
                    <div role="group" aria-label="选择戒指槽位" className="flex flex-wrap gap-2">
                        {(['ring_1', 'ring_2'] as const).map(slot => {
                            const occupiedBy = occupiedRing(slot);
                            const selected = targetSlot === slot;
                            const ringClass = selected
                                ? 'border-orange-300 bg-orange-50 text-orange-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200';
                            return (
                                <button
                                    key={slot}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => setTargetSlot(slot)}
                                    className={'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ' + ringClass}
                                >
                                    {slotLabels[slot]} · {occupiedBy ? '替换' + occupiedBy : '空'}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {replacesOffhand && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {(equipmentTypeLabels[item.snapshot.equipmentType || ''] || '双手武器') + '会占用副手栏，确认后自动卸下当前副手装备。'}
                </p>
            )}
            {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}

            {!preview && !error && (
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="h-16 rounded-xl bg-slate-100/80 animate-pulse border border-slate-200/60" />
                    <div className="h-16 rounded-xl bg-slate-100/80 animate-pulse border border-slate-200/60" />
                </div>
            )}

            {preview && (() => {
                const statChanges = Object.entries(preview)
                    .filter(([key, value]) => statLabels[key] && value !== profile.attributes[key])
                    .map(([key, value]) => {
                        const prevNum = Number(profile.attributes[key] ?? 0);
                        const nextNum = Number(value ?? 0);
                        const isNumeric = !Number.isNaN(prevNum) && !Number.isNaN(nextNum);
                        const diff = isNumeric ? Math.round((nextNum - prevNum) * 100) / 100 : 0;
                        return {
                            key,
                            label: statLabels[key],
                            prev: profile.attributes[key],
                            next: value,
                            isNumeric,
                            diff,
                            isUp: diff > 0,
                            isDown: diff < 0,
                        };
                    });

                if (statChanges.length === 0) {
                    return (
                        <div className="mt-3 py-3 px-4 text-center rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-400">
                            换装后属性无变动
                        </div>
                    );
                }

                return (
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                        {statChanges.map(change => (
                            <div
                                key={change.key}
                                className={`relative overflow-hidden rounded-xl border p-2.5 flex flex-col justify-between transition-all ${
                                    change.isUp
                                        ? 'bg-gradient-to-b from-emerald-50/60 via-emerald-50/20 to-white border-emerald-200/90 shadow-[0_1px_2px_rgba(16,185,129,0.06)]'
                                        : change.isDown
                                        ? 'bg-gradient-to-b from-rose-50/60 via-rose-50/20 to-white border-rose-200/90 shadow-[0_1px_2px_rgba(244,63,94,0.06)]'
                                        : 'bg-slate-50/80 border-slate-200/80'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-semibold text-slate-700 truncate">{change.label}</span>
                                    {change.isUp && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono bg-emerald-100/90 text-emerald-700 border border-emerald-200">
                                            <ArrowUp className="w-2.5 h-2.5 stroke-[3]" />
                                            +{change.diff}
                                        </span>
                                    )}
                                    {change.isDown && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono bg-rose-100/90 text-rose-700 border border-rose-200">
                                            <ArrowDown className="w-2.5 h-2.5 stroke-[3]" />
                                            {change.diff}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2.5 flex items-baseline gap-1.5">
                                    <span className="text-xs font-medium text-slate-400 font-mono">{String(change.prev)}</span>
                                    <ArrowRight
                                        className={`w-3 h-3 flex-shrink-0 self-center ${
                                            change.isUp ? 'text-emerald-400' : change.isDown ? 'text-rose-400' : 'text-slate-300'
                                        }`}
                                    />
                                    <span
                                        className={`text-base font-black font-mono tracking-tight leading-none ${
                                            change.isUp ? 'text-emerald-600' : change.isDown ? 'text-rose-600' : 'text-slate-700'
                                        }`}
                                    >
                                        {String(change.next)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}
            <button
                disabled={busy || !preview}
                onClick={() => onConfirm(targetSlot)}
                className="mt-4 w-full rounded-full bg-orange-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-[0.99] disabled:opacity-40"
            >
                {busy ? '正在处理...' : remove ? '确认卸下' : '确认穿戴'}
            </button>
        </WorldDialog>
    );
}
