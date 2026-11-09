import {useEffect, useState} from 'react';
import {getUnreadNotificationCount, pushRandomMemoNotification} from '../api/message';
import {getMemosPushConfig} from '../api/setting';

const getLocalDateKey = (date: Date) => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const getDaysBetween = (fromDateKey: string, toDateKey: string) => {
    const from = new Date(`${fromDateKey}T00:00:00`);
    const to = new Date(`${toDateKey}T00:00:00`);
    return Math.floor((to.getTime() - from.getTime()) / 86400000);
};

export function useNavbarNotifications(userId?: string) {
    const [unreadCount, setUnreadCount] = useState(0);
    useEffect(() => {
        setUnreadCount(0);
        if (!userId) return;
        let active = true;
        let requestId = 0;
        const fetchUnread = async () => {
            if (document.hidden) return;
            const id = ++requestId;
            try {
                const {count} = await getUnreadNotificationCount();
                if (active && id === requestId) setUnreadCount(count);
            } catch (error) {
                console.warn('未读通知数量读取失败', error);
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

                const now = new Date();
                const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                if (currentTime !== config.pushTime) return;

                if (config.frequency === 'weekly' && String(now.getDay()) !== config.weekday) return;
                if (config.frequency === 'monthly' && String(now.getDate()) !== config.monthDay) return;

                const today = getLocalDateKey(now);
                const storageKey = `o-doc:memos-push:last:${config.frequency}:${config.pushTime}`;
                const lastPushedDate = localStorage.getItem(storageKey);
                if (lastPushedDate === today) return;
                if (config.frequency === 'everyTwoDays' && lastPushedDate && getDaysBetween(lastPushedDate, today) < 2) return;

                const notification = await pushRandomMemoNotification();
                if (notification) {
                    localStorage.setItem(storageKey, today);
                    if (active) await fetchUnread();
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
            clearInterval(timer);
            clearInterval(unreadTimer);
            document.removeEventListener('visibilitychange', fetchUnread);
            window.removeEventListener('memos-push-config-saved', onSaved);
        };
    }, [userId]);
    return {unreadCount, setUnreadCount};
}
