import {ChevronLeft, ChevronRight, Sparkles, ChefHat} from 'lucide-react';
import type {CookingHistory} from '../../types/api/cooking';

export interface RecipeHistoryViewProps {
    history: CookingHistory | null;
    page: number;
    onPageChange: (newPage: number) => void;
    residentName?: string;
}

export function RecipeHistoryView({
    history,
    page,
    onPageChange,
    residentName,
}: RecipeHistoryViewProps) {
    const list = history?.list || [];
    const total = history?.total || 0;
    const pageSize = history?.pageSize || 20;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="flex h-full flex-col justify-between">
            {/* 列表区域 */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-2.5">
                {!list.length ? (
                    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 p-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100/60 text-orange-500">
                            <ChefHat className="h-7 w-7" />
                        </div>
                        <h4 className="mt-3 text-sm font-bold text-slate-700">暂无制作记录</h4>
                        <p className="mt-1 text-xs text-slate-400 max-w-xs leading-relaxed">
                            {residentName ? `${residentName} ` : ''}尚未开启烹饪炉灶。居民在开启美食制作日常任务后，会根据食材自主开火烹饪。
                        </p>
                    </div>
                ) : (
                    list.map(row => {
                        const leveledUp = row.result.levelAfter > row.result.levelBefore;
                        return (
                            <div
                                key={row.id}
                                className="group rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs transition-all hover:border-orange-200 hover:shadow-xs"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                                            <ChefHat className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h5 className="text-xs font-bold text-slate-800">
                                                {row.snapshot.name}
                                                <span className="ml-1 text-[11px] font-normal text-slate-500">×1 份</span>
                                            </h5>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                                <span className="inline-flex items-center gap-0.5 font-medium text-amber-600">
                                                    <Sparkles className="h-2.5 w-2.5" />
                                                    经验 +{row.result.experienceGained}
                                                </span>
                                                {leveledUp && (
                                                    <span className="rounded-full bg-orange-100 px-1.5 py-0.5 font-bold text-orange-700">
                                                        ★ 升至 Lv.{row.result.levelAfter}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <time className="shrink-0 text-[10px] text-slate-400">
                                        {new Date(row.createdAt).toLocaleString('zh-CN', {
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </time>
                                </div>

                                {row.reason && (
                                    <div className="mt-2.5 rounded-xl bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-600 border border-slate-100/60 leading-relaxed">
                                        <span className="font-medium text-slate-500">制作心得：</span>
                                        {row.reason}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* 分页控制栏 */}
            {total > 0 && (
                <div className="mt-3 flex shrink-0 items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span className="text-[11px] text-slate-400">
                        共 <span className="font-semibold text-slate-600">{total}</span> 条记录
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => onPageChange(page - 1)}
                            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            上一页
                        </button>
                        <span className="text-xs font-medium text-slate-600">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => onPageChange(page + 1)}
                            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                        >
                            下一页
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
