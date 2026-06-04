import React from 'react';
import ReactMarkdown from 'react-markdown';
import {Bot, CalendarClock, Edit3, Hash, Inbox, MoreHorizontal, Pin, PinOff, Trash2, User} from 'lucide-react';
import type {CreateMemoParams, MemoItem} from '../../types/api/memo';

interface MemoAuthorMeta {
    name: string;
    isAgent: boolean;
}

interface MemoCardProps {
    memo: MemoItem;
    isPinnedSection?: boolean;
    markdownComponents: Record<string, any>;
    remarkPlugins: any[];
    onEdit: (memo: MemoItem) => void;
    onPatch: (memoId: string, payload: Partial<CreateMemoParams>) => void;
    onDelete: (memoId: string) => void;
    formatDate: (date: string) => string;
    renderTagLabel: (tagPath: string) => React.ReactNode;
    getMemoAuthorMeta: (memo: MemoItem) => MemoAuthorMeta;
}

export default function MemoCard({
    memo,
    isPinnedSection = false,
    markdownComponents,
    remarkPlugins,
    onEdit,
    onPatch,
    onDelete,
    formatDate,
    renderTagLabel,
    getMemoAuthorMeta,
}: MemoCardProps) {
    const author = getMemoAuthorMeta(memo);
    const AuthorIcon = author.isAgent ? Bot : User;

    return (
        <article
            key={memo.memoId}
            onDoubleClick={() => onEdit(memo)}
            className={`group relative rounded-xl border bg-white p-4 shadow-sm shadow-slate-900/5 transition-all duration-200 hover:border-orange-200 hover:shadow-md ${
                isPinnedSection ? 'border-orange-200 ring-1 ring-orange-100/80' : 'border-slate-200'
            }`}
        >
            <div className="absolute right-3 top-3 z-20">
                <div className="group/menu relative">
                    <button
                        type="button"
                        title="更多"
                        onDoubleClick={(event) => event.stopPropagation()}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                        <MoreHorizontal className="h-4 w-4"/>
                    </button>
                    <div
                        className="pointer-events-none absolute right-0 top-full hidden w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm opacity-0 shadow-xl shadow-slate-900/10 transition group-hover/menu:pointer-events-auto group-hover/menu:block group-hover/menu:opacity-100"
                        onDoubleClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => onEdit(memo)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-700 transition hover:bg-slate-50 hover:text-orange-600"
                        >
                            <Edit3 className="h-4 w-4"/>
                            编辑
                        </button>
                        <button
                            type="button"
                            onClick={() => onPatch(memo.memoId, {isPinned: !memo.isPinned})}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-700 transition hover:bg-slate-50 hover:text-orange-600"
                        >
                            {memo.isPinned ? <PinOff className="h-4 w-4"/> : <Pin className="h-4 w-4"/>}
                            {memo.isPinned ? '取消置顶' : '置顶'}
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(memo.memoId)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-red-600 transition hover:bg-red-50"
                        >
                            <Trash2 className="h-4 w-4"/>
                            删除
                        </button>
                        <div className="mt-1 border-t border-slate-100 px-4 py-2 text-slate-400">
                            字数: {memo.content.length}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 pr-10 text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <CalendarClock className="h-3.5 w-3.5"/>
                    {formatDate(memo.createdAt)}
                </span>
                {memo.isPinned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-600 ring-1 ring-orange-100">
                        <Pin className="h-3 w-3"/>
                        置顶
                    </span>
                )}
            </div>

            <div className="memo-markdown max-h-80 overflow-y-auto pr-2 text-sm text-slate-800 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
                <ReactMarkdown
                    remarkPlugins={remarkPlugins}
                    components={markdownComponents as any}
                >
                    {memo.content}
                </ReactMarkdown>
            </div>
            <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                {memo.tag ? (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-600 ring-1 ring-violet-100">
                        <Hash className="h-3 w-3 shrink-0"/>
                        <span className="truncate">{renderTagLabel(memo.tag)}</span>
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-400 ring-1 ring-slate-100">
                        <Inbox className="h-3 w-3"/>
                        未归类
                    </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1 ${
                    author.isAgent
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                        : 'bg-blue-50 text-blue-700 ring-blue-100'
                }`}>
                    <AuthorIcon className="h-3.5 w-3.5"/>
                    {author.name}
                </span>
            </footer>
        </article>
    );
}
