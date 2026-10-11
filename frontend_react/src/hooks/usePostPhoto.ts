import {useCallback, useEffect, useState} from 'react';
import {getPostPhoto, operatePostPhoto, type PostPhotoState} from '@/api/postPhoto';

export function usePostPhoto(postId: string, onInserted: () => void) {
    const [state, setState] = useState<PostPhotoState>({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        const refresh = async () => {
            try {
                const next = await getPostPhoto(postId, controller.signal);
                if (controller.signal.aborted) return;
                setState(next);
                if (next.status === 'inserted') onInserted();
            } catch { /* Reading a public post does not require access to its image controls. */ }
        };
        void refresh();
        return () => {controller.abort();};
    }, [postId, onInserted]);
    const operate = useCallback(async (action: 'query' | 'retry' | 'use_image') => {
        setBusy(true); setError('');
        try {
            const next = await operatePostPhoto(postId, action);
            setState(next);
            if (next.status === 'inserted') onInserted();
        } catch (reason) {setError(reason instanceof Error ? reason.message : '配图操作失败');}
        finally {setBusy(false);}
    }, [postId, onInserted]);
    // Resume polling after a manual query or retry.
    useEffect(() => {
        if (!['pending', 'generating'].includes(state.status || '')) return;
        const controller = new AbortController();
        const timer = setInterval(() => {
            void getPostPhoto(postId, controller.signal).then(next => {
                if (controller.signal.aborted) return;
                setState(next);
                if (next.status === 'inserted') onInserted();
            }).catch(() => {});
        }, 5000);
        return () => {controller.abort(); clearInterval(timer);};
    }, [postId, state.status, onInserted]);
    return {state, error, busy, operate};
}
