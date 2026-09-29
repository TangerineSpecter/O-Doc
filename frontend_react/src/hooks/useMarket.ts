import {useCallback, useEffect, useState} from 'react';
import {getMarketListings, getMarketSessions, getMarketShop, getMarketTransactions} from '../api/market';
import type {MarketListing, MarketPage, MarketSession, MarketShop, MarketTab, MarketTransaction} from '../types/api/market';

export function useMarket() {
    const [tab, setTabState] = useState<MarketTab>('shop');
    const [page, setPageState] = useState(1);
    const [search, setSearchState] = useState('');
    const [actorId, setActorIdState] = useState('');
    const [shop, setShop] = useState<MarketShop | null>(null);
    const [listings, setListings] = useState<MarketPage<MarketListing> | null>(null);
    const [transactions, setTransactions] = useState<MarketPage<MarketTransaction> | null>(null);
    const [sessions, setSessions] = useState<MarketPage<MarketSession> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const refresh = useCallback(() => setRetry(v => v+1), []);
    const clearPages = () => {setListings(null); setTransactions(null); setSessions(null); setLoading(true); setError('');};
    const setPage = (value: number) => {clearPages(); setPageState(value);};
    const reset = () => {setPageState(1); clearPages();};
    const setTab = (value: MarketTab) => {reset(); setTabState(value);};
    const setSearch = (value: string) => {reset(); setSearchState(value);};
    const setActorId = (value: string) => {reset(); setActorIdState(value);};
    useEffect(() => {
        let alive = true;
        let active: AbortController | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            if (!alive || document.hidden) return;
            active?.abort(); const abort = new AbortController(); active = abort;
            let delay = 10000;
            try {
                if (tab === 'shop') {
                    const data = await getMarketShop(abort.signal);
                    if (!alive || abort.signal.aborted) return;
                    setShop(data);
                    delay = Math.min(10000, Math.max(250, Date.parse(data.expiresAt)-Date.parse(data.serverTime)+100));
                } else if (tab === 'listings') {
                    const data = await getMarketListings(page, search, actorId, abort.signal);
                    if (!alive || abort.signal.aborted) return;
                    setListings(data);
                } else if (tab === 'transactions') {
                    const data = await getMarketTransactions(page, actorId, abort.signal);
                    if (!alive || abort.signal.aborted) return;
                    setTransactions(data);
                } else {
                    const data = await getMarketSessions(page, actorId, abort.signal);
                    if (!alive || abort.signal.aborted) return;
                    setSessions(data);
                }
                setError('');
            } catch (e) {
                if (!abort.signal.aborted && alive) setError(e instanceof Error ? e.message : '市场加载失败，请重试');
            } finally {
                if (alive && !abort.signal.aborted) {setLoading(false); timer = setTimeout(poll, delay);}
            }
        };
        const visibility = () => {clearTimeout(timer); if (document.hidden) active?.abort(); else void poll();};
        document.addEventListener('visibilitychange', visibility); void poll();
        return () => {alive = false; active?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility);};
    }, [tab, page, search, actorId, retry]);
    return {tab, setTab, page, setPage, search, setSearch, actorId, setActorId, shop, listings, transactions, sessions, loading, error, refresh};
}
