import {useCallback, useEffect, useRef, useState} from 'react';
import {searchImages} from '../api/image';
import type {GlobalSearchItem, GlobalSearchType} from '../types/api/search';

interface SmartImageSearchResult {
    query: string;
    items: GlobalSearchItem[];
    error: string;
}

interface Options {
    isOpen: boolean;
    enabled: boolean;
    keyword: string;
    filter: 'all' | GlobalSearchType;
    onResults: (hasResults: boolean) => void;
}

const isImageScope = (filter: Options['filter']) => filter === 'all' || filter === 'image';

export function useGlobalSmartImageSearch({isOpen, enabled, keyword, filter, onResults}: Options) {
    const [result, setResult] = useState<SmartImageSearchResult | null>(null);
    const resultRef = useRef<SmartImageSearchResult | null>(null);
    const generation = useRef(0);
    const timer = useRef<number | null>(null);
    const controller = useRef<AbortController | null>(null);
    const runningQuery = useRef('');
    const query = keyword.trim();
    const active = isOpen && enabled && isImageScope(filter) && Boolean(query);

    const searchNow = useCallback(async (term: string) => {
        if (!term || resultRef.current?.query === term || runningQuery.current === term) return;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        controller.current?.abort();
        const requestId = ++generation.current;
        const requestController = new AbortController();
        controller.current = requestController;
        runningQuery.current = term;
        try {
            const response = await searchImages(term, undefined, 1, requestController.signal);
            if (generation.current !== requestId) return;
            const next: SmartImageSearchResult = {
                query: term,
                items: response.items.slice(0, 8).map(item => ({
                    id: `image:${item.image.imageId}`,
                    type: 'image',
                    title: item.image.title,
                    subtitle: `${item.matchReason} · 图片文集`,
                    excerpt: item.image.description || '',
                    route: {view: 'image', params: {coll_id: item.image.collId, image_id: item.image.imageId}},
                    meta: {image_url: item.image.imageUrl},
                })),
                error: response.semanticAvailable ? '' : '语义模型不可用，已显示关键词结果',
            };
            resultRef.current = next;
            setResult(next);
            onResults(next.items.length > 0);
        } catch (error) {
            if (generation.current !== requestId) return;
            const next = {
                query: term,
                items: [],
                error: error instanceof Error ? error.message : '智能搜图失败',
            };
            resultRef.current = next;
            setResult(next);
        } finally {
            if (generation.current === requestId) runningQuery.current = '';
        }
    }, [onResults]);

    useEffect(() => {
        if (!active || resultRef.current?.query === query) return;
        timer.current = window.setTimeout(() => void searchNow(query), 700);
        return () => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            controller.current?.abort();
            runningQuery.current = '';
            generation.current += 1;
        };
    }, [active, query, searchNow]);

    const submitNow = useCallback(() => { if (active) void searchNow(query); }, [active, query, searchNow]);
    const reset = useCallback(() => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        controller.current?.abort();
        runningQuery.current = '';
        generation.current += 1;
        resultRef.current = null;
        setResult(null);
    }, []);
    const current = active && result?.query === query ? result : null;
    return {
        items: current?.items ?? null,
        error: current?.error ?? '',
        pending: active && !current,
        searchNow: submitNow,
        reset,
    };
}
