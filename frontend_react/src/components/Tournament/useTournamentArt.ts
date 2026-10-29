import {useCallback, useEffect, useState} from 'react';
import {applyTournamentArt, generateTournamentArt, getTournamentArt, releaseTournamentArt} from '@/api/tournamentArt';
import type {TournamentArtData} from '@/api/tournamentArt';

const active = new Set(['submitting', 'generating', 'download_pending']);
export function useTournamentArt(id: string, modelId: string) {
    const [data, setData] = useState<TournamentArtData | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const load = async (poll: boolean) => {
            try {
                const value = await getTournamentArt(id, modelId, poll);
                if (stopped) return;
                setData(value); setError('');
                if (value.task && active.has(value.task.status)) timer = setTimeout(() => void load(true), 5000);
            } catch (err) {
                if (stopped) return;
                setError(err instanceof Error ? err.message : '读取配图失败');
                if (poll) timer = setTimeout(() => void load(true), 10000);
            }
        };
        void load(false);
        return () => {stopped = true; clearTimeout(timer);};
    }, [id, modelId, revision]);
    const run = useCallback(async (operation: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true); setError('');
        try {await operation(); setRevision(value => value + 1);}
        catch (err) {setError(err instanceof Error ? err.message : '操作失败');}
        finally {setBusy(false);}
    }, [busy]);
    return {data, error, busy, active: !!data?.task && active.has(data.task.status),
        reload: () => setRevision(value => value + 1),
        generate: (momentId: string, prompt: string, styleReferenceImageId?: string) => run(() => generateTournamentArt(id, {modelId, momentId, prompt, styleReferenceImageId})),
        apply: (source: {taskId?: string; assetId?: string}) => run(() => applyTournamentArt(id, source)),
        release: () => run(() => releaseTournamentArt(id))};
}
