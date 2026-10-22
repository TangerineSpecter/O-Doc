import {useEffect, useState} from 'react';
import {getDailyFeed} from '../api/agentWorld';
import {getTokenRequests} from '../api/tokenUsage';
import type {TokenFilters, TokenRequest} from '../types/api/tokenUsage';
import type {DailyFeedEvent} from '../types/api/dailyFeed';

async function allRequests(filters: TokenFilters, signal: AbortSignal): Promise<TokenRequest[]> {
    const rows = new Map<string, TokenRequest>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    while (!signal.aborted) {
        const page = await getTokenRequests({...filters, cursor}, signal);
        page.items.forEach(row => rows.set(row.id, row));
        if (!page.hasMore) return [...rows.values()];
        if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('请求分页游标无效，无法确认完整范围');
        cursor = page.nextCursor;
        cursors.add(cursor);
    }
    return [];
}

async function allFacts(agentId: string, date: string, signal: AbortSignal): Promise<DailyFeedEvent[]> {
    const rows = new Map<string, DailyFeedEvent>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    while (!signal.aborted) {
        const page = await getDailyFeed({category: 'all', actor_id: agentId, date, cursor, page_size: 30}, signal);
        page.items.forEach(row => rows.set(row.id, row));
        if (!page.hasMore) return [...rows.values()];
        if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('活动分页游标无效');
        cursor = page.nextCursor;
        cursors.add(cursor);
    }
    return [];
}

interface State {key: string; requests: TokenRequest[]; facts: DailyFeedEvent[]; errors: string[]}
export function useTokenObservatory(agentId: string, date: string, recordId?: string, refresh = 0) {
    const key = JSON.stringify([agentId, date, recordId, refresh]);
    const [state, setState] = useState<State>({key: '', requests: [], facts: [], errors: []});
    useEffect(() => {
        const controller = new AbortController();
        const [actor, day, record] = JSON.parse(key) as [string, string, string | undefined];
        const filters: TokenFilters = record ? {all: '1', record_id: record} : {agent_id: actor, start_date: day, end_date: day};
        void Promise.allSettled([
            allRequests(filters, controller.signal),
            !record && actor ? allFacts(actor, day, controller.signal) : Promise.resolve([] as DailyFeedEvent[]),
        ]).then(([requests, facts]) => {
            if (controller.signal.aborted) return;
            setState({key, requests: requests.status === 'fulfilled' ? requests.value : [], facts: facts.status === 'fulfilled' ? facts.value : [],
                errors: [requests.status === 'rejected' ? '模型请求加载失败，消耗与覆盖范围尚未确认' : '', facts.status === 'rejected' ? '业务活动加载失败，时间轴暂不完整' : ''].filter(Boolean)});
        });
        return () => controller.abort();
    }, [key]);
    return state.key === key ? {...state, loading: false} : {requests: [], facts: [], errors: [], loading: true};
}
