import {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import {Activity} from 'lucide-react';
import type {AgentRunRecordConfig} from '@/api/setting';
import type {AgentRunRecordFeed} from '@/hooks/useAgentRunRecords';

interface Props {
    feed: AgentRunRecordFeed;
    onSelect: (id: string) => void;
    renderAgentSummary: (names: string[]) => ReactNode;
    getRecordTriggerLabel: (trigger: string) => string;
    getRecordDuration: (record: AgentRunRecordConfig) => string;
    getRecordStatusMeta: (status: AgentRunRecordConfig['status']) => {label: string; icon: ReactNode; className: string};
}

export function AgentRunRecordList({feed, onSelect, renderAgentSummary, getRecordTriggerLabel, getRecordDuration, getRecordStatusMeta}: Props) {
    const {hasMore, loading, error, loadMore, records} = feed;
    const scrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!hasMore || loading || error) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) void loadMore();
        }, {root: scrollRef.current, rootMargin: '0px 0px 120px 0px'});
        if (sentinelRef.current) observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, loading, error, records.length, loadMore]);

    return (
        <div className="flex h-[clamp(240px,calc(100dvh-300px),680px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1.05fr_0.75fr_0.7fr_0.75fr_0.55fr_0.45fr] gap-4 shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                <span>任务 / 摘要</span>
                <span>Agent</span>
                <span>触发方式</span>
                <span>状态</span>
                <span className="text-right">耗时</span>
                <span></span>
            </div>
            <div ref={scrollRef} role="region" aria-label="执行记录列表" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
                <div className="divide-y divide-slate-100">
                    {feed.records.map(record => {
                        const statusMeta = getRecordStatusMeta(record.status);
                        const recordAgentNames = record.agentRuns?.length
                            ? record.agentRuns.map(agentRun => agentRun.agentName).filter(Boolean)
                            : [record.agentName].filter(Boolean);
                        return (
                            <div key={record.id} className="grid grid-cols-1 gap-3 px-4 py-4 text-sm transition-colors hover:bg-orange-50/30 md:grid-cols-[1.05fr_0.75fr_0.7fr_0.75fr_0.55fr_0.45fr] md:items-center md:gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <Activity className="h-3.5 w-3.5"/>
                                        {record.startedAt}
                                    </div>
                                    <p className="mt-1 truncate font-semibold text-slate-800">执行「{record.taskName}」任务</p>
                                    <p className="mt-0.5 truncate text-xs text-slate-500">{record.summary}</p>
                                </div>
                                {renderAgentSummary(recordAgentNames)}
                                <span className="truncate text-slate-500">{getRecordTriggerLabel(record.trigger)}</span>
                                <span className={`inline-flex w-fit items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${statusMeta.className}`}>
                                    {statusMeta.icon}
                                    {statusMeta.label}
                                </span>
                                <span className="text-left font-mono text-xs text-slate-500 md:text-right">{getRecordDuration(record)}</span>
                                <button
                                    onClick={() => onSelect(record.id)}
                                    className="text-left text-xs font-medium text-orange-600 hover:text-orange-700 md:text-right"
                                >
                                    详情
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div ref={sentinelRef} className="px-4 py-4 text-center text-xs text-slate-400" aria-live="polite">
                    {feed.error ? <div className="text-red-500">{feed.error}<button onClick={() => void feed.retry()} className="ml-3 font-medium text-orange-600">重试</button></div>
                        : feed.loading ? '正在加载执行记录…'
                        : !feed.records.length ? '暂无执行记录'
                        : feed.hasMore ? <button onClick={() => void feed.loadMore()} className="text-orange-600">加载更多</button>
                        : `已加载全部 ${feed.records.length} 条记录`}
                </div>
            </div>
        </div>
    );
}
