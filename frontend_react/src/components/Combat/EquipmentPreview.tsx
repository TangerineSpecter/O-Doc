import {useEffect, useState} from 'react';
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
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {preview && Object.entries(preview)
                    .filter(([key, value]) => statLabels[key] && value !== profile.attributes[key])
                    .map(([key, value]) => (
                        <div key={key} className="rounded-xl bg-slate-50 p-3">
                            <dt>{statLabels[key]}</dt>
                            <dd className="mt-1">{String(profile.attributes[key])} → {String(value)}</dd>
                        </div>
                    ))}
            </dl>
            <button
                disabled={busy || !preview}
                onClick={() => onConfirm(targetSlot)}
                className="mt-4 rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
                {remove ? '确认卸下' : '确认穿戴'}
            </button>
        </WorldDialog>
    );
}
