import {Bot, Check, Clock3, FileText, MessageSquareQuote, RotateCcw, SkipForward, StickyNote, UserRound} from 'lucide-react';
import type {DailyReviewItem, ReviewStatus} from '../../types/api/maintenance';


interface ReviewCardProps {
    item: DailyReviewItem;
    readonly?: boolean;
    busy?: boolean;
    onOpen: (item: DailyReviewItem) => void;
    onStatusChange?: (item: DailyReviewItem, status: ReviewStatus) => void;
}

const sourceStyle = {
    article: {label: '文章', icon: FileText, color: 'bg-sky-50 text-sky-700 ring-sky-100'},
    memo: {label: '闪念', icon: StickyNote, color: 'bg-rose-50 text-rose-700 ring-rose-100'},
    comment: {label: '评论', icon: MessageSquareQuote, color: 'bg-violet-50 text-violet-700 ring-violet-100'},
};

export default function ReviewCard({item, readonly, busy, onOpen, onStatusChange}: ReviewCardProps) {
    const source = sourceStyle[item.sourceType];
    const SourceIcon = source.icon;
    const handled = item.status !== 'pending';
    const isMemo = item.sourceType === 'memo';
    const isComment = item.sourceType === 'comment';

    return (
        <article className={`group relative overflow-hidden border shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg ${isMemo ? 'rounded-[1.4rem] border-rose-100 bg-[linear-gradient(145deg,#fff7f8,#fff)] p-4' : 'rounded-2xl border-slate-200 bg-white p-5'} ${handled ? '!border-emerald-100 !bg-emerald-50/30' : ''}`}>
            {!isMemo && <div className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-orange-100/50 blur-2xl transition group-hover:bg-orange-200/60"/>}
            <div className="relative flex items-start justify-between gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${source.color}`}>
                    <SourceIcon className="h-3.5 w-3.5"/>{source.label}
                </span>
                {handled && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <Check className="h-3.5 w-3.5"/>{item.status === 'completed' ? '已完成' : '已跳过'}
                    </span>
                )}
            </div>

            <button type="button" onClick={() => onOpen(item)} aria-label={`阅读 ${source.label}：${item.title}`} className="relative block w-full text-left">
                {isMemo ? (
                    <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-[15px] font-semibold leading-6 text-slate-700 transition-colors group-hover:text-rose-700">{item.excerpt || item.title}</p>
                ) : isComment ? (
                    <div className="mt-4">
                        <p className="truncate text-xs font-bold text-slate-500">来自《{item.title}》</p>
                        <blockquote className="mt-3 border-l-2 border-violet-300 pl-3 text-sm leading-6 text-slate-600">“{item.meta.selectedText || '原划线内容已变化'}”</blockquote>
                        <div className="mt-3 rounded-xl bg-violet-50/80 p-3">
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-violet-600">
                                {item.meta.commenterType === 'agent' ? <Bot className="h-3.5 w-3.5"/> : <UserRound className="h-3.5 w-3.5"/>}
                                {item.meta.commenterName || (item.meta.commenterType === 'agent' ? 'Agent' : '用户')}
                            </div>
                            <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.meta.comment || item.excerpt}</p>
                        </div>
                    </div>
                ) : (
                    <div className="mt-5">
                        <h3 className="line-clamp-2 text-base font-bold leading-6 text-slate-850 transition-colors group-hover:text-orange-700">{item.title}</h3>
                        <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-slate-500">{item.excerpt || '暂无内容摘要'}</p>
                    </div>
                )}
            </button>

            <div className={`relative flex items-start gap-2 border-t text-xs leading-5 text-slate-400 ${isMemo ? 'mt-3 border-rose-100 pt-3' : 'mt-5 border-slate-100 pt-4'}`}>
                <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400"/>
                <span>{item.reasonText}</span>
            </div>

            {!readonly && onStatusChange && (
                <div className={`relative flex gap-2 ${isMemo ? 'mt-3' : 'mt-4'}`}>
                    {handled ? (
                        <button type="button" disabled={busy} onClick={() => onStatusChange(item, 'pending')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50">
                            <RotateCcw className="h-3.5 w-3.5"/>撤销
                        </button>
                    ) : (
                        <>
                            <button type="button" disabled={busy} onClick={() => onStatusChange(item, 'completed')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50">
                                <Check className="h-3.5 w-3.5"/>完成回顾
                            </button>
                            <button type="button" disabled={busy} onClick={() => onStatusChange(item, 'skipped')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50">
                                <SkipForward className="h-3.5 w-3.5"/>跳过
                            </button>
                        </>
                    )}
                </div>
            )}
        </article>
    );
}
