import {useEffect} from 'react';
import {reportReadDuration} from '../api/stats';

export const useReadStats = (articleId?: string, reportInterval = 15000) => {
    useEffect(() => {
        if (!articleId) return;

        let visibleSince = document.hidden ? null : performance.now();
        let pendingMs = 0;
        let sending = false;
        let closed = false;

        const collect = () => {
            const now = performance.now();
            if (visibleSince !== null) pendingMs += now - visibleSince;
            visibleSince = document.hidden || closed ? null : now;
        };

        const flush = async () => {
            if (sending) return;
            const seconds = Math.min(86400, Math.floor(pendingMs / 1000));
            if (!seconds) return;
            // Reserve this batch before sending, including when cleanup races a heartbeat.
            pendingMs -= seconds * 1000;
            sending = true;
            const finalAttempt = closed;
            let succeeded = false;
            try {
                await reportReadDuration(articleId, seconds);
                succeeded = true;
            } catch (error) {
                pendingMs += seconds * 1000;
                console.warn('阅读时长上报失败', error);
            } finally {
                sending = false;
                if (closed && (!finalAttempt || succeeded)) void flush();
            }
        };
        const heartbeat = () => {
            collect();
            void flush();
        };
        const timer = window.setInterval(heartbeat, reportInterval);
        document.addEventListener('visibilitychange', collect);
        return () => {
            closed = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', collect);
            heartbeat();
        };
    }, [articleId, reportInterval]);
};
