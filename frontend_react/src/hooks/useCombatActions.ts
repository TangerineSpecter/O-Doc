import {useEffect, useRef, useState} from 'react';
import {combatCommand, combatKey} from '../api/combat';
export function useCombatActions(actor: string, reload: () => void) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const currentActor = useRef(actor);
    currentActor.current = actor;
    const session = useRef('');
    const pending = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const receipt = useRef<{signature: string; key: string} | null>(null);
    useEffect(() => {
        session.current = combatKey(); setError(''); setMessage('');
        return () => controller.current?.abort();
    }, [actor]);
    const act = async <T,>(data: Record<string, unknown>): Promise<T | undefined> => {
        const target = actor;
        if (pending.current) return;
        pending.current = true;
        controller.current = new AbortController();
        const signal = controller.current.signal;
        const signature = JSON.stringify([target, data]);
        if (receipt.current?.signature !== signature) receipt.current = {signature, key:combatKey()};
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await combatCommand<T>(target, data, receipt.current.key, signal);
            receipt.current = null;
            if (signal.aborted || currentActor.current !== target) return;
            reload(); setMessage('操作已提交');
            return result;
        } catch (e) {if (!signal.aborted && currentActor.current === target) setError(e instanceof Error ? e.message : '操作失败');}
        finally {pending.current = false; setBusy(false);}
    };
    return {busy, error, message, act, trade: (trade: Record<string, unknown>) => act({operation:'trade', sessionKey:session.current, trade}),
        finishMarket: async () => {await act({operation:'close_market', sessionKey:session.current}); session.current = combatKey();}};
}
