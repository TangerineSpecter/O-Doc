import React from 'react';
import ReactMarkdown from 'react-markdown';
import {Hash, Inbox, Pin, Shuffle, X} from 'lucide-react';
import type {MemoItem} from '../../types/api/memo';

interface RandomWalkModalProps {
    memo: MemoItem;
    phase: 'entering' | 'visible' | 'leaving';
    markdownComponents: Record<string, any>;
    remarkPlugins: any[];
    onClose: () => void;
    onPickNext: () => void;
    formatDate: (date: string) => string;
    renderTagLabel: (tagPath: string) => React.ReactNode;
}

export default function RandomWalkModal({
    memo,
    phase,
    markdownComponents,
    remarkPlugins,
    onClose,
    onPickNext,
    formatDate,
    renderTagLabel,
}: RandomWalkModalProps) {
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pb-24 animate-in fade-in duration-200">
            <style>{`
                @keyframes memo-random-ripple {
                    0% {
                        box-shadow:
                            0 0 0 0 rgba(255, 255, 255, 0.14),
                            0 0 0 20px rgba(255, 255, 255, 0.12),
                            0 0 0 40px rgba(255, 255, 255, 0.09),
                            0 0 0 60px rgba(255, 255, 255, 0.06);
                    }
                    100% {
                        box-shadow:
                            0 0 0 20px rgba(255, 255, 255, 0.12),
                            0 0 0 40px rgba(255, 255, 255, 0.09),
                            0 0 0 60px rgba(255, 255, 255, 0.06),
                            0 0 0 80px rgba(255, 255, 255, 0);
                    }
                }
            `}</style>
            <div
                className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
                onClick={onClose}
            />
            <section
                className={`relative flex max-h-[min(680px,calc(100vh-8rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-2xl shadow-slate-950/20 transition-all duration-300 ease-out ${
                    phase === 'leaving'
                        ? 'translate-y-5 scale-95 rotate-1 opacity-0'
                        : phase === 'entering'
                            ? 'translate-y-8 scale-95 -rotate-1 opacity-0'
                            : 'translate-y-0 scale-100 rotate-0 opacity-100'
                }`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-orange-50"/>
                <div className="relative border-b border-slate-100 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-100">
                                <Shuffle className="h-3.5 w-3.5"/>
                                随机漫步
                            </div>
                            <p className="text-xs text-slate-400">{formatDate(memo.createdAt)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
                            title="关闭"
                        >
                            <X className="h-4 w-4"/>
                        </button>
                    </div>
                </div>

                <div className="relative flex min-h-0 flex-col">
                    <div className="memo-markdown min-h-0 overflow-y-auto px-5 py-5 pr-6 text-base leading-8 text-slate-800 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
                        <ReactMarkdown
                            remarkPlugins={remarkPlugins}
                            components={markdownComponents as any}
                        >
                            {memo.content}
                        </ReactMarkdown>
                    </div>

                    <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-4 text-xs">
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
                        {memo.isPinned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-600 ring-1 ring-orange-100">
                                <Pin className="h-3 w-3"/>
                                置顶
                            </span>
                        )}
                    </footer>
                </div>
            </section>

            <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
                <button
                    type="button"
                    onClick={onPickNext}
                    disabled={phase === 'leaving'}
                    className="group relative inline-flex min-w-[200px] items-center justify-between overflow-hidden rounded border-0 bg-orange-500 px-5 py-4 text-xs font-semibold uppercase tracking-[1.2px] text-white shadow-[0_4px_12px_rgba(249,115,22,0.28)] outline-none transition hover:bg-orange-600 hover:opacity-95 active:translate-y-0.5 disabled:cursor-not-allowed disabled:bg-orange-500 disabled:opacity-80 disabled:shadow-[0_4px_12px_rgba(249,115,22,0.2)]"
                >
                    <Shuffle className="h-4 w-4 transition-transform duration-300 group-active:rotate-180"/>
                    <span className="mx-4">继续漫步</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-white/80 [animation:memo-random-ripple_0.6s_linear_infinite]"/>
                </button>
            </div>
        </div>
    );
}
