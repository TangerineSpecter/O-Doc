import {useEffect, useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import CombatObservationView from '../Combat/CombatObservationView';
import {useCombatObservation} from '../../hooks/useCombatObservation';
import {getFishingTrip} from '../../api/fishing';
import {FishingTripDetails} from '../Fishing/FishingTripDetails';
import type {FishingDetail} from '../../types/api/fishing';
import type {LifeItem} from '../../types/api/agentLife';
import ExecutionObservatoryDialog from '../TokenUsage/ExecutionObservatoryDialog';

function ExplorationDetails({id}: {id: string}) {
    const state = useCombatObservation(id);
    if (!state.snapshot) return <p className="p-5 text-xs text-slate-500">{state.error || '正在加载探索记录…'}</p>;
    return <CombatObservationView snapshot={state.snapshot} events={state.events} disconnected={Boolean(state.error)}/>;
}
function FishingDetails({id, onClose}: {id: string; onClose: () => void}) {
    const [page, setPage] = useState(1);
    const [trip, setTrip] = useState<FishingDetail | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        getFishingTrip(id, page, controller.signal).then(value => {if (!controller.signal.aborted) {setTrip(value); setError('');}})
            .catch(err => {if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '加载失败');})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [id, page]);
    return <>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}{trip ? <FishingTripDetails trip={trip} loading={loading} onBack={onClose} onPage={setPage}/> : <p className="text-xs text-slate-500">{loading ? '正在加载出钓记录…' : '暂无出钓记录'}</p>}</>;
}
export function LifeDomainDetails({detail, recordId, onClose}: {detail: NonNullable<LifeItem['domainDetail']>; recordId?: string; onClose: () => void}) {
    if (detail.kind === 'blacksmith') return <ExecutionObservatoryDialog recordId={recordId || detail.id} taskName="铁匠铺打造" onClose={onClose}/>;
    return <WorldDialog title={detail.kind === 'fishing' ? '出钓记录' : '探索记录'} onClose={onClose} size="extra-wide">
        {detail.kind === 'fishing' ? <FishingDetails id={detail.id} onClose={onClose}/> : <ExplorationDetails id={detail.id}/>}
    </WorldDialog>;
}
