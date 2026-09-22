import {ArrowUpRight, BookOpenText, CircleAlert, LoaderCircle, MessageCircle, Sparkles} from 'lucide-react';
import type {AgentActivity} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';

const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
    return date.toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
};

export default function AgentActivityCard({
    activity,
    onOpenRun,
    onOpenArtifact,
}: {
    activity: AgentActivity;
    onOpenRun: (activity: AgentActivity) => void;
    onOpenArtifact: (activity: AgentActivity) => void;
}) {
    const icon = activity.type === 'publication'
        ? <BookOpenText className="h-4 w-4"/>
        : activity.type === 'interaction'
            ? <MessageCircle className="h-4 w-4"/>
            : activity.status === 'running'
                ? <LoaderCircle className="h-4 w-4 animate-spin"/>
                : activity.status === 'failed'
                    ? <CircleAlert className="h-4 w-4"/>
                    : <Sparkles className="h-4 w-4"/>;
    const tone = activity.status === 'failed'
        ? 'border-red-100 bg-red-50 text-red-600'
        : activity.status === 'running'
            ? 'border-blue-100 bg-blue-50 text-blue-600'
            : activity.type === 'publication'
                ? 'border-orange-100 bg-orange-50 text-orange-600'
                : 'border-violet-100 bg-violet-50 text-violet-600';
    const surfaceTone = activity.status === 'failed'
        ? 'border-red-100 bg-red-50/40 hover:border-red-200'
        : activity.type === 'publication'
            ? 'border-orange-100 bg-orange-50/35 hover:border-orange-200'
            : activity.type === 'interaction'
                ? 'border-violet-100 bg-violet-50/35 hover:border-violet-200'
                : 'border-blue-100 bg-blue-50/30 hover:border-blue-200';

    return (
        <article className={`rounded-xl sm:rounded-2xl border p-3.5 sm:p-5 shadow-xs sm:shadow-sm transition-all hover:shadow-md ${surfaceTone}`}>
            <div className="flex gap-2.5 sm:gap-3">
                <AgentAvatar name={activity.agent.name} avatar={activity.agent.avatar}/>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${tone}`}>{icon}</span>
                            <h2 className="truncate text-sm font-bold text-slate-900">{activity.title}</h2>
                        </div>
                        <time className="shrink-0 text-xs text-slate-400">{formatTime(activity.occurredAt)}</time>
                    </div>

                    {activity.currentAction && (
                        <div className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                            {activity.status === 'running' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"/>}
                            {activity.currentAction}
                        </div>
                    )}

                    {activity.summary && (
                        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{activity.summary}</p>
                    )}

                    {activity.outputPreview && activity.type === 'work' && (
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs leading-5 text-slate-500">
                            <span className="line-clamp-3 whitespace-pre-wrap">{activity.outputPreview}</span>
                        </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        {activity.artifact && (
                            <button
                                type="button"
                                onClick={() => onOpenArtifact(activity)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600"
                            >
                                {activity.type === 'publication' ? '阅读全文' : '查看原文'}
                                <ArrowUpRight className="h-3.5 w-3.5"/>
                            </button>
                        )}
                        {activity.runRecordId && (
                            <button
                                type="button"
                                onClick={() => onOpenRun(activity)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                            >
                                {activity.type === 'work' ? '查看完整输出' : '查看执行过程'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
