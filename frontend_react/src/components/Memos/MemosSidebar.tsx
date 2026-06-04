import React from 'react';
import { Hash, List, Network, Plus, Shuffle } from 'lucide-react';

interface MemoTagFilter {
  name: string;
  count: number;
  depth: number;
}

interface MemosSidebarProps {
  viewMode: 'feed' | 'graph';
  content: string;
  tag: string;
  saving: boolean;
  visibleMemoCount: number;
  totalCharacters: number;
  selectedTag: string;
  normalizedKeyword: string;
  tagFilters: MemoTagFilter[];
  onViewModeChange: (mode: 'feed' | 'graph') => void;
  onContentChange: (content: string) => void;
  onTagChange: (tag: string) => void;
  onCreate: (event?: React.FormEvent) => void;
  onPickRandomMemo: () => void;
  onSelectedTagChange: (tag: string) => void;
  renderTagLabel: (tagPath: string) => React.ReactNode;
}

export default function MemosSidebar({
  viewMode,
  content,
  tag,
  saving,
  visibleMemoCount,
  totalCharacters,
  selectedTag,
  normalizedKeyword,
  tagFilters,
  onViewModeChange,
  onContentChange,
  onTagChange,
  onCreate,
  onPickRandomMemo,
  onSelectedTagChange,
  renderTagLabel,
}: MemosSidebarProps) {
  return (
    <aside className="lg:sticky lg:top-24">
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => onViewModeChange('feed')}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
              viewMode === 'feed'
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <List className="h-4 w-4" />
            信息流
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('graph')}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
              viewMode === 'graph'
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Network className="h-4 w-4" />
            知识图谱
          </button>
        </div>
      </div>

      <form onSubmit={onCreate} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">快速收集</h2>
            <p className="mt-0.5 text-xs text-slate-500">先记下来，之后再整理成文章或任务。</p>
          </div>
          <span className="rounded-md bg-orange-50 p-2 text-orange-600">
            <Plus className="h-4 w-4" />
          </span>
        </div>

        <textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="记下一句闪过脑子的东西..."
          className="min-h-36 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
          autoFocus
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={tag}
              onChange={(event) => onTagChange(event.target.value)}
              placeholder="添加标签"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15"
            />
          </div>
          <button
            type="submit"
            disabled={!content.trim() || saving}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            <Plus className="h-4 w-4" />
            记录
          </button>
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={onPickRandomMemo}
          disabled={visibleMemoCount === 0}
          className="group flex w-full items-center gap-3 p-4 text-left transition hover:bg-orange-50/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-500/25 transition group-hover:rotate-3 group-hover:scale-105">
            <Shuffle className="h-5 w-5 transition-transform duration-300 group-active:rotate-180" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">随机漫步</span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              从当前范围抽一条闪念，单独摊开看看。
            </span>
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-400 ring-1 ring-slate-100">
            {visibleMemoCount}
          </span>
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">信息密度</h2>
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>碎片字数</span>
              <span>{totalCharacters}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-orange-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(8, totalCharacters / 20))}%` }}
              />
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            {selectedTag
              ? `正在查看「${selectedTag}」下的记录。`
              : normalizedKeyword ? `正在聚焦「${normalizedKeyword}」相关记录。` : '置顶内容会优先固定在上方，其他闪念按时间收进下方流。'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">标签筛选</h2>
          {selectedTag && (
            <button
              type="button"
              onClick={() => onSelectedTagChange('')}
              className="text-xs font-medium text-slate-400 transition hover:text-violet-600"
            >
              清除
            </button>
          )}
        </div>
        {tagFilters.length === 0 ? (
          <p className="text-xs text-slate-400">还没有可筛选的标签。</p>
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
            {tagFilters.map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => onSelectedTagChange(selectedTag === item.name ? '' : item.name)}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                  selectedTag === item.name
                    ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'
                    : 'text-slate-600 hover:bg-violet-50/70 hover:text-violet-700'
                }`}
                style={{ paddingLeft: `${10 + item.depth * 12}px` }}
              >
                <span className="min-w-0 truncate">{renderTagLabel(item.name)}</span>
                <span className="shrink-0 text-slate-400">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
