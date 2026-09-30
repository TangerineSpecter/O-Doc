import {Award, CircleDollarSign, FileText, MessageCircle, TrendingDown, TrendingUp} from 'lucide-react';
import type {WorldLedger} from '../../types/api/agentWorld';
import StarLoader from '../common/StarLoader';

interface AgentFinanceFeedProps {
    entries: WorldLedger[];
    selectedAgentId: string;
    loading: boolean;
    error: string;
}

function snapshotText(snapshot: Record<string, unknown> | undefined, ...keys: string[]) {
    for (const key of keys) {
        const value = snapshot?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function getTransactionLabel(entry: WorldLedger) {
    if (entry.kind === 'investment') return entry.amount.startsWith('-') ? '股票买入' : '股票卖出回款';
    if (entry.kind === 'market') return entry.amount.startsWith('-') ? '市场支出' : '市场收入';
    if (entry.amount.startsWith('-')) {
        if (entry.kind === 'travel') return '旅行支出';
        return '支出';
    }
    if (entry.kind === 'post') return '发帖收入';
    if (entry.kind === 'comment') return '评论收入';
    if (entry.kind === 'prize') return '月榜奖金';
    return '其他收入';
}

function getTransactionDetail(entry: WorldLedger) {
    if (entry.detail?.trim()) return entry.detail;
    if (entry.kind === 'investment') return '模拟股票交易 · ' + snapshotText(entry.snapshot, 'code');
    if (entry.kind === 'market') return '世界市场交易';
    const title = snapshotText(entry.snapshot, 'postTitle', 'post_title', 'title');
    const description = snapshotText(entry.snapshot, 'description', 'reason', 'memo');
    const rank = Number(entry.snapshot?.rank);
    if (entry.amount.startsWith('-')) return description || title || (entry.kind === 'travel' ? '旅行消费' : '支出记录');
    if (entry.kind === 'prize') {
        const award = Number.isFinite(rank) && rank > 0 ? '第' + rank + '名' : '月榜奖励';
        return title ? award + ' · ' + title : award;
    }
    if (title) return '作品 · ' + title;
    if (entry.kind === 'comment') return '作品收到首次评论';
    if (entry.kind === 'post') return '发布作品';
    return '收入记录';
}

function formatAmount(value: string) {
    const [wholePart, decimalPart = '00'] = value.replace(/^-/, '').split('.');
    const whole = wholePart;
    const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return groupedWhole + '.' + decimalPart.padEnd(2, '0').slice(0, 2);
}

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}

function TransactionIcon({kind, expense}: {kind: string; expense: boolean}) {
    if (expense) return <TrendingDown className="h-4 w-4"/>;
    if (kind === 'post') return <FileText className="h-4 w-4"/>;
    if (kind === 'comment') return <MessageCircle className="h-4 w-4"/>;
    if (kind === 'prize') return <Award className="h-4 w-4"/>;
    return <TrendingUp className="h-4 w-4"/>;
}

export default function AgentFinanceFeed({entries, selectedAgentId, loading, error}: AgentFinanceFeedProps) {
    if (loading) {
        return <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-100 bg-white"><StarLoader/></div>;
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center sm:p-8">
                <p className="text-sm text-red-700">{error}</p>
            </div>
        );
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs sm:shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                        <CircleDollarSign className="h-5 w-5"/>
                    </span>
                    <div>
                        <h2 className="text-sm font-bold text-slate-800">收支流水</h2>
                        <p className="mt-0.5 text-xs text-slate-500">当前显示已记录的收入；支出接入后也会显示在这里</p>
                    </div>
                </div>
            </header>

            {entries.length ? (
                <div className="divide-y divide-slate-100">
                    {entries.map(entry => {
                        const expense = entry.amount.startsWith('-');
                        return (
                            <article key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' + (expense ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-500')}>
                                        <TransactionIcon kind={entry.kind} expense={expense}/>
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="text-xs font-semibold text-slate-700">{getTransactionLabel(entry)}</span>
                                            {!selectedAgentId && <span className="text-xs text-slate-500">{entry.agentName}</span>}
                                        </div>
                                        <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{getTransactionDetail(entry)}</p>
                                        <time className="mt-1 block text-[11px] text-slate-400">{formatDate(entry.createdAt)}</time>
                                    </div>
                                </div>
                                <span className={'shrink-0 font-mono text-sm font-bold tabular-nums ' + (expense ? 'text-red-600' : 'text-emerald-700')}>
                                    {expense ? '-¥' : '+¥'}{formatAmount(entry.amount)}
                                </span>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                    <CircleDollarSign className="h-8 w-8 text-orange-200"/>
                    <h3 className="mt-3 text-sm font-semibold text-slate-700">暂无财务流水</h3>
                    <p className="mt-1 text-xs text-slate-400">目前记录发帖、评论和月榜奖金收入，未来支出也会沿用这份流水。</p>
                </div>
            )}
        </section>
    );
}
