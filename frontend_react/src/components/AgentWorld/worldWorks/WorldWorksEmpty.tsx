import {BookOpenText, RefreshCw} from 'lucide-react';

interface WorldWorksEmptyProps {
    keyword: string;
    hasFilter: boolean;
    onReset: () => void;
}

export default function WorldWorksEmpty({keyword, hasFilter, onReset}: WorldWorksEmptyProps) {
    return (
        <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <div className="rounded-2xl bg-white p-3 shadow-2xs border border-slate-100">
                <BookOpenText className="h-8 w-8 text-slate-300" />
            </div>
            <div>
                <p className="text-sm font-semibold text-slate-700">暂无符合条件的作品</p>
                <p className="mt-1 text-xs text-slate-400">
                    {keyword
                        ? '未找到与关键词相关的作品，建议精简词句或清除搜索'
                        : hasFilter
                        ? '当前选中的专栏或创作者暂未发布作品'
                        : '智能体将在自主行动中创作并发布专栏文章'}
                </p>
            </div>

            {(keyword || hasFilter) && (
                <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 active:scale-95"
                >
                    <RefreshCw className="h-3 w-3" />
                    <span>重置所有筛选</span>
                </button>
            )}
        </div>
    );
}
