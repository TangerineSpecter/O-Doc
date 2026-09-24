import {useCallback, useEffect, useMemo, useState} from 'react';
import {ArchiveRestore, FileText, LoaderCircle, RefreshCw, StickyNote, Trash2} from 'lucide-react';
import {getArticleTrash, getMemoTrash, purgeArticleFromTrash, purgeMemoFromTrash, restoreArticleFromTrash, restoreMemoFromTrash} from '../api/recycle';
import type {RecycleItem} from '../types/api/recycle';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {useToast} from '../components/common/ToastProvider';

type RecycleFilter = 'all' | 'article' | 'memo';
type PendingAction = {type: 'restore' | 'purge'; item: RecycleItem} | null;

const FILTER_OPTIONS: Array<{value: RecycleFilter; label: string}> = [
    {value: 'all', label: '全部'},
    {value: 'article', label: '文章'},
    {value: 'memo', label: '闪念'},
];

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN');
}

export default function RecyclePage() {
    const toast = useToast();
    const [items, setItems] = useState<RecycleItem[]>([]);
    const [filter, setFilter] = useState<RecycleFilter>('all');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const loadTrash = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [articles, memos] = await Promise.all([getArticleTrash(), getMemoTrash()]);
            setItems([...articles, ...memos].sort((left, right) => (
                new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime()
            )));
        } catch (error) {
            const message = error instanceof Error ? error.message : '加载回收站失败';
            setLoadError(message);
            toast.error(message || '加载回收站失败');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void loadTrash();
    }, [loadTrash]);

    const visibleItems = useMemo(() => (
        filter === 'all' ? items : items.filter(item => item.itemType === filter)
    ), [filter, items]);

    const counts = useMemo(() => ({
        all: items.length,
        article: items.filter(item => item.itemType === 'article').length,
        memo: items.filter(item => item.itemType === 'memo').length,
    }), [items]);

    const confirmAction = async () => {
        if (!pendingAction || actionLoading) return;
        setActionLoading(true);
        try {
            const {item, type} = pendingAction;
            if (type === 'restore') {
                if (item.itemType === 'article') await restoreArticleFromTrash(item.id);
                else await restoreMemoFromTrash(item.id);
                toast.success(item.itemType === 'article'
                    ? '文章已恢复；如需 AI 检索，请重新同步 RAG'
                    : '闪念已恢复');
            } else {
                if (item.itemType === 'article') await purgeArticleFromTrash(item.id);
                else await purgeMemoFromTrash(item.id);
                toast.success('已彻底删除，并记录同步墓碑');
            }
            setPendingAction(null);
            await loadTrash();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '操作失败，请稍后重试');
        } finally {
            setActionLoading(false);
        }
    };

    const pendingArticleUnavailable = pendingAction?.type === 'restore'
        && pendingAction.item.itemType === 'article'
        && !pendingAction.item.collectionAvailable;

    return (
        <main className="mx-auto min-h-[calc(100vh-64px)] max-w-5xl px-4 py-6 pb-28 text-slate-800 sm:px-6 sm:py-8 sm:pb-10">
            <ConfirmationModal
                isOpen={Boolean(pendingAction)}
                onClose={() => setPendingAction(null)}
                onConfirm={confirmAction}
                isLoading={actionLoading}
                title={pendingAction?.type === 'restore' ? '恢复内容' : '彻底删除'}
                description={pendingAction?.type === 'restore'
                    ? pendingArticleUnavailable
                        ? '所属文集已删除或不可用，暂时无法恢复。'
                        : '恢复后，内容会回到原来的文集或闪念流。'
                    : '此操作无法撤销，内容会从本机删除，并通过同步墓碑传播到其他设备。'}
                confirmText={pendingAction?.type === 'restore' ? '恢复' : '彻底删除'}
                type={pendingAction?.type === 'restore' ? 'warning' : 'danger'}
            />

            <header className="rounded-2xl border border-orange-100 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-[10px] font-bold tracking-[0.18em] text-orange-600 sm:text-xs">RECYCLE BIN</p>
                        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
                            <Trash2 className="h-6 w-6 text-orange-500" />回收站
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                            这里保存已删除的 Markdown 文章和闪念。回收站是误删后的安全网，不是永久备份；彻底删除会通过同步墓碑传播到其他设备。
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadTrash()}
                        disabled={loading}
                        className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
                    </button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="筛选回收站内容">
                    {FILTER_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={filter === option.value}
                            onClick={() => setFilter(option.value)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === option.value
                                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                : 'border border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-orange-700'
                            }`}
                        >
                            {option.label}<span className="ml-1.5 opacity-75">{counts[option.value]}</span>
                        </button>
                    ))}
                </div>
            </header>

            <section className="mt-4 space-y-3" aria-live="polite">
                {loading && items.length === 0 ? (
                    <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">
                        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />正在加载回收站…
                    </div>
                ) : loadError && items.length === 0 ? (
                    <div className="rounded-2xl border border-red-100 bg-white px-5 py-12 text-center">
                        <p className="text-sm font-semibold text-slate-700">回收站暂时无法加载</p>
                        <p className="mt-1 text-sm text-slate-500">{loadError}</p>
                        <button type="button" onClick={() => void loadTrash()} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">重试</button>
                    </div>
                ) : visibleItems.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-14 text-center">
                        <Trash2 className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-sm font-semibold text-slate-700">
                            {items.length === 0 ? '回收站是空的' : '这个分类里没有内容'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">删除的 Markdown 文章和闪念会出现在这里。</p>
                    </div>
                ) : visibleItems.map(item => {
                    const isArticle = item.itemType === 'article';
                    const unavailable = isArticle && !item.collectionAvailable;
                    const hasChildren = isArticle && item.hasChildren;
                    const Icon = isArticle ? FileText : StickyNote;
                    return (
                        <article key={`${item.itemType}:${item.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isArticle ? 'bg-orange-50 text-orange-700' : 'bg-violet-50 text-violet-700'}`}>
                                            <Icon className="h-3.5 w-3.5" />{isArticle ? '文章' : '闪念'}
                                        </span>
                                        {isArticle && item.anthologyTitle && (
                                            <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">文集：{item.anthologyTitle}</span>
                                        )}
                                        {!isArticle && item.tag && (
                                            <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">#{item.tag}</span>
                                        )}
                                    </div>
                                    <h2 className="mt-3 break-words text-base font-bold text-slate-900">
                                        {isArticle ? item.title : item.preview || '空白闪念'}
                                    </h2>
                                    {isArticle && item.preview && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.preview}</p>}
                                    <p className="mt-3 text-xs text-slate-400">
                                        删除于 {formatDate(item.deletedAt)}
                                        {isArticle && unavailable && <span className="ml-2 font-medium text-amber-700">原文集已删除，暂无法恢复</span>}
                                        {hasChildren && <span className="ml-2 font-medium text-amber-700">请先彻底删除子文章</span>}
                                    </p>
                                </div>

                                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setPendingAction({type: 'restore', item})}
                                        disabled={unavailable}
                                        title={unavailable ? '所属文集已删除或不可用，暂无法恢复' : '恢复到原位置'}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-lime-50 px-3 py-2 text-sm font-semibold text-lime-700 transition hover:bg-lime-100 disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                        <ArchiveRestore className="h-4 w-4" />恢复
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingAction({type: 'purge', item})}
                                        disabled={hasChildren}
                                        title={hasChildren ? '请先彻底删除子文章' : '彻底删除并同步墓碑'}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                        <Trash2 className="h-4 w-4" />彻底删除
                                    </button>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </section>
        </main>
    );
}
