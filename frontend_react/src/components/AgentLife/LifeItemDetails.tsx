import {useEffect, useState} from 'react';
import {
    Clock,
    Target,
    History,
    AlertCircle,
    Compass,
    Sprout,
    TrendingUp,
    Coffee,
    ShoppingBag,
    MessageSquare,
    Calendar,
    Sparkles,
    Wallet,
    CreditCard,
    CheckCircle2,
    ArrowRight,
    RotateCw,
    Ban,
    FileEdit,
} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {getLifeItem, changeLifeItem} from '../../api/agentLife';
import type {LifeItem} from '../../types/api/agentLife';
import {activityLabels, statusLabels, showsLifeBudget} from './lifeLabels';

function ActivityIcon({activity, className}: {activity?: string; className?: string}) {
    switch (activity) {
        case 'travel':
            return <Compass className={className} />;
        case 'farm':
            return <Sprout className={className} />;
        case 'investment':
            return <TrendingUp className={className} />;
        case 'rest':
            return <Coffee className={className} />;
        case 'market':
        case 'market_prepare':
            return <ShoppingBag className={className} />;
        case 'post_interaction':
        case 'post_publish':
            return <MessageSquare className={className} />;
        default:
            return <Calendar className={className} />;
    }
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'running':
            return {
                label: '执行中',
                className: 'bg-orange-50 text-orange-700 border-orange-200/80',
                dotClass: 'bg-orange-500 animate-pulse',
            };
        case 'completed':
            return {
                label: '已完成',
                className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
                dotClass: 'bg-emerald-500',
            };
        case 'pending':
            return {
                label: '待执行',
                className: 'bg-amber-50 text-amber-700 border-amber-200/80',
                dotClass: 'bg-amber-500',
            };
        case 'deferred':
            return {
                label: '已顺延',
                className: 'bg-blue-50 text-blue-700 border-blue-200/80',
                dotClass: 'bg-blue-500',
            };
        case 'paused':
            return {
                label: '已暂停',
                className: 'bg-slate-100 text-slate-600 border-slate-200',
                dotClass: 'bg-slate-400',
            };
        case 'cancelled':
            return {
                label: '已取消',
                className: 'bg-rose-50 text-rose-700 border-rose-200/80',
                dotClass: 'bg-rose-500',
            };
        case 'failed':
            return {
                label: '失败',
                className: 'bg-red-50 text-red-700 border-red-200/80',
                dotClass: 'bg-red-500',
            };
        default:
            return {
                label: statusLabels[status] || status,
                className: 'bg-slate-100 text-slate-700 border-slate-200',
                dotClass: 'bg-slate-400',
            };
    }
};

