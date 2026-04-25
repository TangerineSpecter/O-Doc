import React, {useEffect, useState} from 'react';
import {
    Hash,
    Pin,
    PinOff,
    Plus,
    Search,
    Sparkles,
    Trash2
} from 'lucide-react';
import {createMemo, deleteMemo, getMemoList, updateMemo} from '../api/memo';
import type {CreateMemoParams, MemoItem} from '../types/api/memo';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {useToast} from '../components/common/ToastProvider';

export default function MemosPage() {
    const [memos, setMemos] = useState<MemoItem[]>([]);
    const [content, setContent] = useState('');
    const [tag, setTag] = useState('');
    const [keyword, setKeyword] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const {showToast} = useToast();

    const memoMatchesCurrentView = (memo: MemoItem) => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return !normalizedKeyword
            || memo.content.toLowerCase().includes(normalizedKeyword)
            || memo.tag.toLowerCase().includes(normalizedKeyword);
    };

    const fetchMemos = async () => {
        setLoading(true);
        try {
            const data = await getMemoList({keyword});
            setMemos(data);
        } catch (error) {
            console.error('Failed to fetch memos', error);
            showToast('闪念加载失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = window.setTimeout(() => {
            fetchMemos();
        }, 180);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    const handleCreate = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const nextContent = content.trim();
        if (!nextContent || saving) return;

        const payload: CreateMemoParams = {
            content: nextContent,
            tag: tag.trim(),
        };

        setSaving(true);
        try {
            const memo = await createMemo(payload);
            if (memoMatchesCurrentView(memo)) {
                setMemos(prev => [memo, ...prev]);
            }
            setContent('');
            setTag('');
            showToast('闪念已收好', 'success');
        } catch (error) {
            console.error('Failed to create memo', error);
            showToast('闪念保存失败', 'error');
        } finally {
            setSaving(false);
        }
    };

    const patchMemo = async (memoId: string, payload: Partial<CreateMemoParams>) => {
        const previous = memos;
        setMemos(prev => prev.map(item => item.memoId === memoId ? {...item, ...payload} : item));
        try {
            const updated = await updateMemo(memoId, payload);
            setMemos(prev => (
                memoMatchesCurrentView(updated)
                    ? prev.map(item => item.memoId === memoId ? updated : item)
                    : prev.filter(item => item.memoId !== memoId)
            ));
        } catch (error) {
            console.error('Failed to update memo', error);
            setMemos(previous);
            showToast('更新失败', 'error');
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteMemo(deleteId);
            setMemos(prev => prev.filter(item => item.memoId !== deleteId));
            setDeleteId(null);
            showToast('闪念已删除', 'success');
        } catch (error) {
            console.error('Failed to delete memo', error);
            showToast('删除失败', 'error');
        }
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
            <ConfirmationModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={confirmDelete}
                title="删除闪念"
                description="确定要删除这条记录吗？删除后无法恢复。"
                confirmText="确认删除"
                type="danger"
            />

            <div className="mx-auto max-w-6xl">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 shadow-sm shadow-amber-900/5">
                            <Sparkles className="h-5 w-5"/>
                        </span>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Memos</h1>
                            <p className="mt-1 text-sm text-slate-500">把突然冒出来的信息先放下，之后再慢慢整理。</p>
                        </div>
                    </div>

                    <div className="relative w-full lg:w-80">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                        <input
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value)}
                            placeholder="搜索内容或标签"
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        />
                    </div>
                </div>

                <form onSubmit={handleCreate} className="mb-6 border-y border-slate-200 bg-white/85 px-4 py-4 shadow-sm backdrop-blur sm:rounded-lg sm:border">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row">
                        <div className="relative sm:w-56">
                            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                            <input
                                value={tag}
                                onChange={(event) => setTag(event.target.value)}
                                placeholder="添加标签"
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!content.trim() || saving}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white shadow-sm shadow-amber-500/20 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 sm:order-first"
                        >
                            <Plus className="h-4 w-4"/>
                            记录
                        </button>
                    </div>

                    <textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder="记下一句闪过脑子的东西..."
                        className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"
                        autoFocus
                    />
                </form>

                {loading ? (
                    <div className="py-16 text-center text-sm text-slate-400">正在整理闪念...</div>
                ) : memos.length === 0 ? (
                    <div className="flex min-h-80 flex-col items-center justify-center border-y border-slate-200 bg-white/70 text-center sm:rounded-lg sm:border">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600">
                            <Sparkles className="h-7 w-7"/>
                        </div>
                        <p className="font-semibold text-slate-800">这里还没有碎片</p>
                        <p className="mt-1 text-sm text-slate-400">写下第一条，它会自然落到墙上。</p>
                    </div>
                ) : (
                    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
                        {memos.map(memo => (
                            <article
                                key={memo.memoId}
                                className="group mb-4 inline-block w-full break-inside-avoid rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md"
                            >
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    {memo.tag ? (
                                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                            <Hash className="h-3 w-3 shrink-0"/>
                                            <span className="truncate">{memo.tag}</span>
                                        </span>
                                    ) : (
                                        <span/>
                                    )}
                                    {memo.isPinned && <Pin className="h-4 w-4 shrink-0 text-amber-600"/>}
                                </div>

                                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{memo.content}</p>

                                <footer className="mt-5 flex items-end justify-between gap-3">
                                    <p className="text-xs text-slate-400">{formatDate(memo.createdAt)}</p>
                                    <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                                        <button
                                            type="button"
                                            onClick={() => patchMemo(memo.memoId, {isPinned: !memo.isPinned})}
                                            title={memo.isPinned ? '取消置顶' : '置顶'}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition hover:text-amber-700"
                                        >
                                            {memo.isPinned ? <PinOff className="h-4 w-4"/> : <Pin className="h-4 w-4"/>}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteId(memo.memoId)}
                                            title="删除"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition hover:text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4"/>
                                        </button>
                                    </div>
                                </footer>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
