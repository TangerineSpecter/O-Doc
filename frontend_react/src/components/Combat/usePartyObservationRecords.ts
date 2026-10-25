import {useEffect, useMemo, useRef, useState} from 'react';
import {getPartyEvents} from '../../api/combat';
import type {AdventurePartySnapshot, CombatEvent} from '../../types/api/combat';
import {mergePartyHistory, partyObservationRecords} from './partyObservationRecords';

export function usePartyObservationRecords(party: AdventurePartySnapshot | null | undefined, personal: CombatEvent[]) {
    const [history, setHistory] = useState<AdventurePartySnapshot['events']>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [exhausted, setExhausted] = useState(false);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const shared = useMemo(() => mergePartyHistory(history, party?.events || []), [history, party?.events]);
    const events = useMemo(() => party ? partyObservationRecords(personal, shared) : personal, [party, personal, shared]);
    const loadOlder = async () => {
        if (!party || loading || controller.current) return;
        setLoading(true);
        setError('');
        const request = new AbortController();
        controller.current = request;
        try {
            const value = await getPartyEvents(party.id, shared[0]?.sequence || 1, request.signal);
            if (request.signal.aborted) return;
            setHistory(previous => mergePartyHistory(previous, value.events));
            setExhausted(!value.hasMore);
        } catch (e) {
            if (!request.signal.aborted) setError(e instanceof Error ? e.message : '战报加载失败');
        } finally {
            if (!request.signal.aborted) {controller.current = null; setLoading(false);}
        }
    };
    return {events, loading, error, loadOlder, hasOlder: Boolean(party && !exhausted && (shared[0]?.sequence || 1) > 1)};
}