export default function LifeItemDetails({
    id,
    onClose,
    onChanged,
}: {
    id: string;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [item, setItem] = useState<LifeItem | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);

    useEffect(() => {
        const c = new AbortController();
        getLifeItem(id, c.signal)
            .then((v) => {
                if (!c.signal.aborted) setItem(v);
            })
            .catch((e) => {
                if (!c.signal.aborted) setError(e.message || '详情加载失败');
            })
            .finally(() => {
                if (!c.signal.aborted) setBusy(false);
            });
        return () => c.abort();
    }, [id]);

    const change = async (action: 'cancel' | 'replan') => {
        setBusy(true);
        try {
            setItem(await changeLifeItem(id, action, reason));
            setError('');
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : '调整失败');
        } finally {
            setBusy(false);
        }
    };

    const statusBadge = item ? getStatusBadge(item.status) : null;

    return (
        <WorldDialog
            title="生活安排详情"
            description="查看活动详情、执行预算与历史调整记录"
            onClose={onClose}
            size="compact"
        >
            <div className="space-y-3.5 pb-1">
                {busy && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                        <span>正在同步最新详情…</span>
                    </div>
                )}
                {error && (
                    <div
                        role="alert"
                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                    >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {item && statusBadge && (
                    <>
                        {/* 顶部活动总览卡片 */}
                        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition-all hover:border-slate-300">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100/80 shadow-2xs">
                                        <ActivityIcon activity={item.activity} className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-bold text-slate-900 tracking-tight">
                                            {activityLabels[item.activity] || item.activity}
                                        </h4>
                                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="font-mono">
                                                {new Date(item.scheduledAt).toLocaleString('zh-CN', {
                                                    timeZone: 'Asia/Shanghai',
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <span
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                                >
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`}
                                    />
                                    {statusBadge.label}
                                </span>
                            </div>

                            {item.intent ? (
                                <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-700">
                                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                                        <Sparkles className="h-3 w-3 text-orange-500" />
                                        <span>活动规划意图</span>
                                    </div>
                                    <p className="font-medium text-slate-700">{item.intent}</p>
                                </div>
                            ) : (
                                <p className="mt-2 text-xs italic text-slate-400">尚未固化活动意向</p>
                            )}
                        </div>

                        {/* 预算与支出面板 */}
                        {showsLifeBudget(item) && (
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-all">
                                    <div className="space-y-0.5">
                                        <span className="text-[11px] font-medium text-slate-400">预计总预算</span>
                                        <p className="font-mono text-base font-bold text-slate-900">
                                            ¥{item.budget}
                                        </p>
                                    </div>
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100/60">
                                        <Wallet className="h-4.5 w-4.5" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-all">
                                    <div className="space-y-0.5">
                                        <span className="text-[11px] font-medium text-slate-400">实际已支出</span>
                                        <p className="font-mono text-base font-bold text-orange-600">
                                            ¥{item.spent}
                                        </p>
                                    </div>
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100/60">
                                        <CreditCard className="h-4.5 w-4.5" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {item.result?.reason && (
                            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                                <div className="space-y-0.5">
                                    <span className="font-semibold text-slate-700">实际执行结果</span>
                                    <p className="text-slate-600 leading-relaxed">{item.result.reason}</p>
                                </div>
                            </div>
                        )}

                        {/* 关联的目标 */}
                        {Array.isArray(item.context?.goals) && item.context.goals.length > 0 && (
                            <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <Target className="h-3.5 w-3.5 text-orange-500" />
                                    <span>规划时的有效目标</span>
                                </div>
                                <div className="mt-2.5 space-y-1.5">
                                    {item.context.goals.map((value: unknown, index: number) => {
                                        const goal =
                                            value && typeof value === 'object'
                                                ? (value as Record<string, unknown>)
                                                : {};
                                        return (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                                            >
                                                <span className="font-medium text-slate-800">
                                                    {String(goal.title || '生活目标')}
                                                </span>
                                                {goal.progress ? (
                                                    <span className="rounded bg-white px-2 py-0.5 text-[11px] font-mono text-orange-600 border border-slate-200/60">
                                                        {String(goal.progress)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* 调整记录 */}
                        <section className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <History className="h-3.5 w-3.5 text-slate-500" />
                                    <span>调整记录</span>
                                </div>
                                {item.revisions && item.revisions.length > 0 ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                        {item.revisions.length} 次
                                    </span>
                                ) : null}
                            </div>
                            {!item.revisions?.length ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3 text-center text-xs text-slate-400">
                                    暂无调整记录
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {item.revisions.map((r) => (
                                        <div
                                            key={r.id}
                                            className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs shadow-2xs"
                                        >
                                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                                                <span className="font-mono">
                                                    {new Date(r.createdAt).toLocaleString('zh-CN', {
                                                        timeZone: 'Asia/Shanghai',
                                                    })}
                                                </span>
                                                {showsLifeBudget(item) && Number(r.before.budget) !== Number(r.after.budget) && (
                                                    <span className="flex items-center gap-1 font-mono text-slate-600">
                                                        预算：{String(r.before.budget ?? '—')}
                                                        <ArrowRight className="h-3 w-3 text-slate-400" />
                                                        <strong className="text-orange-600">
                                                            {String(r.after.budget ?? '—')}
                                                        </strong>
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1.5 text-slate-700 leading-relaxed">{r.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* 调整表单操作 */}
                        {['pending', 'deferred', 'paused', 'running'].includes(item.status) && (
                            <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                                        <FileEdit className="h-3.5 w-3.5 text-orange-500" />
                                        <span>调整原因说明</span>
                                    </div>
                                    <span className="text-[11px] text-slate-400">
                                        {reason.length > 0 ? `${reason.length} 字` : '必填'}
                                    </span>
                                </div>
                                <textarea
                                    rows={3}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="请输入重新规划或取消的原因…"
                                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all leading-relaxed"
                                />
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                    <span className="text-[11px] text-slate-400">
                                        {!reason.trim()
                                            ? '请先填写调整原因，再执行相应操作'
                                            : '调整操作将记录进历史流水'}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={busy || !reason.trim() || item.status === 'running'}
                                            onClick={() => void change('replan')}
                                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-xs shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <RotateCw
                                                className={`h-3.5 w-3.5 shrink-0 ${busy ? 'animate-spin' : ''}`}
                                            />
                                            <span>重新规划</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || !reason.trim()}
                                            onClick={() => void change('cancel')}
                                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/40 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-300 active:bg-red-100 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Ban className="h-3.5 w-3.5 shrink-0" />
                                            <span>取消安排</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </WorldDialog>
    );
}
