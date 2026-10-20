import {useState} from 'react';
import {CheckCircle2, ChevronDown, Coins, RotateCcw, Send, TimerReset, XCircle} from 'lucide-react';
import type {Bounty, BountyStatus} from '../../../types/api/bounty';

export const bountyStatusMeta: Record<BountyStatus, {label: string; className: string; dot: string}> = {
    open: {label: '待领取', className: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500'},
    claimed: {label: '进行中', className: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500'},
    delivered: {label: '待验收', className: 'border-violet-200 bg-violet-50 text-violet-700', dot: 'bg-violet-500'},
    accepted: {label: '已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500'},
    cancelled: {label: '已取消', className: 'border-slate-200 bg-slate-50 text-slate-500', dot: 'bg-slate-400'},
};

function formatTime(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

export default function BountyCard({bounty, expanded, busy, onToggle, onReview, onCancel, onRunNow, onReinvite, onOpenArticle}: {
    bounty: Bounty;
    expanded: boolean;
    busy: boolean;
    onToggle: () => void;
    onReview: (approve: boolean, reason: string) => void;
    onCancel: () => void;
    onRunNow: () => void;
    onReinvite: () => void;
    onOpenArticle: (collId: string, articleId: string) => void;
}) {
    const meta = bountyStatusMeta[bounty.status];
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState('');

    const submitReject = () => {
        if (!reason.trim()) return;
        onReview(false, reason.trim());
        setRejecting(false);
        setReason('');
    };

    return (
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-800">{bounty.title}</h4>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{bounty.objective}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}/>
                        {meta.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
                        <Coins className="h-3.5 w-3.5"/>{bounty.reward}
                    </span>
                </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{bounty.collectionTitle || '文集已失效'}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{bounty.categoryName || '分类已失效'}</span>
                {bounty.agent && <span>领取：{bounty.agent.name}</span>}
                {bounty.status === 'claimed' && bounty.expireAt && <span>交付截止 {formatTime(bounty.expireAt)}</span>}
                {bounty.status === 'open' && bounty.inviteAt && <span>征询开始 {formatTime(bounty.inviteAt)}</span>}
                {bounty.attempt > 0 && <span className="text-rose-500">已驳回 {bounty.attempt} 次</span>}
            </div>

            {bounty.status === 'open' && bounty.lastError && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">{bounty.lastError}</p>
            )}
            {bounty.status === 'claimed' && bounty.lastError && (
                <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-600">最近一次失败：{bounty.lastError}</p>
            )}
            {bounty.status === 'claimed' && bounty.rejectReason && (
                <p className="mt-2 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-700">驳回原因：{bounty.rejectReason}</p>
            )}

            {bounty.status === 'delivered' && bounty.article && (
                <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                    <p className="truncate text-xs font-semibold text-slate-800">{bounty.article.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {bounty.article.category} · 交付于 {formatTime(bounty.deliveredAt)}
                    </p>
                    <button type="button" onClick={() => onOpenArticle(bounty.article!.collId, bounty.article!.articleId)}
                            className="mt-2 text-[11px] font-semibold text-violet-700 underline-offset-2 hover:underline">
                        查看交付帖子
                    </button>
                </div>
            )}

            {rejecting ? (
                <div className="mt-3 space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                    <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3}
                              maxLength={2000} placeholder="写明驳回原因，居民会据此重做"
                              className="w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setRejecting(false)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600">取消</button>
                        <button type="button" disabled={busy || !reason.trim()} onClick={submitReject}
                                className="rounded-lg bg-rose-500 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">确认驳回</button>
                    </div>
                </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {bounty.status === 'delivered' && (
                    <>
                        <button type="button" disabled={busy} onClick={() => onReview(true, '')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
                            <CheckCircle2 className="h-3.5 w-3.5"/>通过验收并发放奖励
                        </button>
                        <button type="button" disabled={busy} onClick={() => setRejecting(true)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-600 disabled:opacity-50">
                            <XCircle className="h-3.5 w-3.5"/>驳回重做
                        </button>
                    </>
                )}
                {bounty.status === 'open' && (
                    <>
                        <button type="button" disabled={busy} onClick={onRunNow}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 disabled:opacity-50">
                            <Send className="h-3.5 w-3.5"/>立即征询
                        </button>
                        <button type="button" disabled={busy} onClick={onReinvite}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 disabled:opacity-50">
                            <RotateCcw className="h-3.5 w-3.5"/>重新抽签
                        </button>
                    </>
                )}
                {(bounty.status === 'open' || bounty.status === 'claimed' || bounty.status === 'delivered') && (
                    <button type="button" disabled={busy} onClick={onCancel}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 disabled:opacity-50">
                        <TimerReset className="h-3.5 w-3.5"/>取消悬赏
                    </button>
                )}
                <button type="button" onClick={onToggle}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-orange-600">
                    {expanded ? '收起明细' : '查看征询与交付'}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
                </button>
            </div>

            {expanded && (
                <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] text-slate-600 sm:grid-cols-2">
                    <div>
                        <p className="mb-1 font-semibold text-slate-700">征询顺序</p>
                        {(bounty.invites || []).length ? (
                            <ul className="space-y-1">
                                {(bounty.invites || []).map(row => (
                                    <li key={`${row.agentId}-${row.status}`} className="flex items-center justify-between gap-2">
                                        <span className="truncate">{row.agentName || row.agentId}</span>
                                        <span className="shrink-0 text-slate-400">
                                            {row.status === 'accepted' ? '接受' : row.status === 'declined' ? `不接${row.reason ? `：${row.reason}` : ''}` : row.status === 'pending' ? '待询问' : '已作废'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-slate-400">暂无征询记录</p>}
                    </div>
                    <div>
                        <p className="mb-1 font-semibold text-slate-700">交付历史</p>
                        {(bounty.deliveries || []).length ? (
                            <ul className="space-y-1">
                                {(bounty.deliveries || []).map(row => (
                                    <li key={row.id}>
                                        <span className={row.status === 'rejected' ? 'text-rose-600' : 'text-emerald-600'}>
                                            {row.status === 'rejected' ? '已驳回' : row.status === 'accepted' ? '已通过' : '待验收'}
                                        </span>
                                        <span className="ml-1 text-slate-500">{formatTime(row.createdAt)}</span>
                                        {row.rejectReason && <p className="text-rose-500">{row.rejectReason}</p>}
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-slate-400">暂无交付</p>}
                    </div>
                </div>
            )}
        </article>
    );
}
