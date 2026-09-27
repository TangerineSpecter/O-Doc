import { Briefcase, CheckCircle2, Edit2, Sparkles } from 'lucide-react';
import type { WorldCategory, WorldProfession } from '../../types/api/agentWorld';

interface WorldProfessionTabProps {
    professions: WorldProfession[];
    categories: WorldCategory[];
    onEdit: (profession: WorldProfession) => void;
}

export function WorldProfessionTab({
    professions,
    categories,
    onEdit,
}: WorldProfessionTabProps) {
    const getCategoryName = (catId: string) =>
        categories.find(c => c.id === catId)?.name || catId;

    if (professions.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-2.5">
                    <Briefcase className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-slate-700">暂无职业配置</p>
                <p className="text-xs text-slate-400 mt-1">点击右上角“新增职业”为 Agent 设定职业并赋予分类加成</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
                {professions.map(p => (
                    <div
                        key={p.id}
                        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/70 transition-colors"
                    >
                        <div className="min-w-0 flex-1">
                            <span className="font-semibold text-sm text-slate-800 truncate block">
                                {p.name}
                            </span>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                                {p.description || '暂无说明'}
                            </p>
                            {/* 分类收益加成 Tags */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {p.bonuses && p.bonuses.length > 0 ? (
                                    p.bonuses.map((b, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-200/60 px-2 py-0.5 rounded-md"
                                        >
                                            <Sparkles className="w-3 h-3 text-orange-500" />
                                            <span>{getCategoryName(b.category)}</span>
                                            <span className="font-bold font-mono">+{Number(b.percentage)}%</span>
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-[11px] text-slate-400">未绑定分类加成</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                            {p.enabled ? (
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
                                onClick={() => onEdit(p)}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-orange-600 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg transition-all"
                                title="编辑职业"
                            >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>编辑</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
