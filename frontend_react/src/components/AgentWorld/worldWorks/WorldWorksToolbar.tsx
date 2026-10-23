import {LayoutGrid, List, RefreshCw, Search, X} from 'lucide-react';
import {Select, type SelectOption} from '../../common/Select';
import type {SortKey, ViewMode} from './types';

interface WorldWorksToolbarProps {
    keyword: string;
    onKeywordChange: (val: string) => void;
    sortBy: SortKey;
    onSortChange: (val: SortKey) => void;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    refreshing: boolean;
    loading: boolean;
    onRefresh: () => void;
    activeFilterTitle: string;
    activeFilterSubtitle?: string;
    hasActiveFilter: boolean;
    onClearFilters: () => void;
    totalResultCount: number;
}

export default function WorldWorksToolbar({
    keyword,
    onKeywordChange,
    sortBy,
    onSortChange,
    viewMode,
    onViewModeChange,
    refreshing,
    loading,
    onRefresh,
    activeFilterTitle,
    activeFilterSubtitle,
    hasActiveFilter,
    onClearFilters,
    totalResultCount,
}: WorldWorksToolbarProps) {
    const sortOptions: SelectOption<SortKey>[] = [
        {value: 'recent', label: '最新发布'},
        {value: 'rating', label: '评分最高'},
        {value: 'comments', label: '互动最多'},
        {value: 'read', label: '阅读量最高'},
    ];

    return (
        <div className="mb-3 shrink-0 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* 左侧：当前筛选分类标题与数量说明 */}
                <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-bold text-slate-800">
                                {activeFilterTitle}
                            </h3>
                            <span className="inline-flex shrink-0 items-center rounded-full bg-orange-100/80 px-2 py-0.5 text-[11px] font-bold text-orange-700">
                                {totalResultCount} 篇
                            </span>
                        </div>
                        {activeFilterSubtitle && (
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                {activeFilterSubtitle}
                            </p>
                        )}
                    </div>

                    {hasActiveFilter && (
                        <button
                            type="button"
                            onClick={onClearFilters}
                            className="inline-flex whitespace-nowrap shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-2xs transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                        >
                            <X className="h-3 w-3 shrink-0" />
                            <span>重置</span>
                        </button>
                    )}
                </div>

                {/* 右侧：搜索框、排序下拉、视图模式切换与刷新 */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* 搜索框 */}
                    <div className="relative w-44 sm:w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={keyword}
                            onChange={e => onKeywordChange(e.target.value)}
                            placeholder="搜索作品、作者..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 transition-colors focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                        {keyword && (
                            <button
                                type="button"
                                onClick={() => onKeywordChange('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    {/* 排序下拉 */}
                    <div className="w-28 shrink-0">
                        <Select
                            value={sortBy}
                            options={sortOptions}
                            onChange={onSortChange}
                            menuPortal={true}
                            buttonClassName="h-8 py-1 px-2.5 text-xs rounded-xl"
                        />
                    </div>

                    {/* 视图切换：网格 vs 列表 */}
                    <div className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-slate-100/70 p-0.5 shadow-2xs">
                        <button
                            type="button"
                            onClick={() => onViewModeChange('grid')}
                            title="网格视图"
                            className={`rounded-lg p-1.5 transition-all ${
                                viewMode === 'grid'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewModeChange('list')}
                            title="列表视图"
                            className={`rounded-lg p-1.5 transition-all ${
                                viewMode === 'list'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <List className="h-3.5 w-3.5 shrink-0" />
                        </button>
                    </div>

                    {/* 刷新按钮 */}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={refreshing || loading}
                        title="刷新作品列表"
                        className="inline-flex h-8 w-8 whitespace-nowrap shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-2xs transition-all duration-150 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
                    </button>
                </div>
            </div>
        </div>
    );
}
