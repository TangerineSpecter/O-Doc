import { CheckCircle2, Edit2, FolderTree } from 'lucide-react';
import type { WorldCategory } from '../../types/api/agentWorld';

interface WorldCategoryTabProps {
    categories: WorldCategory[];
    onEdit: (category: WorldCategory) => void;
}

export function WorldCategoryTab({ categories, onEdit }: WorldCategoryTabProps) {
    return (
        <div className="space-y-4">
            {/* 紧凑分类列表 */}
            {categories.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-2.5">
                        <FolderTree className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">暂无世界分类</p>
                    <p className="text-xs text-slate-400 mt-1">点击右上角“新增分类”创建第一个分类</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="divide-y divide-slate-100">
                        {categories.map(c => (
                            <div
                                key={c.id}
                                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/70 transition-colors"
                            >
                                <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-sm text-slate-800 truncate block">
                                        {c.name}
                                    </span>
                                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                                        {c.description || '暂无说明'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    {c.enabled ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            <CheckCircle2 className="w-3 h-3" />
                                            已启用
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                            已停用
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onEdit(c)}
                                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-orange-600 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg transition-all"
                                        title="编辑分类"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                        <span>编辑</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
