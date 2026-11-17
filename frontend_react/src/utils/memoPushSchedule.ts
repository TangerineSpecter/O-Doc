import type {MemosPushConfig} from '../types/api/setting';
import {localMode} from '../config/development';

const pad = (value: number) => String(value).padStart(2, '0');

export async function runScheduledMemoPush(
    userId: string, config: MemosPushConfig, isCurrent: () => boolean, push: (schedule: string) => Promise<unknown>,
) {
    const matchesTime = (now: Date) => `${pad(now.getHours())}:${pad(now.getMinutes())}` === config.pushTime;
    if (!config.enabled || !matchesTime(new Date())) return;
    const key = `o-doc:memos-push:${localMode ? 'local' : 'api'}:${encodeURIComponent(userId)}:${config.frequency}:${config.pushTime}`;
    const run = async () => {
        const now = new Date();
        if (!isCurrent() || !matchesTime(now)) return;
        if (config.frequency === 'weekly' && String(now.getDay()) !== config.weekday) return;
        if (config.frequency === 'monthly' && String(now.getDate()) !== config.monthDay) return;
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const last = localStorage.getItem(key);
        if (last === today) return;
        // ISO date-only strings use UTC midnight, including across a local DST change.
        if (config.frequency === 'everyTwoDays' && last && Date.parse(today) - Date.parse(last) < 2 * 86400000) return;
        if (await push(`${today}:${config.frequency}:${config.pushTime}`)) {
            localStorage.setItem(key, today);
            return true;
        }
    };
    if (navigator.locks) return navigator.locks.request(key, run);
    return run();
}
