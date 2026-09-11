import {useCallback, useEffect, useState} from 'react';
import {
    Bot, Check, ExternalLink, FileText, Loader2,
    MessageSquareQuote, RotateCcw, SkipForward,
    Sparkles, StickyNote, UserRound, X,
} from 'lucide-react';
import {getArticleDetail} from '../../api/article';
import {getMemoDetail} from '../../api/memo';
import type {Article as ArticleDetail} from '../../types/api/article';
import type {MemoItem} from '../../types/api/memo';
import type {DailyReviewItem, MaintenanceTarget, ReviewStatus} from '../../types/api/maintenance';
import ArticleReader from '../Article/ArticleReader';
import {isImageAvatarValue} from '../../utils/avatar';

interface ReviewReaderModalProps {
    item: DailyReviewItem;
    onClose: () => void;
    onStatusChange?: (item: DailyReviewItem, status: ReviewStatus) => void;
    onNavigate?: (target: MaintenanceTarget) => void;
    readonly?: boolean;
    busy?: boolean;
}

const renderCommenterAvatar = (avatar?: string, name?: string, type?: 'user' | 'agent') => {
    const value = avatar?.trim();
    if (value && isImageAvatarValue(value)) {
        return (
            <img
                src={value}
                alt={name || (type === 'agent' ? 'Agent' : '用户')}
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-purple-200"
            />
        );
    }
    if (value) {
        return (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700 ring-1 ring-purple-200">
                {value}
            </span>
        );
    }
    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 ring-1 ring-purple-200">
            {type === 'agent' ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
        </span>
    );
};

const sourceMeta = {
    article: {
        label: '文章回顾',
        icon: FileText,
        badgeBg: 'bg-sky-50 text-sky-700 ring-sky-200/70',
        accentColor: 'text-sky-600',
    },
    memo: {
        label: '闪念回顾',
        icon: StickyNote,
        badgeBg: 'bg-amber-50 text-amber-700 ring-amber-200/70',
        accentColor: 'text-amber-600',
    },
    comment: {
        label: '评论回顾',
        icon: MessageSquareQuote,
        badgeBg: 'bg-purple-50 text-purple-700 ring-purple-200/70',
        accentColor: 'text-purple-600',
    },
};

const hasOpenArticleLayer = () => Boolean(document.querySelector(
    '[aria-label="关闭思维导图"], [aria-label="关闭文章评论"], [aria-label="关闭评论"], textarea[placeholder="写下评论..."]',
));

const formatDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

