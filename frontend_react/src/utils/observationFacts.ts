import type {DailyFeedEvent, DailyFeedResult} from '../types/api/dailyFeed';
import {dayOf, shiftDay} from './tokenObservatory';

type FeedQuery = {category: 'all'; actor_id: string; date?: string; cursor?: string; page_size: number};
type ReadPage = (query: FeedQuery, signal: AbortSignal) => Promise<DailyFeedResult>;

/** 跨日使用活动历史游标跳过无记录的日期，直到越过开始日期。 */
export async function readObservationFacts(
    readPage: ReadPage, actor: string, start: string, end: string, signal: AbortSignal,
): Promise<DailyFeedEvent[]> {
    const sameDay = start === end;
    const rows = new Map<string, DailyFeedEvent>();
    const cursors = new Set<string>();
    let cursor = sameDay ? undefined : `${shiftDay(end, 1)}T00:00:00+08:00|!`;
    if (cursor) cursors.add(cursor);
    while (!signal.aborted) {
        const page = await readPage({category: 'all', actor_id: actor, ...(sameDay ? {date: start} : {}), cursor, page_size: 30}, signal);
        for (const row of page.items) {
            const day = dayOf(row.occurredAt);
            if (day >= start && day <= end) rows.set(row.id, row);
        }
        if (!page.hasMore || (!sameDay && page.items.some(row => dayOf(row.occurredAt) < start))) return [...rows.values()];
        if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('活动分页游标无效');
        cursor = page.nextCursor;
        cursors.add(cursor);
    }
    return [];
}
