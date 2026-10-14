import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowDownLeft, ArrowLeft, ArrowUpRight, Loader2, RefreshCw} from 'lucide-react';
import {getResidentAnalyticsLedger} from '../../../api/residentAnalytics';
import type {AnalyticsComparison, ResidentAnalyticsLedgerEntry} from '../../../types/api/residentAnalytics';
import AgentAvatar from '../AgentAvatar';
import {ProfessionBadge} from '../ProfessionBadge';

const kindLabels: Record<string, string> = {
    post: '作品收入', comment: '评论收入', prize: '月榜奖金', travel: '旅行支出',
    souvenir: '旅行购物', farm: '农场收支', market: '市场收支', investment: '投资成交',
};

function snapshotText(snapshot: Record<string, unknown> | null, ...keys: string[]) {
    if (!snapshot) return '';
    for (const key of keys) {
        const value = snapshot[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function labelFor(entry: ResidentAnalyticsLedgerEntry, expense: boolean) {
    if (entry.kind === 'market') return expense ? '市场支出' : '市场收入';
    if (entry.kind === 'investment') return expense ? '股票买入' : '卖出回款';
    if (entry.kind === 'farm') return expense ? '农场支出' : '农场收入';
    return kindLabels[entry.kind] || (expense ? '支出' : '收入');
}

function detailFor(entry: ResidentAnalyticsLedgerEntry) {
    if (entry.detail?.trim()) return entry.detail.trim();
    const title = snapshotText(entry.snapshot, 'postTitle', 'post_title', 'title');
    const description = snapshotText(entry.snapshot, 'description', 'reason', 'memo');
    const code = snapshotText(entry.snapshot, 'code');
    if (entry.kind === 'investment') return code ? `模拟股票交易 · ${code}` : '模拟股票交易';
    if (entry.kind === 'market') return '世界市场交易';
    if (description || title) return description || title;
    if (entry.kind === 'prize') return title ? `月榜奖励 · ${title}` : '月榜奖励';
    if (entry.kind === 'travel') return '旅行消费';
    if (entry.kind === 'post') return title ? `作品 · ${title}` : '发布作品';
    if (entry.kind === 'comment') return '作品收到首次评论';
    return '';
}

function formatAmount(value: string) {
    const [whole = '0', fraction = '00'] = value.replace(/^-/, '').split('.');
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
}

export default function ResidentLedgerPanel({
    resident, startDate, endDate, onBack,
}: {
    resident: AnalyticsComparison | null; startDate: string; endDate: string; onBack: () => void;
}) {
    const residentId = resident?.id || '';
    const [items, setItems] = useState<ResidentAnalyticsLedgerEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState('');
    const scrollRoot = useRef<HTMLDivElement>(null);
    const loadNextRef = useRef<() => Promise<void>>(async () => undefined);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        let busy = false;
        let nextPage = 1;
        let more = true;

        setItems([]);
        setError('');
        setHasMore(false);
        setLoading(Boolean(residentId));
        setLoadingMore(false);

        const loadNext = async () => {
            if (!residentId || !active || busy || !more) return;
            busy = true;
            const initial = nextPage === 1;
            setLoading(initial);
            setLoadingMore(!initial);
            setError('');
            try {
                const result = await getResidentAnalyticsLedger({
                    start_date: startDate, end_date: endDate, actor_id: residentId, page: nextPage,
                }, controller.signal);
                if (!active) return;
                setItems(current => initial ? result.items : [...current, ...result.items]);
                more = result.hasMore;
                nextPage = result.nextPage || nextPage;
                setHasMore(more);
            } catch {
                if (active && !controller.signal.aborted) setError('收支明细加载失败，请重试');
            } finally {
                busy = false;
                if (active) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        };

        loadNextRef.current = loadNext;
        if (residentId) void loadNext();
        return () => {
            active = false;
            controller.abort();
            loadNextRef.current = async () => undefined;
        };
    }, [residentId, startDate, endDate]);

    const checkScroll = useCallback(() => {
        const element = scrollRoot.current;
        if (!element || !hasMore || loading || loadingMore || error) return;
        if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
            void loadNextRef.current();
        }
    }, [error, hasMore, loading, loadingMore]);

    useEffect(() => {
        const element = scrollRoot.current;
        if (residentId && hasMore && !loading && !loadingMore && !error && element
            && element.scrollHeight <= element.clientHeight + 1) {
            void loadNextRef.current();
        }
    }, [residentId, items.length, hasMore, loading, loadingMore, error]);

    return (
        <section className="flex h-full min-h-0 flex-col bg-white" aria-label={resident ? `${resident.name}收支明细` : '居民收支明细'}>
            <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-4">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={!resident}
                    aria-label="返回居民列表"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:pointer-events-none"
                >
                    <ArrowLeft className="h-4 w-4"/>
                </button>
                {resident && <AgentAvatar name={resident.name} avatar={resident.avatar} size="xs"/>}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-sm font-bold text-slate-800">{resident?.name || '居民收支明细'}</h3>
                        {resident && (
                            <ProfessionBadge
                                professionName={resident.professionName}
                                size="xs"
                                variant="purple"
                                showEmpty={!resident.departed}
                                emptyText="无业"
                            />
                        )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{startDate} 至 {endDate} · 按时间由近到远</p>
                </div>
                <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-600">收支流水</span>
            </header>

            <div
                ref={scrollRoot}
                onScroll={checkScroll}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide"
                aria-busy={loading || loadingMore}
                aria-live="polite"
            >
                {loading && items.length === 0 ? (
                    <div className="flex h-full min-h-64 items-center justify-center gap-2 text-xs text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin text-orange-500"/>正在加载收支明细
                    </div>
                ) : error && items.length === 0 ? (
                    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
                        <p className="text-xs text-rose-600">{error}</p>
                        <button type="button" onClick={() => void loadNextRef.current()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100">
                            <RefreshCw className="h-3.5 w-3.5"/>重试
                        </button>
                    </div>
                ) : items.length ? (
                    <div className="divide-y divide-slate-100">
                        {items.map(entry => {
                            const expense = entry.amount.startsWith('-');
                            const detail = detailFor(entry);
                            return (
                                <article key={entry.id} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:px-5">
                                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${expense ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {expense ? <ArrowDownLeft className="h-4 w-4"/> : <ArrowUpRight className="h-4 w-4"/>}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="text-xs font-semibold text-slate-700">{labelFor(entry, expense)}</span>
                                            <time className="text-[11px] text-slate-400">{formatTime(entry.createdAt)}</time>
                                        </div>
                                        {detail && <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">{detail}</p>}
                                    </div>
                                    <span className={`shrink-0 whitespace-nowrap font-mono text-sm font-bold tabular-nums ${expense ? 'text-rose-600' : 'text-emerald-700'}`}>
                                        {expense ? '-' : '+'}¥{formatAmount(entry.amount)}
                                    </span>
                                </article>
                            );
                        })}
                        <div className="flex min-h-12 items-center justify-center px-4 py-3 text-[11px] text-slate-400">
                            {loadingMore ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500"/>正在加载更多</span>
                                : error ? <button type="button" onClick={() => void loadNextRef.current()} className="inline-flex items-center gap-1.5 font-medium text-orange-600 hover:text-orange-700"><RefreshCw className="h-3.5 w-3.5"/>加载失败，点击重试</button>
                                    : hasMore ? <span>继续向下滚动加载</span> : <span>已显示全部明细</span>}
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-400">
                            <ArrowUpRight className="h-5 w-5"/>
                        </span>
                        <h4 className="mt-3 text-sm font-semibold text-slate-700">区间内暂无收支明细</h4>
                        <p className="mt-1 text-xs text-slate-400">这个时间范围没有已记录的收入或支出</p>
                    </div>
                )}
            </div>
        </section>
    );
}
