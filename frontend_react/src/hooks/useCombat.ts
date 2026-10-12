import {useCallback, useEffect, useRef, useState} from 'react';
import {getCombatCatalog, getCombatProfile, getCombatHistory} from '../api/combat';
import type {CombatCatalog, CombatProfile, CombatHistory} from '../types/api/combat';

// 模块级单例缓存，跨居民切换时即时复用
let catalogPromise: Promise<CombatCatalog> | null = null;
let cachedCatalog: CombatCatalog | null = null;

const profileCache = new Map<string, {profile: CombatProfile | null; history: CombatHistory | null}>();

export function useCombat(actorId: string) {
    const [data, setData] = useState<{
        actor: string;
        catalog: CombatCatalog;
        profile: CombatProfile | null;
        history: CombatHistory | null;
    } | null>(() => {
        if (actorId && cachedCatalog && profileCache.has(actorId)) {
            const cached = profileCache.get(actorId)!;
            return {actor: actorId, catalog: cachedCatalog, profile: cached.profile, history: cached.history};
        }
        return null;
    });

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [version, setVersion] = useState(0);
    const [page, setPage] = useState(1);

    const reload = useCallback(() => {
        if (actorId) {
            profileCache.delete(actorId);
        }
        setVersion(v => v + 1);
    }, [actorId]);

    // 追踪当前请求的 actorId，避免异步竟态乱序
    const currentActorRef = useRef(actorId);
    currentActorRef.current = actorId;

    useEffect(() => {
        if (!actorId) return;

        // 若内存中已有该居民数据，立刻同步切入展示，实现 0 毫秒零闪烁切换
        if (cachedCatalog && profileCache.has(actorId)) {
            const cached = profileCache.get(actorId)!;
            setData({actor: actorId, catalog: cachedCatalog, profile: cached.profile, history: cached.history});
        }

        const controller = new AbortController();
        setError('');
        setLoading(true);

        const catalogTask = cachedCatalog
            ? Promise.resolve(cachedCatalog)
            : (catalogPromise ||= getCombatCatalog().then(cat => {
                  cachedCatalog = cat;
                  return cat;
              }).catch(error => {
                  catalogPromise = null;
                  throw error;
              }));

        Promise.all([
            catalogTask,
            getCombatProfile(actorId, controller.signal),
            getCombatHistory(actorId, page, controller.signal),
        ])
            .then(([catalog, profile, history]) => {
                if (controller.signal.aborted || currentActorRef.current !== actorId) return;
                cachedCatalog = catalog;
                profileCache.set(actorId, {profile, history});
                setData({actor: actorId, catalog, profile, history});
                setLoading(false);
            })
            .catch(e => {
                if (controller.signal.aborted || currentActorRef.current !== actorId) return;
                setError(e instanceof Error ? e.message : '冒险资料读取失败');
                setLoading(false);
            });

        return () => controller.abort();
    }, [actorId, page, version]);

    const refreshCombatState = Boolean(data?.actor === actorId && (data.profile?.activeExplorationId || data.profile?.promotionBusy));
    useEffect(() => {
        if (!actorId || !refreshCombatState) return;
        let active = true, pending = false;
        const controller = new AbortController();
        const refresh = async () => {
            if (pending || document.hidden) return;
            pending = true;
            try {
                const profile = await getCombatProfile(actorId, controller.signal);
                if (!active || currentActorRef.current !== actorId) return;
                setData(previous => {
                    if (!previous || previous.actor !== actorId) return previous;
                    profileCache.set(actorId, {profile, history: previous.history});
                    return {...previous, profile};
                });
                setError('');
            } catch (e) {
                if (active && !controller.signal.aborted && currentActorRef.current === actorId)
                    setError(e instanceof Error ? e.message : '冒险状态刷新失败');
            } finally {pending = false;}
        };
        const timer = window.setInterval(() => {void refresh();}, 5000);
        const visibility = () => {if (!document.hidden) void refresh();};
        document.addEventListener('visibilitychange', visibility);
        return () => {active = false;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange', visibility);};
    }, [actorId, refreshCombatState]);

    return {
        data: data?.actor === actorId ? data : null,
        loading,
        error,
        reload,
        page,
        setPage,
    };
}
