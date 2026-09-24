import {useCallback, useEffect, useRef, useState} from 'react';
import {
  getImageIndexStatus, searchImages, searchImagesByReference,
  type ImageIndexSummary, type ImageSearchItem,
} from '../api/image';

type SearchMode = 'none' | 'text' | 'reference';

export function useImageSmartSearch(collId?: string) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('none');
  const [items, setItems] = useState<ImageSearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [semanticAvailable, setSemanticAvailable] = useState(true);
  const [summary, setSummary] = useState<ImageIndexSummary | null>(null);
  const sequence = useRef(0);

  const refreshStatus = useCallback(async () => {
    if (!collId) return;
    try { setSummary(await getImageIndexStatus(collId)); }
    catch { setSummary(null); }
  }, [collId]);

  useEffect(() => {
    if (!collId) return;
    let live = true;
    void getImageIndexStatus(collId).then(value => { if (live) setSummary(value); })
      .catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
  }, [collId]);

  const activeJob = summary?.job;
  useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => void refreshStatus(), 3000);
    return () => window.clearInterval(timer);
  }, [activeJob, refreshStatus]);

  const clear = useCallback(() => {
    sequence.current += 1;
    setMode('none'); setItems([]); setPage(1); setHasMore(false); setBusy(false); setError('');
  }, []);

  useEffect(() => {
    let live = true;
    queueMicrotask(() => { if (live) clear(); });
    return () => { live = false; };
  }, [collId, clear]);

  const submitText = useCallback(async (nextPage = 1) => {
    const normalized = query.trim();
    if (!normalized || !collId) return;
    const current = ++sequence.current;
    setBusy(true); setError('');
    try {
      const response = await searchImages(normalized, collId, nextPage);
      if (sequence.current !== current) return;
      setItems(previous => nextPage === 1 ? response.items : [...previous, ...response.items]);
      setMode('text'); setPage(nextPage); setHasMore(Boolean(response.hasMore));
      setSemanticAvailable(Boolean(response.semanticAvailable));
    } catch (cause) {
      if (sequence.current === current) setError(cause instanceof Error ? cause.message : '搜图失败');
    } finally {
      if (sequence.current === current) setBusy(false);
    }
  }, [collId, query]);

  const submitReference = useCallback(async (file: File) => {
    if (!collId) return;
    const current = ++sequence.current;
    setBusy(true); setError('');
    try {
      const response = await searchImagesByReference(file, collId);
      if (sequence.current !== current) return;
      setItems(response.items); setMode('reference'); setPage(1); setHasMore(false);
    } catch (cause) {
      if (sequence.current === current) setError(cause instanceof Error ? cause.message : '参考图搜图失败');
    } finally {
      if (sequence.current === current) setBusy(false);
    }
  }, [collId]);

  return {
    query, setQuery, mode, items, page, hasMore, busy, error, semanticAvailable, summary,
    clear, submitText, submitReference, refreshStatus,
  };
}
