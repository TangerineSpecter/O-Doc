import {useEffect, useState} from 'react';
import type {CombatResourceRecovery} from '../../types/api/combat';

/** The clock only updates copy; resource values always come from the server. */
export default function CombatRecoveryHint({timing, serverNow, resting = false}: {
    timing: CombatResourceRecovery;
    serverNow: string;
    resting?: boolean;
}) {
    const [clock, setClock] = useState({serverNow, elapsed: 0});
    useEffect(() => {
        if (!timing.nextAt) return;
        const started = performance.now();
        const tick = () => {
            if (!document.hidden) setClock({serverNow, elapsed: performance.now() - started});
        };
        const timer = window.setInterval(tick, 1000);
        document.addEventListener('visibilitychange', tick);
        return () => {window.clearInterval(timer); document.removeEventListener('visibilitychange', tick);};
    }, [serverNow, timing.nextAt]);

    if (!timing.nextAt || !timing.fullAt) {
        return <p className="text-[9px] text-slate-400">已回满</p>;
    }
    const elapsed = clock.serverNow === serverNow ? clock.elapsed : 0;
    const seconds = Math.max(0, Math.ceil((Date.parse(timing.nextAt) - Date.parse(serverNow) - elapsed) / 1000));
    const remaining = `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
    const fullAt = new Date(timing.fullAt).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false});
    return <div className="text-[9px] leading-relaxed text-slate-500">
        <p>{seconds === 0 ? '等待同步恢复数值…' : resting ? `休整剩余 ${remaining}` : `${remaining} 后 +${timing.amount}`}</p>
        {resting && <p>休整结束恢复至 100%</p>}
        <p title="按当前上限和闲置恢复规则估算，再次探索会改变时间">预计 {fullAt} 回满</p>
    </div>;
}
