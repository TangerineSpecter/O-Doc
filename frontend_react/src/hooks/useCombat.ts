import {useCallback, useEffect, useState} from 'react';
import {getCombatCatalog, getCombatProfile, getCombatHistory} from '../api/combat';
import type {CombatCatalog, CombatProfile, CombatHistory} from '../types/api/combat';
export function useCombat(actorId: string) {
    const [data, setData] = useState<{actor: string; catalog: CombatCatalog; profile: CombatProfile | null; history: CombatHistory | null} | null>(null);
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    const [page, setPage] = useState(1);
    const reload = useCallback(() => setVersion(v => v + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        Promise.all([getCombatCatalog(controller.signal), actorId ? getCombatProfile(actorId, controller.signal) : null,
            actorId ? getCombatHistory(actorId, page, controller.signal) : null])
            .then(([catalog, profile, history]) => {if (!controller.signal.aborted) setData({actor: actorId, catalog, profile, history});})
            .catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '冒险资料读取失败');});
        return () => controller.abort();
    }, [actorId, page, version]);
    return {data: data?.actor === actorId ? data : null, error, reload, page, setPage};
}
