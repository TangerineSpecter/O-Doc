import {useCallback, useEffect, useState} from 'react';
import {getAnthologyDetail, type Anthology} from '../api/anthology';

interface CollectionResult {
    collId?: string;
    generation: number;
    anthologyInfo: Anthology | null;
    error: unknown;
}

/** Resolve the collection before mounting a workspace that owns its article requests. */
export function useCollectionWorkspace(collId?: string) {
    const [generation, setGeneration] = useState(0);
    const [result, setResult] = useState<CollectionResult>({
        generation: -1, anthologyInfo: null, error: null,
    });
    useEffect(() => {
        if (!collId) return;
        let active = true;
        void getAnthologyDetail(collId).then(anthologyInfo => {
            if (active) setResult({collId, generation, anthologyInfo, error: null});
        }).catch(error => {
            if (active) setResult({collId, generation, anthologyInfo: null, error});
        });
        return () => {active = false;};
    }, [collId, generation]);

    const ready = result.collId === collId && result.generation === generation;
    const reload = useCallback(() => setGeneration(current => current + 1), []);
    return {
        anthologyInfo: ready ? result.anthologyInfo : null,
        error: ready ? result.error : null,
        loading: Boolean(collId) && !ready,
        reload,
    };
}