export default function ReviewReaderModal({
    item,
    onClose,
    onStatusChange,
    onNavigate,
    readonly,
    busy,
}: ReviewReaderModalProps) {
    const [article, setArticle] = useState<ArticleDetail | null>(null);
    // 闪念初始内容直接使用卡片已有数据，尺寸稳定不抖动
    const [memo, setMemo] = useState<MemoItem | null>(() => {
        if (item.sourceType === 'memo') {
            return {
                memoId: item.sourceId,
                content: item.excerpt || item.title,
                tag: item.meta.tag || '',
                isPinned: false,
                createdAt: item.meta.updatedAt || new Date().toISOString(),
                updatedAt: item.meta.updatedAt || new Date().toISOString(),
            };
        }
        return null;
    });
    const [loading, setLoading] = useState(item.sourceType === 'article');
    const [error, setError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const isArticle = item.sourceType === 'article';
    const isMemo = item.sourceType === 'memo';
    const handled = item.status !== 'pending';

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // 监听 Escape 关闭，不再强行 closeButtonRef.current?.focus()，避免打开弹窗时关闭按钮出现选中框
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !hasOpenArticleLayer()) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        let active = true;
        if (item.sourceType === 'comment') return () => { active = false; };

        if (item.sourceType === 'article') {
            getArticleDetail(item.sourceId)
                .then(data => { if (active) setArticle(data); })
                .catch(() => { if (active) setError('文章内容暂时无法加载，请稍后重试。'); })
                .finally(() => { if (active) setLoading(false); });
        } else if (item.sourceType === 'memo') {
            getMemoDetail(item.sourceId)
                .then(data => { if (active && data) setMemo(data); })
                .catch(() => { /* 静默兼容 */ });
        }
        return () => { active = false; };
    }, [item, reloadKey]);

    const handleActionAndClose = useCallback((status: ReviewStatus) => {
        if (onStatusChange) {
            onStatusChange(item, status);
        }
    }, [item, onStatusChange]);

    const meta = sourceMeta[item.sourceType] || sourceMeta.article;
    const SourceIcon = meta.icon;

    // 判断闪念是否属于简短文本（小于 30 字），用于呈现更具设计感的大字号排版
    const memoContent = memo?.content || item.excerpt || item.title || '';
    const isShortMemo = memoContent.trim().length <= 36 && !memoContent.includes('\n');

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-md sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label={`${meta.label}：${item.title}`}
            onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <section
                className={`relative flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-[0_25px_70px_rgba(15,23,42,0.22)] ${
                    isArticle
                        ? 'h-[min(92vh,960px)] max-w-6xl'
                        : isMemo
                        ? 'max-h-[88vh] max-w-xl'
                        : 'max-h-[88vh] max-w-2xl'
                }`}
            >
                {/* 头部 Header */}
                <header className="relative z-20 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur-md">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.badgeBg}`}>
                            <SourceIcon className="h-4.5 w-4.5" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-500">
                                    {meta.label}
                                </span>
                                {handled && (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                                        {item.status === 'completed' ? '已完成回顾' : '已跳过'}
                                    </span>
                                )}
                            </div>
                            <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                                {item.title}
                            </h2>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {onNavigate && item.target && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onNavigate(item.target);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 focus:outline-none"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">查看原文</span>
                            </button>
                        )}
                        {/* 关闭按钮：去除默认选中焦点环，仅在键盘导航时 focus-visible */}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="关闭回顾阅读"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </header>

                {/* 主体阅读内容区 */}
                <div
                    id="maintenance-review-reader-scroll"
                    className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] ${
                        isArticle ? 'bg-slate-50/70' : 'bg-slate-50/30 p-5 sm:p-7'
                    }`}
                >
                    {loading ? (
                        <div className="flex min-h-72 flex-col items-center justify-center text-orange-500">
                            <Loader2 className="h-7 w-7 animate-spin" />
                            <p className="mt-3 text-sm font-medium text-slate-500">正在展开内容…</p>
                        </div>
                    ) : error ? (
                        <div className="flex min-h-72 items-center justify-center p-6">
                            <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                                <p className="font-bold text-slate-800">加载失败</p>
                                <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setError('');
                                        setLoading(true);
                                        setReloadKey(value => value + 1);
                                    }}
                                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 focus:outline-none"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    重试
                                </button>
                            </div>
                        </div>
                    ) : article ? (
                        <ArticleReader
                            isEmbedded
                            scrollContainerId="maintenance-review-reader-scroll"
                            articleId={article.articleId}
                            content={article.content}
                            title={article.title}
                            category={article.categoryDetail?.name || '未分类'}
                            categoryId={article.categoryDetail?.categoryId}
                            themeId={article.categoryDetail?.themeId}
                            tags={article.tagDetails?.map(tag => tag.name) || []}
                            date={article.updatedAt}
                            author={article.author}
                            authorName={article.authorName}
                            attachments={article.attachments}
                            updatedAt={article.updatedAt}
                            lastRagSyncedAt={article.lastRagSyncedAt}
                            isRagSynced={article.isRagSynced}
                            mindMap={article.mindMap}
                            canManage
                            disableLinks
                            tocLayout="inline"
                            showCompactActions
                        />
                    ) : memo ? (
                        /* 闪念：高质感灵感微卡片（告别生硬黄边框，自然优雅） */
                        <div className="mx-auto w-full">
                            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
                                {/* 顶部灵感微标签与时间 */}
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-600">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        <span>闪念记录</span>
                                    </div>
                                    <span className="font-medium text-slate-400">
                                        {formatDate(memo.updatedAt)}
                                    </span>
                                </div>

                                {/* 闪念正文：根据字数自适应大字号金句排版或阅读排版 */}
                                <div className="py-6">
                                    {isShortMemo ? (
                                        <p className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                                            {memoContent}
                                        </p>
                                    ) : (
                                        <div className="whitespace-pre-wrap break-words text-[15px] font-normal leading-relaxed text-slate-700 sm:text-base">
                                            {memoContent}
                                        </div>
                                    )}
                                </div>

                                {/* 标签 */}
                                {memo.tag && (
                                    <div className="flex items-center gap-2 border-t border-slate-100/80 pt-3">
                                        <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/50">
                                            #{memo.tag}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* 评论：采用图 3 风格垂直圆角药丸条的批注卡片 */
                        <div className="mx-auto w-full space-y-4">
                            {/* 原文引用模块（图 3 风格：垂直独立圆角药丸胶囊条） */}
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                    <span>来自文章《{item.title}》</span>
                                </div>

                                <div className="mt-3 flex items-stretch gap-3 rounded-xl bg-purple-50/30 p-3.5 sm:p-4">
                                    {/* 图 3 风格垂直渐变药丸条 */}
                                    <div className="w-1.5 shrink-0 rounded-full bg-gradient-to-b from-purple-400 to-indigo-500" />
                                    <p className="min-w-0 flex-1 text-sm italic leading-relaxed text-slate-700">
                                        “{item.meta.selectedText || '原划线内容已变化'}”
                                    </p>
                                </div>
                            </div>

                            {/* 批注内容模块 */}
                            <div className="rounded-2xl border border-purple-100/80 bg-white p-5 shadow-sm sm:p-6">
                                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                                    {renderCommenterAvatar(
                                        item.meta.commenterAvatar,
                                        item.meta.commenterName,
                                        item.meta.commenterType,
                                    )}
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-bold text-slate-800">
                                                {item.meta.commenterName || (item.meta.commenterType === 'agent' ? 'AI 助手' : '用户')}
                                            </span>
                                            {item.meta.commenterType === 'agent' && (
                                                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                                                    Agent
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-slate-400">
                                            {formatDate(item.meta.commentedAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-4 whitespace-pre-wrap break-words text-sm font-normal leading-7 text-slate-800 sm:text-base">
                                    {item.meta.comment || item.excerpt}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部固定操作栏 Footer */}
                <footer className="relative z-20 flex flex-col justify-between gap-3 border-t border-slate-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
                        <span className="line-clamp-1">{item.reasonText}</span>
                    </div>

                    {!readonly && onStatusChange && (
                        <div className="flex shrink-0 items-center justify-end gap-2.5">
                            {handled ? (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleActionAndClose('pending')}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 focus:outline-none disabled:opacity-50"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    撤销回顾状态
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleActionAndClose('skipped')}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                                    >
                                        <SkipForward className="h-3.5 w-3.5" />
                                        跳过
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleActionAndClose('completed')}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 active:bg-slate-950 focus:outline-none disabled:opacity-50"
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                        完成回顾
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </footer>
            </section>
        </div>
    );
}
