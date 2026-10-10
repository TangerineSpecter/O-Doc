import {ArrowUpRight, RefreshCw} from 'lucide-react';
import {useEffect, useRef} from 'react';
import type {AgentRelationNode} from '../../types/api/setting';
import {useDailyFeed} from '../../hooks/useDailyFeed';
import ResidentActivityTimeline from './ResidentActivityTimeline';
import WorldDialog from './WorldDialog';
import AgentAvatar from './AgentAvatar';
import StarLoader from '../common/StarLoader';
import './residentActivityTransition.css';

export default function ResidentActivityDialog({agent, onClose, onViewComplete}: {agent: AgentRelationNode; onClose: () => void; onViewComplete?: () => void}) {
    const feed = useDailyFeed(agent.id, 'all', 10);
    const scrollRoot = useRef<HTMLDivElement>(null);
    const loadMoreTarget = useRef<HTMLDivElement>(null);
    const {loading, loadingMore, error, result, loadMore} = feed;
    useEffect(() => {
        if (loading || loadingMore || error || !result?.hasMore || !scrollRoot.current || !loadMoreTarget.current) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) void loadMore();
        }, {root: scrollRoot.current, rootMargin: '0px 0px 100px 0px'});
        observer.observe(loadMoreTarget.current);
        return () => observer.disconnect();
    }, [loading, loadingMore, error, result?.hasMore, loadMore]);
    return <WorldDialog title={`${agent.name}的最近活动`} description="最近发生的小事，按时间从新到旧排列。" size="compact" fixedHeight onClose={onClose}>
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3"><AgentAvatar name={agent.name} avatar={agent.avatar}/><div className="flex-1"><p className="text-sm font-semibold text-slate-800">{agent.name}</p><p className="mt-1 text-xs text-slate-400">最近的创作与生活动态</p></div><button type="button" aria-label="刷新居民活动" title="刷新" disabled={feed.loading || feed.loadingMore} onClick={feed.reload} className="rounded-md border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:border-orange-200 hover:text-orange-600"><RefreshCw className={`h-4 w-4 ${feed.loading ? 'motion-safe:animate-spin' : ''}`}/></button></div>
            <div ref={scrollRoot} className="relative min-h-0 flex-1 overflow-y-auto px-1 scrollbar-hide" aria-busy={feed.loading || feed.loadingMore}>
                <div role="status" aria-hidden={!feed.loading} className={`resident-activity-loading flex justify-center py-12 ${feed.loading ? '' : 'resident-activity-loading-finished'}`}><StarLoader variant="pill" message="正在读取最近活动…"/></div>
                {!feed.loading && <div className="resident-activity-content">
                {feed.error && !feed.items.length && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{feed.error}<button type="button" onClick={feed.reload} className="ml-2 underline">重试</button></p>}
                <ResidentActivityTimeline events={feed.items} name={agent.name}/>
                {!feed.error && !feed.items.length && <p className="py-12 text-center text-sm text-slate-400">还没有活动记录。</p>}
                {feed.result?.hasMore ? <div ref={loadMoreTarget} className="flex min-h-16 items-center justify-center py-4">
                    {feed.error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-600">{feed.error}<button type="button" onClick={() => void feed.loadMore()} className="ml-2 underline">重试</button></p>
                        : feed.loadingMore ? <div role="status"><StarLoader variant="pill" size="sm" message="正在读取更早的活动…"/></div>
                            : <span className="text-xs text-slate-400">向下滚动加载更多</span>}
                </div> : !!feed.items.length && <p className="py-5 text-center text-xs text-slate-400">已经到底了，暂无更多活动</p>}
                </div>}
            </div>
            {onViewComplete && <footer className="mt-4 shrink-0 border-t border-slate-100 pt-3"><button type="button" onClick={onViewComplete} className="flex w-full items-center justify-center gap-2 rounded-md border border-orange-200 bg-orange-50/70 py-2.5 text-xs font-semibold text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100">查看完整动态<ArrowUpRight className="h-3.5 w-3.5"/></button></footer>}
        </div>
    </WorldDialog>;
}
