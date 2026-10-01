import {useState} from 'react';
import {RotateCw} from 'lucide-react';
import {replanFailedLifeItems} from '../../api/agentLife';

export default function LifeFailedReplanBar({
    actorId,
    start,
    end,
    onDone,
}: {
    actorId: string;
    start: string;
    end: string;
    onDone: () => void;
}) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const submit = async () => {
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const result = await replanFailedLifeItems(actorId, reason, start, end);
            setMessage(result.count ? `已把 ${result.count} 条尚未执行的失败安排重新排队` : '当前范围没有可重新排队的失败安排');
            setReason('');
            onDone();
        } catch (e) {
            setError(e instanceof Error ? e.message : '重新排队失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-slate-800">补做失败安排</p>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                        把当前周里还没真正执行过的失败机会重新排队。已经过点的会按原顺序顺延到后面可执行的空档，不会留在凌晨。
                    </p>
                </div>
                <button
                    type="button"
                    disabled={busy || !reason.trim()}
                    onClick={() => void submit()}
                    className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-xs shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <RotateCw className={`h-3.5 w-3.5 shrink-0 ${busy ? 'animate-spin' : ''}`} />
                    <span>重新排队</span>
                </button>
            </div>
            <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请说明重新排队的原因，例如：规划误失败，补做今天的生活安排"
                className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
            {error && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                    {error}
                </p>
            )}
            {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
        </div>
    );
}
