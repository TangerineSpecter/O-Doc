import {useEffect, useState} from 'react';
import type {SetStateAction} from 'react';
import {getTournament, getTournamentHistory, getTournamentMatch, getTournamentOverview} from '../api/tournament';
import type {TournamentOverview, TournamentHistory, TournamentMatchDetail} from '../types/api/tournament';

const message = (error: unknown) => error instanceof Error ? error.message : '大会数据暂时不可用';

export function useTournament() {
    const [tab, setTab] = useState<'current' | 'history'>('current');
    const [eventId, setEventId] = useState('');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [data, setData] = useState<TournamentOverview | null>(null);
    const [history, setHistory] = useState<TournamentHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [historyError, setHistoryError] = useState('');
    const [matchId, setMatchId] = useState('');
    const [match, setMatch] = useState<TournamentMatchDetail | null>(null);
    const [matchError, setMatchError] = useState('');

    useEffect(() => {
        let disposed = false;
        let controller: AbortController | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let failures = 0;
        const load = async () => {
            clearTimeout(timer);
            controller?.abort();
            if (document.hidden || disposed) return;
            controller = new AbortController();
            const signal = controller.signal;
            try {
                const [overview, selected] = await Promise.all([
                    getTournamentOverview(signal), eventId ? getTournament(eventId, signal) : Promise.resolve(null),
                ]);
                if (!disposed && !signal.aborted) {
                    setData(selected ? {...overview, event: selected} : overview);
                    setError(''); failures = 0;
                }
            } catch (caught) {
                if (!disposed && !signal.aborted) {setError(message(caught)); failures += 1;}
            } finally {
                if (!disposed && !signal.aborted) {
                    setLoading(false);
                    timer = setTimeout(() => void load(), Math.min(60000, 15000 * 2 ** failures));
                }
            }
        };
        const visibility = () => {
            if (document.hidden) {controller?.abort(); clearTimeout(timer);}
            else void load();
        };
        void load();
        document.addEventListener('visibilitychange', visibility);
        return () => {disposed = true; controller?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility);};
    }, [eventId, revision]);

    useEffect(() => {
        if (tab !== 'history') return;
        const controller = new AbortController();
        void getTournamentHistory(page, controller.signal).then(value => {
            if (!controller.signal.aborted) {setHistory(value); setHistoryError('');}
        }).catch(caught => {if (!controller.signal.aborted) setHistoryError(message(caught));});
        return () => controller.abort();
    }, [tab, page, revision]);

    const currentId = data?.event?.id;
    const selectedMatchId = data?.event?.rounds.some(row => row.matches.some(m => m.id === matchId)) ? matchId : '';
    useEffect(() => {
        if (!selectedMatchId || !currentId) return;
        const controller = new AbortController();
        void getTournamentMatch(currentId, selectedMatchId, controller.signal).then(value => {
            if (!controller.signal.aborted) {setMatch(value); setMatchError('');}
        }).catch(caught => {if (!controller.signal.aborted) setMatchError(message(caught));});
        return () => controller.abort();
    }, [selectedMatchId, currentId, revision]);

    const chooseEvent = (identity: string) => {
        setEventId(identity); setTab('current'); setMatchId(''); setData(null); setLoading(true); setError('');
    };
    const chooseTab = (value: 'current' | 'history') => {setTab(value); setHistory(null); setHistoryError('');};
    const choosePage = (value: SetStateAction<number>) => {setPage(value); setHistory(null); setHistoryError('');};
    const chooseMatch = (value: string) => {setMatchId(value); setMatch(null); setMatchError('');};
    const reload = () => {setRevision(v => v + 1); setHistoryError(''); setMatchError('');};
    return {tab, setTab: chooseTab, data, history, page, setPage: choosePage, loading, error, historyError,
        chooseEvent, eventId, matchId: selectedMatchId, setMatchId: chooseMatch,
        match: match?.id === selectedMatchId ? match : null, matchError, reload};
}
