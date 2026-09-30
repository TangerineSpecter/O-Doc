import {socialTime} from './socialTime';
import type {DailyFeedEvent} from '../types/api/dailyFeed';

/** 居民已在卡片头部展示，时间轴只保留实际动作与对象。 */
export function residentActivitySummary(event: DailyFeedEvent, name: string): string {
    if (event.currentAction) return event.currentAction;
    const title = name && event.title.startsWith(name) ? event.title.slice(name.length).trim() : event.title;
    return title || event.title;
}

export function groupResidentActivities(events: DailyFeedEvent[]): {date: string; events: DailyFeedEvent[]}[] {
    const groups = new Map<string, DailyFeedEvent[]>();
    for (const event of events) {
        const date = socialTime(event.occurredAt).split(' ')[0];
        const group = groups.get(date) || [];
        group.push(event);
        groups.set(date, group);
    }
    return Array.from(groups, ([date, rows]) => ({date, events: rows}));
}
