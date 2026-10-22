import {useEffect, useState} from 'react';
import {getLotteryOverview, getLotteryRounds, getLotteryTickets, saveLotteryConfig} from '../api/lottery';
import type {LotteryOverview, LotteryPage, LotteryRound, LotteryTicket} from '../types/api/lottery';

export function useLottery() {
    const [roundId, setRoundId] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const [ticketPage, setTicketPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [data, setData] = useState<{overview: LotteryOverview; history: LotteryPage<LotteryRound>; tickets: LotteryPage<LotteryTicket>} | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            await Promise.resolve();
            if (controller.signal.aborted) return;
            setLoading(true); setError('');
            try {
                const [overview, history] = await Promise.all([
                    getLotteryOverview(roundId, controller.signal), getLotteryRounds(historyPage, controller.signal),
                ]);
                const tickets = overview.round ? await getLotteryTickets(overview.round.id, ticketPage, controller.signal) : {items: [], total: 0, page: 1};
                if (!controller.signal.aborted) setData({overview, history, tickets});
            } catch (e) {
                if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '读取大乐透失败');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [roundId, historyPage, ticketPage, revision]);
    useEffect(() => {
        const timer = window.setInterval(() => setRevision(v => v + 1), 15000);
        return () => window.clearInterval(timer);
    }, []);
    const chooseRound = (id: string) => {setRoundId(id); setTicketPage(1);};
    const toggle = async (enabled: boolean) => {
        if (saving) return;
        setSaving(true); setError('');
        try {await saveLotteryConfig(enabled); setRevision(v => v + 1);}
        catch (e) {setError(e instanceof Error ? e.message : '保存失败');}
        finally {setSaving(false);}
    };
    return {data, loading, error, saving, roundId, historyPage, ticketPage, chooseRound,
        setHistoryPage, setTicketPage, toggle, reload: () => setRevision(v => v + 1)};
}
