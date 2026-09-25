import React from 'react';
import { BarChart2, Clock, FileText, Hash, Pin, Shuffle } from 'lucide-react';

interface MemoTagFilter {
  name: string;
  count: number;
  depth: number;
}

interface MemosSidebarProps {
  visibleMemoCount: number;
  pinnedMemoCount: number;
  tagCount: number;
  latestMemoTime: string;
  totalCharacters: number;
  selectedTag: string;
  normalizedKeyword: string;
  tagFilters: MemoTagFilter[];
  onPickRandomMemo: () => void;
  onSelectedTagChange: (tag: string) => void;
  renderTagLabel: (tagPath: string) => React.ReactNode;
}

export default function MemosSidebar({
  visibleMemoCount,
  pinnedMemoCount,
  tagCount,
  latestMemoTime,
  totalCharacters,
  selectedTag,
  normalizedKeyword,
  tagFilters,
  onPickRandomMemo,
  onSelectedTagChange,
  renderTagLabel,
}: MemosSidebarProps) {
  return (
    <aside className="lg:sticky lg:top-24 space-y-4">
      {/* 统计看板卡片：精心设计的核心指标与密度概览 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-100">
              <BarChart2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-none">统计看板</h2>
              <p className="mt-1 text-[11px] text-slate-400 leading-none">闪念流转与聚焦状态</p>
            </div>
          </div>
          {(selectedTag || normalizedKeyword) && (
            <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600 border border-orange-100">
              已过滤
            </span>
          )}
        </div>

        {/* 2x2 指标宫格 */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* 当前视图 */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 transition hover:bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">当前视图</span>
              <FileText className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">{visibleMemoCount}</p>
          </div>

          {/* 置顶焦点 */}
          <div className="rounded-lg border border-orange-100/80 bg-orange-50/50 p-2.5 transition hover:bg-orange-50/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-orange-600">置顶焦点</span>
              <Pin className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-orange-600">{pinnedMemoCount}</p>
          </div>

          {/* 涉及标签 */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 transition hover:bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">涉及标签</span>
              <Hash className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">{tagCount}</p>
          </div>

          {/* 最近收集 */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 transition hover:bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">最近收集</span>
              <Clock className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-1.5 truncate text-xs font-bold text-slate-800" title={latestMemoTime}>
              {latestMemoTime || '暂无'}
            </p>
          </div>
        </div>

        {/* 信息密度与聚焦提示 */}
        <div className="mt-3.5 border-t border-slate-100 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-slate-500">碎片字数</span>
            <span className="font-semibold text-slate-700">{totalCharacters} 字</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(6, totalCharacters / 20))}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {selectedTag
              ? `正在查看「${selectedTag}」标签下的记录。`
              : normalizedKeyword
                ? `正在聚焦「${normalizedKeyword}」相关记录。`
                : '置顶内容固定在顶部，其他闪念按时间流收录。'}
          </p>
        </div>
      </div>

      {/* 桌面端专属卡片：随机漫步（移动端已提升至顶层工具栏） */}
      <div className="hidden lg:block overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
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

      {/* 桌面端专属卡片：标签筛选列表（移动端改为顶层横向滑动条） */}
      <div className="hidden lg:block rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">标签筛选</h2>
          {selectedTag && (
            <button
              type="button"
              onClick={() => onSelectedTagChange('')}
              className="text-xs font-medium text-slate-400 transition hover:text-orange-600"
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
                    ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
                    : 'text-slate-600 hover:bg-orange-50/70 hover:text-orange-700'
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
