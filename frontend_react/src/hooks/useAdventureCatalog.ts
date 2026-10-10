import {useCallback, useEffect, useState} from 'react';
import {getCombatCatalog, getCombatProfile} from '../api/combat';
import type {CombatCatalog, CombatProfile} from '../types/api/combat';

/** The atlas reads reference data only; it never loads execution settings or history. */
export function useAdventureCatalog(actorId: string, active: boolean) {
    const [data, setData] = useState<{actorId: string; catalog: CombatCatalog; discoveries?: CombatProfile['discoveries']} | null>(null);
    const [failure, setFailure] = useState<{actorId: string; revision: number; message: string} | null>(null);
    const [revision, setRevision] = useState(0);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        Promise.all([getCombatCatalog(controller.signal), actorId ? getCombatProfile(actorId, controller.signal) : null])
            .then(([catalog, profile]) => {
                if (!controller.signal.aborted) {
                    setData({actorId, catalog, discoveries:profile?.discoveries});
                    setFailure(null);
                }
            })
            .catch(reason => {
                if (!controller.signal.aborted) setFailure({actorId, revision, message:reason instanceof Error ? reason.message : '冒险图鉴读取失败'});
            });
        return () => controller.abort();
    }, [actorId, active, revision]);
    return {data:data?.actorId === actorId ? data : null, error:failure?.actorId === actorId && failure.revision === revision ? failure.message : '', reload};
}
