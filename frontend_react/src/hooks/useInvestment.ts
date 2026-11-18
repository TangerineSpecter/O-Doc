import {useEffect, useState, type RefObject} from 'react';
import {getInvestmentDecisions, getInvestmentOverview, getInvestmentPositions, getInvestmentResidents, getInvestmentTrades} from '../api/investment';
import type {InvestmentDecision, InvestmentOverview, InvestmentPage, InvestmentPosition, InvestmentResident, InvestmentTab, InvestmentTrade} from '../types/api/investment';

const POLL_INTERVAL_MS = 15_000;
const SNAPSHOT_MAX_AGE_MS = 60_000;

export interface InvestmentSnapshot {
    residents: InvestmentResident[];
    overview: InvestmentOverview;
    loadedAt: number;
}

interface InvestmentSelection {
    actorId: string;
    tab: InvestmentTab;
    page: number;
}

export function useInvestment(cache: RefObject<InvestmentSnapshot | null>, initialActorId?: string) {
    const [snapshot] = useState(() => {
        const previous = cache.current;
        return previous && Date.now() - previous.loadedAt < SNAPSHOT_MAX_AGE_MS ? previous : null;
    });
    const [selection, setSelection] = useState<InvestmentSelection>(() => ({
        actorId: initialActorId || snapshot?.overview.actorId || '',
        tab: 'positions',
        page: 1,
    }));
    const [residents, setResidents] = useState<InvestmentResident[]>(snapshot?.residents ?? []);
    const [actorId, setResolvedActorId] = useState(selection.actorId);
    const [summary, setOverview] = useState<InvestmentOverview | null>(snapshot?.overview ?? null);
    const [positions, setPositions] = useState<InvestmentPage<InvestmentPosition> | null>(null);
    const [trades, setTrades] = useState<InvestmentPage<InvestmentTrade> | null>(null);
    const [decisions, setDecisions] = useState<InvestmentPage<InvestmentDecision> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const {tab} = selection;
    const page = actorId === selection.actorId ? selection.page : 1;
    const overview = summary?.actorId === actorId ? summary : null;

    const refresh = () => {
        setLoading(true);
        setError('');
        setSelection({actorId, tab, page});
    };
    const changeSelection = (next: InvestmentSelection) => {
        setPositions(null);
        setTrades(null);
        setDecisions(null);
        setLoading(true);
        setError('');
        setResolvedActorId(next.actorId);
        setSelection(next);
    };
    const setActorId = (value: string) => {
        if (value !== actorId) changeSelection({actorId: value, tab, page: 1});
    };
    const setTab = (value: InvestmentTab) => {
        if (value !== tab) changeSelection({actorId, tab: value, page: 1});
    };
    const setPage = (value: number) => {
        if (value !== page) changeSelection({actorId, tab, page: value});
    };

    useEffect(() => {
        let controller: AbortController | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let preferredActorId = selection.actorId;
        const poll = async () => {
            if (document.hidden) return;
            controller?.abort();
            const abort = new AbortController();
            controller = abort;
            try {
                const accounts = await getInvestmentResidents(abort.signal);
                if (abort.signal.aborted) return;
                setResidents(accounts);
                const selected = accounts.find(resident => resident.id === preferredActorId)
                    ?? accounts.find(resident => resident.id === initialActorId)
                    ?? accounts[0];
                const selectedId = selected?.id ?? '';
                if (selectedId !== preferredActorId) {
                    setPositions(null);
                    setTrades(null);
                    setDecisions(null);
                }
                preferredActorId = selectedId;
                setResolvedActorId(selectedId);
                const cachedActorId = cache.current?.overview.actorId;
                if (cachedActorId && !accounts.some(resident => resident.id === cachedActorId)) {
                    cache.current = null;
                }
                if (!selected) {
                    setOverview(null);
                    setError('');
                    return;
                }

                const nextOverview = await getInvestmentOverview(selectedId, abort.signal);
                if (abort.signal.aborted) return;
                setOverview(nextOverview);
                cache.current = {residents: accounts, overview: nextOverview, loadedAt: Date.now()};

                const requestPage = selectedId === selection.actorId ? selection.page : 1;
                if (selection.tab === 'positions' && requestPage > 1) {
                    const data = await getInvestmentPositions(selectedId, requestPage, abort.signal);
                    if (!abort.signal.aborted) setPositions(data);
                } else if (selection.tab === 'trades') {
                    const data = await getInvestmentTrades(selectedId, requestPage, abort.signal);
                    if (!abort.signal.aborted) setTrades(data);
                } else if (selection.tab === 'decisions') {
                    const data = await getInvestmentDecisions(selectedId, requestPage, abort.signal);
                    if (!abort.signal.aborted) setDecisions(data);
                }
                if (abort.signal.aborted) return;
                setError('');
            } catch (e) {
                if (!abort.signal.aborted) {
                    const timedOut = e instanceof Error && 'code' in e && e.code === 'ECONNABORTED';
                    setError(timedOut ? '投资账户请求超时，请刷新重试' : e instanceof Error ? e.message : '投资账户加载失败');
                }
            } finally {
                if (!abort.signal.aborted) {
                    setLoading(false);
                    timer = setTimeout(poll, POLL_INTERVAL_MS);
                }
            }
        };
        const visibility = () => {
            clearTimeout(timer);
            if (document.hidden) controller?.abort();
            else void poll();
        };
        document.addEventListener('visibilitychange', visibility);
        void poll();
        return () => {
            controller?.abort();
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [cache, initialActorId, selection]);

    return {residents, actorId, setActorId, tab, setTab, page, setPage, overview,
        positions: page === 1 ? overview?.positions ?? null : positions,
        trades, decisions, loading, error, refresh};
}
