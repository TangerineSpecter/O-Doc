import {ArrowUpRight, BookOpenText, CircleAlert, LoaderCircle, MessageCircle, Sparkles, Terminal} from 'lucide-react';
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
    // 动态类型与状态标识配置
    const isWork = activity.type === 'work';
    const isPublication = activity.type === 'publication';
    const isInteraction = activity.type === 'interaction';

    // 头像右下角微角标图标
    const avatarBadgeIcon = isPublication
        ? <BookOpenText className="h-2.5 w-2.5 text-orange-600"/>
        : isInteraction
            ? <MessageCircle className="h-2.5 w-2.5 text-violet-600"/>
            : activity.status === 'running'
                ? <LoaderCircle className="h-2.5 w-2.5 text-blue-600 animate-spin"/>
                : activity.status === 'failed'
                    ? <CircleAlert className="h-2.5 w-2.5 text-red-600"/>
                    : <Sparkles className="h-2.5 w-2.5 text-emerald-600"/>;

    // 动态类型胶囊徽章配置
    const typeBadge = isPublication
        ? {label: '作品发布', className: 'bg-orange-50 text-orange-700 border-orange-200/80'}
        : isInteraction
            ? {label: '文章批注', className: 'bg-violet-50 text-violet-700 border-violet-200/80'}
            : activity.status === 'running'
                ? {label: '任务执行中', className: 'bg-blue-50 text-blue-700 border-blue-200/80'}
                : activity.status === 'failed'
                    ? {label: '执行失败', className: 'bg-red-50 text-red-700 border-red-200/80'}
                    : {label: '任务完成', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80'};

    // 提取目标文章标题
    const targetArticleTitle = activity.artifact?.title || (() => {
        const match = activity.title.match(/《([^》]+)》/);
        return match ? match[1] : null;
    })();

    // 动作文本引导
    const actionLabel = activity.currentAction || (
        isPublication
            ? '发布了新作品'
            : isInteraction
                ? '留下了文章批注'
                : activity.status === 'running'
                    ? '正在执行任务'
                    : '完成了任务'
    );

    return (
        <article className="group relative rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md">
            <div className="flex gap-3 sm:gap-3.5">
                {/* Agent 头像与微角标 */}
                <div className="relative shrink-0 self-start">
                    <div className="transition-transform duration-200 group-hover:scale-105">
                        <AgentAvatar name={activity.agent.name} avatar={activity.agent.avatar} size="md"/>
                    </div>
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 sm:h-4.5 sm:w-4.5 items-center justify-center rounded-full border border-white bg-slate-50 shadow-2xs">
                        {avatarBadgeIcon}
                    </span>
                </div>

                {/* 右侧主体内容 */}
                <div className="min-w-0 flex-1">
                    {/* 顶部信息行：Agent 名字、状态徽章、相对时间 */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="max-w-[120px] truncate text-sm font-bold text-slate-900 sm:max-w-[200px]">
                                {activity.agent.name}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none ${typeBadge.className}`}>
                                {typeBadge.label}
                            </span>
                        </div>
                        <time className="shrink-0 font-sans text-xs text-slate-400">
                            {formatTime(activity.occurredAt)}
                        </time>
                    </div>

                    {/* 动作与目标指示行 */}
                    {isWork ? (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                            {activity.status === 'running' && (
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"/>
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"/>
                                </span>
                            )}
                            <span className="font-medium text-slate-600">{activity.title}</span>
                        </div>
                    ) : (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="font-medium text-slate-600">{actionLabel}</span>
                            {targetArticleTitle && (
                                <>
                                    <span className="text-slate-300">·</span>
                                    {activity.artifact ? (
                                        <button
                                            type="button"
                                            onClick={() => onOpenArtifact(activity)}
                                            className="max-w-full truncate font-medium text-slate-700 transition-colors hover:text-orange-600 hover:underline"
                                            title={targetArticleTitle}
                                        >
                                            《{targetArticleTitle}》
                                        </button>
                                    ) : (
                                        <span className="max-w-full truncate font-medium text-slate-700" title={targetArticleTitle}>
                                            《{targetArticleTitle}》
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* 场景分流展示 */}
                    {/* 1. 文章批注/互动场景：言论气泡 (Quote Bubble) */}
                    {isInteraction && activity.summary && (
                        <div className="relative mt-2.5 rounded-r-xl border border-slate-150 border-l-[3px] border-l-orange-400 bg-slate-50/60 p-3 pl-3.5 font-sans sm:mt-3 sm:p-3.5 sm:pl-4">
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 sm:text-sm">
                                {activity.summary}
                            </p>
                        </div>
                    )}

                    {/* 2. 作品发布场景：文章预览卡片 */}
                    {isPublication && (
                        <div
                            onClick={() => activity.artifact && onOpenArtifact(activity)}
                            className="group/pub mt-2.5 cursor-pointer rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 transition-colors hover:border-orange-200/80 hover:bg-orange-50/30 sm:mt-3 sm:p-3.5"
                        >
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 transition-colors group-hover/pub:text-orange-600">
                                <BookOpenText className="h-3.5 w-3.5 shrink-0 text-orange-500"/>
                                <span className="truncate">{targetArticleTitle || activity.title}</span>
                            </div>
                            {activity.summary && (
                                <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-500">
                                    {activity.summary}
                                </p>
                            )}
                        </div>
                    )}

                    {/* 3. 后台任务场景：任务进度与控制台输出预览 */}
                    {isWork && (
                        <div className="mt-2.5 space-y-2 sm:mt-3">
                            {activity.summary && (
                                <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                                    {activity.summary}
                                </p>
                            )}
                            {activity.outputPreview && (
                                <div className="rounded-xl border border-slate-200/80 bg-slate-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200 shadow-inner">
                                    <div className="mb-1.5 flex items-center justify-between border-b border-slate-800 pb-1 text-[10px] text-slate-400">
                                        <span>输出预览</span>
                                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-sans text-[9px] text-slate-300">
                                            {activity.status === 'running' ? 'RUNNING' : 'LOG'}
                                        </span>
                                    </div>
                                    <pre className="line-clamp-4 whitespace-pre-wrap font-mono text-slate-300">
                                        {activity.outputPreview}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 底部操作栏 */}
                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            {activity.artifact && (
                                <button
                                    type="button"
                                    onClick={() => onOpenArtifact(activity)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200/80 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 shadow-2xs transition-all hover:border-orange-500 hover:bg-orange-500 hover:text-white active:scale-95"
                                >
                                    <span>{activity.type === 'publication' ? '阅读全文' : '查看原文'}</span>
                                    <ArrowUpRight className="h-3.5 w-3.5"/>
                                </button>
                            )}
                            {activity.runRecordId && (
                                <button
                                    type="button"
                                    onClick={() => onOpenRun(activity)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95"
                                >
                                    <Terminal className="h-3.5 w-3.5 text-slate-400"/>
                                    <span>{activity.type === 'work' ? '查看完整输出' : '查看执行过程'}</span>
                                </button>
                            )}
                        </div>

                        {activity.status && (
                            <span className="hidden font-mono text-[11px] text-slate-400 sm:inline-block">
                                #{activity.status}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
