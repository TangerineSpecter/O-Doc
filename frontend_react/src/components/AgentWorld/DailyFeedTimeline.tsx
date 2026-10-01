import {ExecutionFeedSteps} from './ExecutionFeedSteps';
import PostRatingBadge from '../AgentPost/PostRatingBadge';
import {Activity, ArrowDown, ArrowUp, BookOpenText, CircleDollarSign, MapPin, MessageCircle, Package, RefreshCw, Sprout, Store, TrendingUp} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {DailyFeedCategory, DailyFeedEvent} from '../../types/api/dailyFeed';
import type {AgentActivity, AgentWorldAgentStatus} from '../../types/api/setting';
import {shanghaiDay, useDailyFeed} from '../../hooks/useDailyFeed';
import AgentActivityCard from './AgentActivityCard';
import AgentActivitySummary from './AgentActivitySummary';
import AgentAvatar from './AgentAvatar';
import DailyFinanceFeed from './DailyFinanceFeed';
import StarLoader from '../common/StarLoader';

const tabs = [
    {value: 'all', label: '全部', icon: Activity},
    {value: 'publication', label: '作品', icon: BookOpenText},
    {value: 'interaction', label: '互动', icon: MessageCircle},
    {value: 'travel', label: '旅行', icon: MapPin},
    {value: 'farm', label: '农场', icon: Sprout},
    {value: 'market', label: '市场', icon: Store},
    {value: 'trade', label: '交易', icon: Package},
    {value: 'investment', label: '投资', icon: TrendingUp},
    {value: 'finance', label: '收支', icon: CircleDollarSign},
    {value: 'record', label: '记录', icon: Activity},
] as const;

const categoryStyles: Record<DailyFeedCategory, {badge: string; active: string}> = {
    all: {badge: 'bg-orange-50 text-orange-700', active: 'bg-orange-50 text-orange-700'},
    publication: {badge: 'bg-amber-50 text-amber-700', active: 'bg-amber-50 text-amber-700'},
    interaction: {badge: 'bg-violet-50 text-violet-700', active: 'bg-violet-50 text-violet-700'},
    travel: {badge: 'bg-sky-50 text-sky-700', active: 'bg-sky-50 text-sky-700'},
    farm: {badge: 'bg-lime-50 text-lime-700', active: 'bg-lime-50 text-lime-700'},
    market: {badge: 'bg-emerald-50 text-emerald-700', active: 'bg-emerald-50 text-emerald-700'},
    trade: {badge: 'bg-teal-50 text-teal-700', active: 'bg-teal-50 text-teal-700'},
    investment: {badge: 'bg-indigo-50 text-indigo-700', active: 'bg-indigo-50 text-indigo-700'},
    finance: {badge: 'bg-rose-50 text-rose-700', active: 'bg-rose-50 text-rose-700'},
    record: {badge: 'bg-slate-100 text-slate-700', active: 'bg-slate-100 text-slate-700'},
};

function clock(value: string) {
    return new Date(value).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

function money(value: string) {
    const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
    return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function getEventActionLabel(target?: DailyFeedEvent['target']): string | null {
    if (!target) return null;
    const kindLabels: Record<string, string> = {
        farm: '打开农场',
        market: '打开市场',
        investment: '打开投资',
        travel: '查看旅行',
        life: '查看日程',
    };
    if (kindLabels[target.kind]) return kindLabels[target.kind];
    if (target.artifactKind === 'moment' && target.artifactId) return '查看动态';
    if (target.kind === 'activity' && target.collId && target.articleId) return '查看详情';
    if ((target.kind === 'activity' || target.kind === 'run') && (target.runRecordId || target.kind === 'run')) return '查看详情';
    return null;
}

function EventCard({event, residents, onOpen}: {event: DailyFeedEvent; residents: AgentWorldAgentStatus[]; onOpen: (event: DailyFeedEvent) => void}) {
    const [expanded, setExpanded] = useState(false);
    const agent = residents.find(item => item.id === event.actorId);
    const badge = tabs.find(item => item.value === event.category);
    const Icon = badge?.icon || Activity;
    const amount = event.amount;
    const expense = amount?.startsWith('-') || false;
    const actionLabel = getEventActionLabel(event.target);
    return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
            <AgentAvatar name={agent?.name || event.actorName} avatar={agent?.avatar || ''} size="md"/>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{agent?.name || event.actorName}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryStyles[event.category].badge}`}><Icon className="h-3 w-3"/>{badge?.label || event.category}</span>
                    {event.status === 'failed' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700">失败</span>}
                    {event.status === 'running' && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">进行中</span>}
                    {event.status === 'skipped' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">跳过</span>}
                    {event.category === 'travel' && event.status === 'success' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">已返程</span>}
                    {event.category === 'travel' && event.status === 'waiting' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">等待恢复</span>}
                    {event.category === 'travel' && event.status === 'manual' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">需要处理</span>}
                    {event.category === 'travel' && event.status === 'paused' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">已暂停</span>}
                    <time className="ml-auto text-xs tabular-nums text-slate-400" dateTime={event.occurredAt}>{clock(event.occurredAt)}</time>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{event.title}</h3><PostRatingBadge rating={event.rating}/></div>
                {event.detail && <div className="mt-1.5"><AgentActivitySummary text={event.detail} expanded={expanded} onExpandedChange={setExpanded} variant={event.category === 'interaction' ? 'interaction' : event.category === 'publication' ? 'publication' : 'work'}/></div>}
                {!!event.steps?.length && <ExecutionFeedSteps steps={event.steps}/>}
                {(amount !== null || actionLabel) && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    {actionLabel && <button type="button" onClick={() => onOpen(event)} className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100">{actionLabel}</button>}
                    {amount !== null && <span className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${expense ? 'text-red-600' : 'text-emerald-600'}`}>
                        {expense ? <ArrowDown className="h-3.5 w-3.5"/> : <ArrowUp className="h-3.5 w-3.5"/>}{expense ? '-' : '+'}{money(amount)} 世界币
                    </span>}
                </div>}
            </div>
        </div>
    </article>;
}

