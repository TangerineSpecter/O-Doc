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

    return {
        data: data?.actor === actorId ? data : null,
        loading,
        error,
        reload,
        page,
        setPage,
    };
}
