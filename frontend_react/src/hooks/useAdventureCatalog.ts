import {useCallback, useEffect, useState} from 'react';
import {getCombatCatalog, getCombatProfile} from '../api/combat';
import type {CombatCatalog, CombatProfile} from '../types/api/combat';

// 模块级缓存：避免重复全量拉取全服共享的图鉴静态元数据与各居民的探索记录
let cachedCatalog: CombatCatalog | null = null;
const discoveriesCache = new Map<string, CombatProfile['discoveries']>();

/** The atlas reads reference data only; it never loads execution settings or history. */
export function useAdventureCatalog(actorId: string, active: boolean) {
    const [catalog, setCatalog] = useState<CombatCatalog | null>(cachedCatalog);
    const [discoveries, setDiscoveries] = useState<CombatProfile['discoveries'] | undefined>(() =>
        actorId ? discoveriesCache.get(actorId) : undefined
    );
    const [currentActorId, setCurrentActorId] = useState(actorId);
    const [catalogFailure, setCatalogFailure] = useState('');
    const [discoveriesFailure, setDiscoveriesFailure] = useState<{actorId: string; message: string} | null>(null);
    const [revision, setRevision] = useState(0);

    const reload = useCallback(() => {
        cachedCatalog = null;
        discoveriesCache.clear();
        setRevision(value => value + 1);
    }, []);

    // 1. 全服共享图鉴元数据加载（仅首次或显式刷新时请求）
    useEffect(() => {
        if (!active) return;
        if (cachedCatalog && revision === 0) {
            setCatalog(cachedCatalog);
            setCatalogFailure('');
            return;
        }

        const controller = new AbortController();
        getCombatCatalog(controller.signal)
            .then(cat => {
                if (!controller.signal.aborted) {
                    cachedCatalog = cat;
                    setCatalog(cat);
                    setCatalogFailure('');
                }
            })
            .catch(reason => {
                if (!controller.signal.aborted) {
                    setCatalogFailure(reason instanceof Error ? reason.message : '冒险图鉴读取失败');
                }
            });

        return () => controller.abort();
    }, [active, revision]);

    // 2. 居民个人探索记录加载与切换（平滑过渡，绝不中途置空引起闪烁）
    useEffect(() => {
        if (!active || !actorId) return;

        // 若内存已有缓存，立刻同步更新，实现 0ms 零延迟无缝切换
        if (discoveriesCache.has(actorId)) {
            setDiscoveries(discoveriesCache.get(actorId));
            setCurrentActorId(actorId);
        }

        const controller = new AbortController();
        getCombatProfile(actorId, controller.signal)
            .then(profile => {
                if (!controller.signal.aborted) {
                    const disc = profile?.discoveries;
                    discoveriesCache.set(actorId, disc);
                    setDiscoveries(disc);
                    setCurrentActorId(actorId);
                    setDiscoveriesFailure(null);
                }
            })
            .catch(reason => {
                if (!controller.signal.aborted) {
                    // 若已有旧数据展示，不弹破坏性错误打断用户浏览
                    if (!discoveriesCache.has(actorId)) {
                        setDiscoveriesFailure({actorId, message: reason instanceof Error ? reason.message : '居民探索记录读取失败'});
                    }
                }
            });

        return () => controller.abort();
    }, [actorId, active, revision]);

    // 保持 data 常驻，绝不在切换时置空导致下层组件树被卸载重建
    const data = catalog
        ? {
              actorId: currentActorId,
              catalog,
              discoveries,
          }
        : null;

    return {
        data,
        error: catalogFailure || (discoveriesFailure?.actorId === actorId ? discoveriesFailure.message : ''),
        reload,
    };
}