function RecordCard({event, residents, onOpen}: {event: DailyFeedEvent; residents: AgentWorldAgentStatus[]; onOpen: (event: DailyFeedEvent) => void}) {
    if (!['activity', 'run', 'run-finished'].includes(event.source)) {
        return <EventCard event={event} residents={residents} onOpen={onOpen}/>;
    }
    const resident = residents.find(item => item.id === event.actorId);
    const activity: AgentActivity = {
        id: event.id,
        type: 'work',
        status: event.status === 'running' || event.status === 'failed' ? event.status : 'success',
        agent: {id: event.actorId, name: resident?.name || event.actorName, avatar: resident?.avatar || ''},
        title: event.title,
        summary: event.detail,
        currentAction: event.currentAction,
        occurredAt: event.occurredAt,
        runRecordId: event.target?.runRecordId || (event.target?.kind === 'run' ? event.target.id : null),
        outputPreview: event.outputPreview,
    };
    return <AgentActivityCard activity={activity} onOpenRun={() => onOpen(event)} onOpenArtifact={() => onOpen(event)}/>;
}

export default function DailyFeedTimeline({actorId, residents, onOpen, onSummary, refreshToken = 0}: {
    actorId: string;
    residents: AgentWorldAgentStatus[];
    onOpen: (event: DailyFeedEvent) => void;
    onSummary?: (value: {date: string; total: number; actorCounts: Record<string, number>}) => void;
    refreshToken?: number;
}) {
    const [category, setCategory] = useState<DailyFeedCategory>('all');
    const feed = useDailyFeed(actorId, category);
    useEffect(() => {if (refreshToken) feed.reload();}, [refreshToken, feed.reload]);
    const today = shanghaiDay();
    // 页眉和居民计数保留今日口径，下面的活动列表跨日期展示。
    const summary = feed.result;
    useEffect(() => {
        if (summary && summary.date === today) onSummary?.({date: summary.date, total: summary.allTotal, actorCounts: summary.actorCounts});
    }, [summary, today, onSummary]);
    return <section id="agent-world-daily-feed" aria-label="居民活动时间线" className="scroll-mt-6">
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="活动类型">
                <div className="flex w-max items-center gap-1">
                    {tabs.map(tab => {const Icon = tab.icon; return <button key={tab.value} type="button" role="tab" aria-selected={category === tab.value} onClick={() => setCategory(tab.value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${category === tab.value ? categoryStyles[tab.value].active : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon className="h-3.5 w-3.5"/>{tab.label}</button>;})}
                </div>
            </div>
            <span className="shrink-0 text-xs text-slate-500">{feed.loading ? '读取中' : `已加载 ${feed.items.length} 条`}</span>
            <button type="button" onClick={feed.reload} disabled={feed.loading} aria-label="刷新活动" title="刷新动态" className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 disabled:cursor-wait"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${feed.loading ? 'motion-safe:animate-spin' : ''}`}/></button>
        </div>
        {feed.loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl bg-white"><StarLoader variant="pill" message="更新最新动态..."/></div> : feed.error && !feed.items.length ? <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">{feed.error}<button type="button" onClick={feed.reload} className="ml-3 underline">重试</button></div> : feed.items.length ? <div className="space-y-3">
            {category === 'finance'
                ? <DailyFinanceFeed events={feed.items} residents={residents}/>
                : feed.items.map(event => category === 'record'
                    ? <RecordCard key={event.id} event={event} residents={residents} onOpen={onOpen}/>
                    : <EventCard key={event.id} event={event} residents={residents} onOpen={onOpen}/>)}
            {feed.error && <p className="text-center text-xs text-red-600">{feed.error}</p>}
            {feed.result?.hasMore && <button type="button" disabled={feed.loadingMore} onClick={() => void feed.loadMore()} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-xs font-medium text-slate-600 hover:border-orange-200 disabled:opacity-50">{feed.loadingMore ? '加载中…' : '加载更多'}</button>}
        </div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">暂无{category === 'all' ? '' : tabs.find(tab => tab.value === category)?.label}活动</div>}
    </section>;
}
