import {Bot, Check, Clock3, FileText, MessageSquareQuote, RotateCcw, SkipForward, StickyNote, UserRound} from 'lucide-react';
import type {DailyReviewItem, ReviewStatus} from '../../types/api/maintenance';
import {isImageAvatarValue} from '../../utils/avatar';

interface ReviewCardProps {
    item: DailyReviewItem;
    readonly?: boolean;
    busy?: boolean;
    onOpen: (item: DailyReviewItem) => void;
    onStatusChange?: (item: DailyReviewItem, status: ReviewStatus) => void;
}

const renderCommenterAvatar = (avatar?: string, name?: string, type?: 'user' | 'agent') => {
    const value = avatar?.trim();
    if (value && isImageAvatarValue(value)) {
        return (
            <img
                src={value}
                alt={name || 'Avatar'}
                className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-purple-200"
            />
        );
    }
    if (value) {
        return (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] leading-none text-purple-700">
                {value}
            </span>
        );
    }
    return type === 'agent' ? (
        <Bot className="h-3.5 w-3.5 shrink-0 text-purple-600" />
    ) : (
        <UserRound className="h-3.5 w-3.5 shrink-0 text-purple-600" />
    );
};

const sourceStyle = {
    article: {
        label: '文章',
        icon: FileText,
        badge: 'bg-sky-50 text-sky-700 ring-sky-200/70',
        hoverBorder: 'hover:border-sky-300',
    },
    memo: {
        label: '闪念',
        icon: StickyNote,
        badge: 'bg-amber-50 text-amber-700 ring-amber-200/70',
        hoverBorder: 'hover:border-amber-300',
    },
    comment: {
        label: '评论',
        icon: MessageSquareQuote,
        badge: 'bg-purple-50 text-purple-700 ring-purple-200/70',
        hoverBorder: 'hover:border-purple-300',
    },
};

export default function ReviewCard({item, readonly, busy, onOpen, onStatusChange}: ReviewCardProps) {
    const source = sourceStyle[item.sourceType] || sourceStyle.article;
    const SourceIcon = source.icon;
    const handled = item.status !== 'pending';
    const isMemo = item.sourceType === 'memo';
    const isComment = item.sourceType === 'comment';

    return (
        <article
            className={`group relative flex h-[350px] w-full flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${source.hoverBorder} ${
                handled ? '!border-emerald-200/70 !bg-emerald-50/15' : 'border-slate-200/80'
            }`}
        >
            {/* 顶部标签与状态 */}
            <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${source.badge}`}>
                    <SourceIcon className="h-3.5 w-3.5" />
                    {source.label}
                </span>

                {handled ? (
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70'
                                : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                        <Check className="h-3 w-3" />
                        {item.status === 'completed' ? '已完成' : '已跳过'}
                    </span>
                ) : (
                    <span className="text-[11px] font-medium text-slate-400">待回顾</span>
                )}
            </div>

            {/* 中间主体内容区域（点击展开模态框） */}
            <button
                type="button"
                onClick={() => onOpen(item)}
                aria-label={`阅读 ${source.label}：${item.title}`}
                className="group/btn relative my-3 flex flex-1 flex-col text-left focus:outline-none"
            >
                {isMemo ? (
                    /* 闪念：更加清爽自然的灵感笔记排版 */
                    <div className="flex flex-1 flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors group-hover/btn:border-amber-200 group-hover/btn:bg-amber-50/20">
                        <div className="flex-1 overflow-hidden">
                            <p className="line-clamp-5 whitespace-pre-wrap text-[13.5px] font-medium leading-6 text-slate-700 group-hover/btn:text-slate-900">
                                {item.excerpt || item.title}
                            </p>
                        </div>
                        {item.meta.tag && (
                            <div className="mt-2 shrink-0">
                                <span className="inline-flex items-center rounded-md bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                    #{item.meta.tag}
                                </span>
                            </div>
                        )}
                    </div>
                ) : isComment ? (
                    /* 评论：重新设计的引文+批注结构 */
                    <div className="flex flex-1 flex-col justify-between overflow-hidden">
                        <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-400">
                                来自《{item.title}》
                            </p>
                            <div className="mt-1.5 flex items-stretch gap-2 rounded-lg bg-purple-50/40 px-2.5 py-1.5">
                                <div className="w-1 shrink-0 rounded-full bg-gradient-to-b from-purple-400 to-indigo-500" />
                                <p className="min-w-0 flex-1 line-clamp-2 text-xs italic leading-snug text-slate-600">
                                    “{item.meta.selectedText || '原划线内容已变化'}”
                                </p>
                            </div>
                        </div>

                        <div className="mt-2 flex-1 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 transition-colors group-hover/btn:border-purple-200 group-hover/btn:bg-purple-50/20">
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-purple-700">
                                {renderCommenterAvatar(
                                    item.meta.commenterAvatar,
                                    item.meta.commenterName,
                                    item.meta.commenterType,
                                )}
                                <span className="truncate">
                                    {item.meta.commenterName || (item.meta.commenterType === 'agent' ? 'AI 助手' : '用户')}
                                </span>
                            </div>
                            <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                                {item.meta.comment || item.excerpt}
                            </p>
                        </div>
                    </div>
                ) : (
                    /* 文章：清晰标题与摘要 */
                    <div className="flex flex-1 flex-col justify-between overflow-hidden">
                        <div>
                            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-800 transition-colors group-hover/btn:text-orange-600">
                                {item.title}
                            </h3>
                            <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-500">
                                {item.excerpt || '暂无内容摘要，点击展开查看全文'}
                            </p>
                        </div>
                        <div className="mt-2 text-[11px] font-medium text-orange-500 opacity-0 transition-opacity group-hover/btn:opacity-100">
                            点击展开阅读全文 →
                        </div>
                    </div>
                )}
            </button>

            {/* 底部推荐原因与操作按键 */}
            <div className="shrink-0">
                <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                    <span className="truncate" title={item.reasonText}>
                        {item.reasonText}
                    </span>
                </div>

                {!readonly && onStatusChange && (
                    <div className="mt-3 flex items-center gap-2">
                        {handled ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onStatusChange(item, 'pending')}
                                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                撤销回顾
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onStatusChange(item, 'completed')}
                                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 active:bg-slate-950 disabled:opacity-50"
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    完成回顾
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onStatusChange(item, 'skipped')}
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                                >
                                    <SkipForward className="h-3.5 w-3.5" />
                                    跳过
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}
