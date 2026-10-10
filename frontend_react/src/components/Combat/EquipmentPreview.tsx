import {useEffect, useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import EquipmentCard from './EquipmentCard';
import {previewCombatEquipment} from '../../api/combat';
import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import {statLabels} from './presentation';
export default function EquipmentPreview({profile,item,remove=false,busy,onConfirm,onClose}: {profile: CombatProfile; item: CombatEquipment; remove?: boolean; busy: boolean; onConfirm: () => void; onClose: () => void}) {
    const [preview,setPreview] = useState<Record<string, number | string> | null>(null);
    const [error,setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        previewCombatEquipment(profile.actorId,{[item.snapshot.slot]:remove ? null : item.id},controller.signal)
            .then(data => {if (!controller.signal.aborted) setPreview(data.attributes);}).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '预览失败');});
        return () => controller.abort();
    }, [profile.actorId,item.id,item.snapshot.slot,remove]);
    return <WorldDialog title="换装预览" size="compact" onClose={onClose}><EquipmentCard item={item}/>{error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{preview && Object.entries(preview).filter(([key,value]) => statLabels[key] && value !== profile.attributes[key]).map(([key,value]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><dt>{statLabels[key]}</dt><dd className="mt-1">{String(profile.attributes[key])} → {String(value)}</dd></div>)}</dl><button disabled={busy || !preview} onClick={onConfirm} className="mt-4 rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{remove ? '确认卸下' : '确认穿戴'}</button></WorldDialog>;
}
