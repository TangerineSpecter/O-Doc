import {useEffect, useState} from 'react';
import {getTravel} from '../../api/travel';
import type {TravelJourney} from '../../types/api/travel';
import WorldDialog from './WorldDialog';
import TravelDetailDialog from './TravelDetailDialog';

export default function TravelJourneyDialog({journeyId, onClose, onChanged}: {
    journeyId: string;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [journey, setJourney] = useState<TravelJourney | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setJourney(null);
        setError('');
        getTravel(journeyId, controller.signal)
            .then(value => {if (!controller.signal.aborted) setJourney(value);})
            .catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '旅行详情读取失败');});
        return () => controller.abort();
    }, [journeyId, revision]);

    if (journey) {
        return <TravelDetailDialog journey={journey} onClose={onClose} onChanged={onChanged}/>;
    }
    return <WorldDialog title="旅行详情" onClose={onClose} manageFocus={false}>
        {error ? <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={() => setRevision(value => value + 1)} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">重试</button>
        </div> : <p className="py-10 text-center text-sm text-slate-500">正在读取旅行详情…</p>}
    </WorldDialog>;
}
