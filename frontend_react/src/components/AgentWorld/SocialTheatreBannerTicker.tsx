import {ChevronRight, Radio, Sparkles, MessageSquare} from 'lucide-react';
import type {SocialTheatreEvent} from '../../types/api/social';

interface SocialTheatreBannerTickerProps {
    event: SocialTheatreEvent | null;
    onOpenTheatre: (eventId?: string) => void;
    compact?: boolean;
}

export default function SocialTheatreBannerTicker({
    event,
    onOpenTheatre,
    compact = false,
}: SocialTheatreBannerTickerProps) {
    if (!event) return null;

    const {status, topic, source, participants = [], messageCount = 0} = event;
    const title = topic?.title || source?.title || '新闻话题讨论';
    const names = participants.map(p => p.name).filter(Boolean).join('、');
    const isRunning = status === 'running';
    const isSearching = status === 'searching';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';
    const isScheduled = status === 'scheduled';

    let badgeText = '小剧场';
    let badgeClass = 'bg-orange-50 text-orange-700 border-orange-200';
    let containerClass = 'border-orange-200/80 bg-orange-50/50 hover:bg-orange-50 hover:border-orange-300 text-slate-800';
    let displayText = `【${title}】`;

    if (isRunning) {
        badgeText = compact ? 'LIVE' : 'LIVE 居民热议';
        badgeClass = 'bg-rose-50 text-rose-600 border-rose-200';
        containerClass = 'border-rose-200/90 bg-rose-50/40 hover:bg-rose-50/70 hover:border-rose-300 text-slate-900 shadow-2xs';
        displayText = compact
            ? `【${title}】`
            : `${names ? `${names} 正在热议` : '正在热议'}【${title}】${messageCount > 0 ? ` · ${messageCount}条发言` : ''}`;
    } else if (isSearching) {
        badgeText = compact ? '选题' : '小剧场选题中';
        badgeClass = 'bg-sky-50 text-sky-700 border-sky-200';
        containerClass = 'border-sky-200/80 bg-sky-50/40 hover:bg-sky-50 hover:border-sky-300 text-slate-800';
        displayText = compact ? `【${title}】` : '正在通过新闻搜索筛选今日议题，随后将邀请空闲居民开讲...';
    } else if (isCompleted) {
        badgeText = compact ? '回顾' : '小剧场回顾';
        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        containerClass = 'border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 text-slate-800';
        displayText = compact ? `【${title}】` : `【${title}】· ${names ? `${names} ` : ''}讨论圆满完成`;
    } else if (isFailed) {
        badgeText = compact ? '中断' : '小剧场中断';
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        containerClass = 'border-amber-200/80 bg-amber-50/40 hover:bg-amber-50 hover:border-amber-300 text-slate-800';
        displayText = compact ? `【${title}】` : `【${title}】· 可点击从中断处继续推进讨论`;
    } else if (isScheduled) {
        badgeText = compact ? '排期' : '小剧场排期中';
        badgeClass = 'bg-sky-50 text-sky-700 border-sky-200';
        containerClass = 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-700';
        displayText = compact ? '已安排小剧场' : '今日小剧场已安排，将在生活活跃时间自动开播';
    }

    return (
        <button
            type="button"
            onClick={() => onOpenTheatre(event.id)}
            title="点击打开新闻小剧场"
            className={`group inline-flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.99] cursor-pointer ${containerClass}`}
        >
            {/* 状态徽标 */}
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>
                {isRunning ? (
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                    </span>
                ) : isCompleted ? (
                    <Sparkles className="h-2.5 w-2.5 text-emerald-600" />
                ) : isSearching ? (
                    <Radio className="h-2.5 w-2.5 animate-pulse text-sky-600" />
                ) : (
                    <MessageSquare className="h-2.5 w-2.5" />
                )}
                {badgeText}
            </span>

            {/* 单行文字 */}
            <span className="truncate text-[11px] font-semibold text-slate-800 transition-colors group-hover:text-orange-600">
                {displayText}
            </span>

            {/* 右侧小箭头 */}
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-600" />
        </button>
    );
}
