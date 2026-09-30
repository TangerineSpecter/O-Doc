import {ArrowUpRight, RefreshCw} from 'lucide-react';
import type {AgentRelationNode} from '../../types/api/setting';
import {useDailyFeed} from '../../hooks/useDailyFeed';
import ResidentActivityTimeline from './ResidentActivityTimeline';
import WorldDialog from './WorldDialog';
import AgentAvatar from './AgentAvatar';

export default function ResidentActivityDialog({agent, onClose, onViewComplete}: {agent: AgentRelationNode; onClose: () => void; onViewComplete?: () => void}) {
    const feed = useDailyFeed(agent.id, 'all');
    return <WorldDialog title={`${agent.name}的最近活动`} description="最近发生的小事，按时间从新到旧排列。" size="compact" fixedHeight onClose={onClose}>
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3"><AgentAvatar name={agent.name} avatar={agent.avatar}/><div className="flex-1"><p className="text-sm font-semibold text-slate-800">{agent.name}</p><p className="mt-1 text-xs text-slate-400">最近的创作与生活动态</p></div><button type="button" aria-label="刷新居民活动" title="刷新" disabled={feed.loading || feed.loadingMore} onClick={feed.reload} className="rounded-md border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:border-orange-200 hover:text-orange-600"><RefreshCw className={`h-4 w-4 ${feed.loading ? 'motion-safe:animate-spin' : ''}`}/></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 scrollbar-hide" aria-busy={feed.loading}>
                {feed.loading && <p role="status" className="py-12 text-center text-xs text-slate-400">正在读取最近活动…</p>}
                {feed.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{feed.error}<button type="button" onClick={feed.reload} className="ml-2 underline">重试</button></p>}
                {!feed.loading && <ResidentActivityTimeline events={feed.items} name={agent.name}/>}
                {!feed.loading && !feed.error && !feed.items.length && <p className="py-12 text-center text-sm text-slate-400">还没有活动记录。</p>}
                {feed.result?.hasMore && <button type="button" disabled={feed.loadingMore || feed.loading} onClick={() => void feed.loadMore()} className="my-4 w-full rounded-md border border-slate-200 bg-white py-2.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">{feed.loadingMore ? '读取中…' : '查看更早的活动'}</button>}
            </div>
            {onViewComplete && <footer className="mt-4 shrink-0 border-t border-slate-100 pt-3"><button type="button" onClick={onViewComplete} className="flex w-full items-center justify-center gap-2 rounded-md border border-orange-200 bg-orange-50/70 py-2.5 text-xs font-semibold text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100">查看完整动态<ArrowUpRight className="h-3.5 w-3.5"/></button></footer>}
        </div>
    </WorldDialog>;
}
