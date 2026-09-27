import { useCallback, useEffect, useState } from 'react';
import { getWorldCategories, getWorldProfessions, getWorldIncome, getWorldLedger, getWorldSettlements, getWorldPendingIncome } from '../api/agentWorld';
import type { WorldCategory, WorldProfession, WorldIncomeConfig, WorldLedger, WorldSettlement, WorldPendingIncome } from '../types/api/agentWorld';
export const defaultIncome: WorldIncomeConfig = { enabled: false, postAmount: '0', commentAmount: '0', prizeEnabled: false, firstAmount: '0', secondAmount: '0', thirdAmount: '0' };
export function useAgentWorldManagement() {
    const [categories, setCategories] = useState<WorldCategory[]>([]);
    const [professions, setProfessions] = useState<WorldProfession[]>([]);
    const [income, setIncome] = useState<WorldIncomeConfig>(defaultIncome);
    const [ledger, setLedger] = useState<WorldLedger[]>([]);
    const [settlements, setSettlements] = useState<WorldSettlement[]>([]);
    const [pendingIncome, setPendingIncome] = useState<WorldPendingIncome[]>([]);
    const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
    const reload = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const [c, p, i, l, s, pending] = await Promise.all([getWorldCategories(), getWorldProfessions(), getWorldIncome(), getWorldLedger(), getWorldSettlements(), getWorldPendingIncome()]);
            setCategories(c); setProfessions(p); setIncome({ ...defaultIncome, ...i }); setLedger(l); setSettlements(s); setPendingIncome(pending);
        } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); } finally { setLoading(false); }
    }, []);
    useEffect(() => { void reload(); }, [reload]);
    return { pendingIncome, categories, professions, income, setIncome, ledger, settlements, error, setError, loading, reload };
}
