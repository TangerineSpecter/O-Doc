import {useCallback, useEffect, useRef, useState} from 'react';
import {getPostPhoto, operatePostPhoto, type PostPhotoAction, type PostPhotoState} from '@/api/postPhoto';

export function usePostPhoto(postId: string, onChanged: () => void) {
    const [state, setState] = useState<PostPhotoState>({});
    const [error, setError] = useState('');
    const [queryError, setQueryError] = useState('');
    const [busy, setBusy] = useState(false);
    const operatingRef = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        const refresh = async () => {
            try {
                const next = await getPostPhoto(postId, controller.signal);
                if (controller.signal.aborted) return;
                setState(next);
                setQueryError('');
                if (next.status === 'inserted' || next.status === 'removed') onChanged();
            } catch { /* Reading a public post does not require access to its image controls. */ }
        };
        void refresh();
        return () => {controller.abort();};
    }, [postId, onChanged]);
    const operate = useCallback(async (action: PostPhotoAction) => {
        if (operatingRef.current) return;
        operatingRef.current = true;
        setBusy(true); setError('');
        try {
            const next = await operatePostPhoto(postId, action);
            setState(next);
            if (next.status === 'inserted' || next.status === 'removed') onChanged();
        } catch (reason) {setError(reason instanceof Error ? reason.message : '配图操作失败');}
        finally {operatingRef.current = false; setBusy(false);}
    }, [postId, onChanged]);
    // Resume polling after a manual query or retry.
    useEffect(() => {
        if (!['pending', 'generating'].includes(state.status || '') && !state.recovering && !(state.retryAfterSeconds && state.retryAfterSeconds > 0)) return;
        const controller = new AbortController();
        const timer = setInterval(() => {
            void getPostPhoto(postId, controller.signal).then(next => {
                if (controller.signal.aborted) return;
                setState(next);
                setQueryError('');
                if (next.status === 'inserted' || next.status === 'removed') onChanged();
            }).catch(() => {
                if (!controller.signal.aborted) setQueryError('暂时无法读取配图状态，正在重试；这不代表生成失败。');
            });
        }, 5000);
        return () => {controller.abort(); clearInterval(timer);};
    }, [postId, state.status, state.recovering, state.retryAfterSeconds, onChanged]);
    return {state, error: error || queryError, busy, operate};
}
