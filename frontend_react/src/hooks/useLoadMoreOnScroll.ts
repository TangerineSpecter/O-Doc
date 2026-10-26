import {useEffect, useRef} from 'react';
import type {RefObject} from 'react';

interface LoadMoreOnScrollOptions {
    /** 是否还有下一页；为 false 时不再观察。 */
    hasMore: boolean;
    /** 首屏或翻页请求进行中，避免重复触发。 */
    loading?: boolean;
    /** 出现错误时暂停自动加载，改为用户手动重试。 */
    disabled?: boolean;
    /** 内部滚动容器；不传时以浏览器视口为观测根。 */
    rootRef?: RefObject<HTMLElement | null>;
    /** 提前触发的距离，默认提前 200px。 */
    rootMargin?: string;
    onLoadMore: () => void;
}

/**
 * 底部哨兵自动加载：哨兵进入视口（或被 rootMargin 提前命中）时加载下一页。
 * 观察器重建时读取最新的回调，避免因回调闭包变化反复重建。
 */
export default function useLoadMoreOnScroll<T extends HTMLElement = HTMLDivElement>({
    hasMore, loading = false, disabled = false, rootRef, rootMargin = '200px', onLoadMore,
}: LoadMoreOnScrollOptions) {
    const sentinelRef = useRef<T>(null);
    const handler = useRef(onLoadMore);
    useEffect(() => {handler.current = onLoadMore;}, [onLoadMore]);
    const active = hasMore && !loading && !disabled;
    useEffect(() => {
        const node = sentinelRef.current;
        if (!active || !node || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) handler.current();
        }, {root: rootRef?.current ?? null, rootMargin});
        observer.observe(node);
        return () => observer.disconnect();
    }, [active, rootMargin, rootRef]);
    return sentinelRef;
}
