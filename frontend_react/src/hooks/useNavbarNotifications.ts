import {useCallback, useEffect, useRef, useState} from 'react';
import {getUnreadNotificationCount, pushRandomMemoNotification} from '../api/message';
import {getMemosPushConfig} from '../api/setting';
import {runScheduledMemoPush} from '../utils/memoPushSchedule';

export function useNavbarNotifications(userId?: string) {
    const [badge, setBadge] = useState({userId, count: 0});
    const pending = useRef<AbortController | null>(null);
    const setUnreadCount = useCallback((count: number) => {
        pending.current?.abort();
        pending.current = null;
        setBadge({userId, count});
    }, [userId]);
    useEffect(() => {
        if (!userId) return;
        let active = true;

        const fetchUnread = async () => {
            if (document.hidden || pending.current) return;
            const controller = new AbortController();
            pending.current = controller;
            try {
                const {count} = await getUnreadNotificationCount(controller.signal);
                if (active && !controller.signal.aborted) setBadge({userId, count});
            } catch (error) {
                if (!controller.signal.aborted) console.warn('未读通知数量读取失败', error);
            } finally {
                if (pending.current === controller) pending.current = null;
            }
        };
        void fetchUnread();
        const unreadTimer = setInterval(fetchUnread, 60000);
        document.addEventListener('visibilitychange', fetchUnread);

        let busy = false;
        let checkedMinute = -1;
        let configRevision = 0;
        const checkMemosPush = async () => {
            const minute = Math.floor(Date.now() / 60000);
            if (busy || minute === checkedMinute) return;
            busy = true;
            const revision = configRevision;
            try {
                const config = await getMemosPushConfig();
                if (!active || revision !== configRevision) return;
                checkedMinute = minute;
                if (!config?.enabled) return;

                const pushed = await runScheduledMemoPush(userId, config,
                    () => active && revision === configRevision, pushRandomMemoNotification);
                if (pushed && active) {
                    pending.current?.abort();
                    pending.current = null;
                    await fetchUnread();
                }
            } catch (error) {
                checkedMinute = -1;
                console.warn('Memos 定时推送检查失败', error);
            } finally {
                busy = false;
                if (active && revision !== configRevision) void checkMemosPush();
            }
        };

        checkMemosPush();
        const onSaved = () => {
            configRevision++;
            checkedMinute = -1;
            void checkMemosPush();
        };
        window.addEventListener('memos-push-config-saved', onSaved);
        const timer = setInterval(checkMemosPush, 30000);
        return () => {
            active = false;
            pending.current?.abort();
            pending.current = null;
            clearInterval(timer);
            clearInterval(unreadTimer);
            document.removeEventListener('visibilitychange', fetchUnread);
            window.removeEventListener('memos-push-config-saved', onSaved);
        };
    }, [userId]);
    return {unreadCount: badge.userId === userId ? badge.count : 0, setUnreadCount};
}
