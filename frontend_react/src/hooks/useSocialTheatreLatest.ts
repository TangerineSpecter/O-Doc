import {useEffect, useState} from 'react';
import {getCurrentSocialTheatreEvent} from '../api/social';
import type {SocialTheatreEvent} from '../types/api/social';
import {theatrePollInterval} from '../utils/socialTheatre';

export function useSocialTheatreLatest(refreshToken = 0) {
    const [event, setEvent] = useState<SocialTheatreEvent | null>(null);
    const [loadedToken, setLoadedToken] = useState<number | null>(null);

    useEffect(() => {
        let timer: number | undefined;
        let request: AbortController | undefined;
        let interval = theatrePollInterval();
        const stop = () => {
            window.clearTimeout(timer);
            request?.abort();
        };
        const poll = async () => {
            if (document.hidden) return;
            const controller = new AbortController();
            request = controller;
            try {
                const {items} = await getCurrentSocialTheatreEvent(controller.signal);
                if (controller.signal.aborted) return;
                const current = items[0] ?? null;
                setEvent(current);
                interval = theatrePollInterval(current?.status);
            } catch {
                // Retain the last scene during a transient failure.
            } finally {
                if (!controller.signal.aborted) {
                    setLoadedToken(refreshToken);
                    timer = window.setTimeout(poll, interval);
                }
            }
        };
        const onVisibility = () => {
            stop();
            void poll();
        };
        void poll();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [refreshToken]);

    return {event, loading: loadedToken !== refreshToken};
}
