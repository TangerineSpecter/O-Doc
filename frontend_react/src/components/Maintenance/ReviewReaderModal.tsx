import {useEffect, useRef, useState} from 'react';
import {Bot, FileText, Loader2, MessageSquareQuote, Quote, RotateCcw, StickyNote, UserRound, X} from 'lucide-react';
import {getArticleDetail} from '../../api/article';
import {getMemoDetail} from '../../api/memo';
import type {Article as ArticleDetail} from '../../types/api/article';
import type {MemoItem} from '../../types/api/memo';
import type {DailyReviewItem} from '../../types/api/maintenance';
import ArticleReader from '../Article/ArticleReader';


interface ReviewReaderModalProps {
    item: DailyReviewItem;
    onClose: () => void;
}

const sourceMeta = {
    article: {label: '文章回顾', icon: FileText, color: 'bg-sky-50 text-sky-700'},
    memo: {label: '闪念回顾', icon: StickyNote, color: 'bg-rose-50 text-rose-700'},
    comment: {label: '评论回顾', icon: MessageSquareQuote, color: 'bg-violet-50 text-violet-700'},
};

const hasOpenArticleLayer = () => Boolean(document.querySelector(
    '[aria-label="关闭思维导图"], [aria-label="关闭文章评论"], [aria-label="关闭评论"], textarea[placeholder="写下评论..."]',
));

const formatDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {year: 'numeric', month: 'long', day: 'numeric'}).format(date);
};

export default function ReviewReaderModal({item, onClose}: ReviewReaderModalProps) {
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [article, setArticle] = useState<ArticleDetail | null>(null);
    const [memo, setMemo] = useState<MemoItem | null>(null);
    const [loading, setLoading] = useState(item.sourceType !== 'comment');
    const [error, setError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const isArticle = item.sourceType === 'article';

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

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

        const request = item.sourceType === 'article'
            ? getArticleDetail(item.sourceId).then(data => { if (active) setArticle(data); })
            : getMemoDetail(item.sourceId).then(data => { if (active) setMemo(data); });

        request
            .catch(() => { if (active) setError('内容暂时无法加载，请稍后重试。'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [item, reloadKey]);

    const meta = sourceMeta[item.sourceType];
    const SourceIcon = meta.icon;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label={`${meta.label}：${item.title}`}
            onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <section className={`relative flex w-full flex-col overflow-hidden border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,.34)] ${isArticle ? 'h-[min(92vh,960px)] max-w-7xl rounded-[1.5rem]' : 'max-h-[86vh] max-w-2xl rounded-[1.4rem]'}`}>
                <header className="relative z-20 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.color}`}><SourceIcon className="h-4.5 w-4.5"/></span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[.2em] text-orange-500">{meta.label}</p>
                            <h2 className="truncate text-sm font-bold text-slate-800 sm:text-base">{item.title}</h2>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-slate-400 sm:inline">按 Esc 关闭</span>
                        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭回顾阅读" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300"><X className="h-4.5 w-4.5"/></button>
                    </div>
                </header>

                <div id="maintenance-review-reader-scroll" className={`min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] ${isArticle ? 'flex-1 bg-slate-50/70' : 'bg-[#fffdf9]'}`}>
                    {loading ? (
                        <div className="flex min-h-72 flex-col items-center justify-center text-orange-500"><Loader2 className="h-7 w-7 animate-spin"/><p className="mt-3 text-sm font-medium text-slate-500">正在展开内容…</p></div>
                    ) : error ? (
                        <div className="flex min-h-72 items-center justify-center p-6"><div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><p className="font-bold text-slate-800">加载失败</p><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p><button type="button" onClick={() => { setError(''); setLoading(true); setReloadKey(value => value + 1); }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"><RotateCcw className="h-4 w-4"/>重试</button></div></div>
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
                        <div className="p-5 sm:p-7">
                            <div className="rounded-[1.5rem] border border-rose-100 bg-[linear-gradient(145deg,#fff7f8,#fff)] p-5 shadow-sm sm:p-7">
                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-600">
                                    {memo.tag && <span className="rounded-full bg-rose-100/70 px-2.5 py-1">#{memo.tag}</span>}
                                    <span className="text-slate-400">{formatDate(memo.updatedAt)}</span>
                                </div>
                                <div className="mt-5 whitespace-pre-wrap break-words text-base font-medium leading-8 text-slate-700">{memo.content}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-5 sm:p-7">
                            <div className="rounded-[1.5rem] border border-violet-100 bg-white p-5 shadow-sm sm:p-7">
                                <p className="text-xs font-bold text-slate-400">来自文章</p>
                                <h3 className="mt-1 text-lg font-black text-slate-900">{item.title}</h3>
                                <div className="relative mt-5 rounded-2xl bg-slate-50 px-5 py-4">
                                    <Quote className="absolute -left-2 -top-2 h-7 w-7 fill-violet-100 text-violet-300"/>
                                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.meta.selectedText || '原划线内容已变化'}</p>
                                </div>
                                <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                                    <div className="flex items-center gap-2 text-xs font-bold text-violet-700">
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
                                            {item.meta.commenterType === 'agent' ? <Bot className="h-4 w-4"/> : <UserRound className="h-4 w-4"/>}
                                        </span>
                                        <span>{item.meta.commenterName || (item.meta.commenterType === 'agent' ? 'Agent' : '用户')}</span>
                                        {item.meta.commenterType === 'agent' && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700">Agent</span>}
                                        <span className="ml-auto font-medium text-slate-400">{formatDate(item.meta.commentedAt)}</span>
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">{item.meta.comment || item.excerpt}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
