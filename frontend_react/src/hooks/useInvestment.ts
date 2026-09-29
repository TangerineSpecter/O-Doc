import {useCallback, useEffect, useState} from 'react';
import {getInvestmentDecisions, getInvestmentOverview, getInvestmentPositions, getInvestmentResidents, getInvestmentTrades} from '../api/investment';
import type {InvestmentDecision, InvestmentOverview, InvestmentPage, InvestmentPosition, InvestmentResident, InvestmentTab, InvestmentTrade} from '../types/api/investment';

export function useInvestment() {
    const [residents, setResidents] = useState<InvestmentResident[]>([]);
    const [actorId, setActorIdState] = useState('');
    const [tab, setTabState] = useState<InvestmentTab>('positions');
    const [page, setPageState] = useState(1);
    const [overview, setOverview] = useState<InvestmentOverview | null>(null);
    const [positions, setPositions] = useState<InvestmentPage<InvestmentPosition> | null>(null);
    const [trades, setTrades] = useState<InvestmentPage<InvestmentTrade> | null>(null);
    const [decisions, setDecisions] = useState<InvestmentPage<InvestmentDecision> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const refresh = useCallback(() => setRetry(v => v + 1), []);
    const clear = () => {setPositions(null); setTrades(null); setDecisions(null); setLoading(true); setError('');};
    const setActorId = (value: string) => {if (value === actorId) return; clear(); setOverview(null); setPageState(1); setActorIdState(value);};
    const setTab = (value: InvestmentTab) => {if (value === tab) return; clear(); setPageState(1); setTabState(value);};
    const setPage = (value: number) => {if (value === page) return; clear(); setPageState(value);};
    useEffect(() => {
        let alive = true;
        let controller: AbortController | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            if (!alive || document.hidden) return;
            controller?.abort(); const abort = new AbortController(); controller = abort;
            try {
                const accounts = await getInvestmentResidents(abort.signal);
                if (!alive || abort.signal.aborted) return;
                setResidents(accounts);
                const selected = accounts.some(r => r.id === actorId) ? actorId : accounts[0]?.id || '';
                if (selected !== actorId) {setActorIdState(selected); setPageState(1); return;}
                if (selected) {
                    const summary = await getInvestmentOverview(selected, abort.signal);
                    if (!alive || abort.signal.aborted) return;
                    setOverview(summary);
                    if (tab === 'positions') {
                        const data = page === 1 ? summary.positions : await getInvestmentPositions(selected, page, abort.signal);
                        if (alive && !abort.signal.aborted) setPositions(data);
                    } else if (tab === 'trades') {
                        const data = await getInvestmentTrades(selected, page, abort.signal);
                        if (alive && !abort.signal.aborted) setTrades(data);
                    } else {
                        const data = await getInvestmentDecisions(selected, page, abort.signal);
                        if (alive && !abort.signal.aborted) setDecisions(data);
                    }
                } else {setOverview(null); setPositions(null); setTrades(null); setDecisions(null);}
                setError('');
            } catch (e) {
                if (alive && !abort.signal.aborted) setError(e instanceof Error ? e.message : '投资账户加载失败');
            } finally {
                if (alive && !abort.signal.aborted) {setLoading(false); timer = setTimeout(poll, 15000);}
            }
        };
        const visibility = () => {clearTimeout(timer); if (document.hidden) controller?.abort(); else void poll();};
        document.addEventListener('visibilitychange', visibility); void poll();
        return () => {alive = false; controller?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility);};
    }, [actorId, tab, page, retry]);
    return {residents, actorId, setActorId, tab, setTab, page, setPage, overview, positions, trades, decisions, loading, error, refresh};
}
