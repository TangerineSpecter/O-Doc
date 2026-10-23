import {useCallback, useEffect, useRef, useState} from 'react';
import {getSocialTheatreEvents} from '../api/social';
import type {SocialTheatreEvent} from '../types/api/social';
import {selectTheatreEvent, theatrePollInterval} from '../utils/socialTheatre';

export function useSocialTheatreLatest(refreshToken = 0) {
    const [event, setEvent] = useState<SocialTheatreEvent | null>(null);
    const [loadedToken, setLoadedToken] = useState<number | null>(null);
    const isMounted = useRef(true);
    const requestId = useRef(0);

    const load = useCallback(async () => {
        const id = ++requestId.current;
        try {
            const res = await getSocialTheatreEvents();
            if (!isMounted.current || id !== requestId.current) return null;
            const latest = selectTheatreEvent(res.items || []);
            setEvent(latest);
            return latest;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        let active = true;
        isMounted.current = true;
        void Promise.resolve().then(() => active ? load() : null).finally(() => {
            if (active) setLoadedToken(refreshToken);
        });
        return () => {
            active = false;
            isMounted.current = false;
            requestId.current += 1;
        };
    }, [load, refreshToken]);

    useEffect(() => {
        let active = true;
        const interval = theatrePollInterval(event?.status);
        const poll = async () => {
            await load();
            if (active) timer = window.setTimeout(() => {void poll();}, interval);
        };
        let timer = window.setTimeout(() => {void poll();}, interval);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [event?.status, load]);

    return {event, loading: loadedToken !== refreshToken, reload: load};
}
