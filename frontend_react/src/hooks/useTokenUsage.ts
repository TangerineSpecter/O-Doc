import {useEffect, useState} from 'react';
import {getTokenGroups, getTokenRequests, getTokenSummary} from '../api/tokenUsage';
import type {TokenFilters, TokenGroups, TokenRequests, TokenSummary} from '../types/api/tokenUsage';

export function useTokenUsage(filters: TokenFilters, group: string, page: number, refresh: number) {
    const filterKey = JSON.stringify(filters);
    const [summary, setSummary] = useState<TokenSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState('');
    const [groups, setGroups] = useState<TokenGroups | null>(null);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [groupError, setGroupError] = useState('');

    // 1. 请求全局 Overview Summary（仅在 filters 或 refresh 变化时触发，切换 group 不重新请求）
    useEffect(() => {
        const controller = new AbortController();
        setSummaryLoading(true);
        const params: TokenFilters = JSON.parse(filterKey);

        getTokenSummary(params, controller.signal)
            .then(data => {
                if (controller.signal.aborted) return;
                setSummary(data);
                setSummaryError('');
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                setSummaryError('用量概览加载失败，请重试');
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setSummaryLoading(false);
                }
            });

        return () => controller.abort();
    }, [filterKey, refresh]);

    // 2. 请求 Group 分组排行列表
    useEffect(() => {
        const controller = new AbortController();
        setGroupsLoading(true);
        const params: TokenFilters = JSON.parse(filterKey);
        const groupParams = {
            ...params,
            group,
            page,
            ...(group === 'purpose' ? {other: '1' as const} : {}),
        };

        getTokenGroups(groupParams, controller.signal)
            .then(data => {
                if (controller.signal.aborted) return;
                setGroups(data);
                setGroupError('');
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                setGroupError('分组用量加载失败，请重试');
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setGroupsLoading(false);
                }
            });

        return () => controller.abort();
    }, [filterKey, group, page, refresh]);

    const error = summaryError || groupError;
    const loading = summaryLoading || groupsLoading;

    return {
        summary,
        groups,
        loading,
        summaryLoading,
        groupsLoading,
        error,
        agents: summary?.agents || [],
        tasks: summary?.tasks || []
    };
}

export function useTokenRequests(filters: TokenFilters) {
    const filterKey = JSON.stringify(filters);
    const [position, setPosition] = useState({filterKey, cursor: undefined as string | undefined});
    const cursor = position.filterKey === filterKey ? position.cursor : undefined;
    const [refresh, setRefresh] = useState(0);
    const key = JSON.stringify([filterKey, cursor, refresh]);
    const [state, setState] = useState<{key: string; filterKey: string; result: TokenRequests | null; error: string}>({key: '', filterKey: '', result: null, error: ''});
    useEffect(() => {
        const controller = new AbortController();
        void getTokenRequests({...JSON.parse(filterKey), cursor}, controller.signal).then(value => {
            if (controller.signal.aborted) return;
            setState(old => {
                const previous = cursor && old.filterKey === filterKey ? old.result?.items || [] : [];
                const items = [...new Map([...previous, ...value.items].map(row => [row.id, row])).values()];
                return {key, filterKey, result: {...value, items}, error: ''};
            });
        }).catch(() => {
            if (!controller.signal.aborted) setState(old => ({...old, key, error: '请求明细加载失败'}));
        });
        return () => controller.abort();
    }, [filterKey, key, cursor]);
    const result = state.filterKey === filterKey ? state.result : null;
    return {result, loading: state.key !== key, error: state.key === key ? state.error : '',
        reload: () => {
            setPosition({filterKey, cursor: undefined});
            setRefresh(v => v + 1);
        },
        retry: () => setRefresh(v => v + 1),
        more: () => setPosition({filterKey, cursor: result?.nextCursor || undefined})};
}

export function useTokenExecutions(filters: TokenFilters) {
    const filterKey = JSON.stringify(filters);
    const [position, setPosition] = useState({filterKey, page: 1});
    const page = position.filterKey === filterKey ? position.page : 1;
    const [refresh, setRefresh] = useState(0);
    const key = JSON.stringify([filterKey, page, refresh]);
    const [state, setState] = useState<{key: string; result: TokenGroups | null; error: string}>({key: '', result: null, error: ''});
    useEffect(() => {
        const controller = new AbortController();
        void getTokenGroups({...JSON.parse(filterKey), group: 'record', page}, controller.signal).then(result => {
            if (!controller.signal.aborted) setState({key, result, error: ''});
        }).catch(() => {if (!controller.signal.aborted) setState({key, result: null, error: '执行记录加载失败'});});
        return () => controller.abort();
    }, [filterKey, key, page]);
    return {result: state.key === key ? state.result : null, loading: state.key !== key, error: state.key === key ? state.error : '', page,
        setPage: (value: number | ((current: number) => number)) => setPosition({filterKey, page: typeof value === 'function' ? value(page) : value}),
        reload: () => setRefresh(v => v + 1)};
}
