import {CatalogEnabledToggle} from './CatalogEnabledToggle';
import {
    BookOpen,
    Camera,
    Compass,
    Cpu,
    Edit2,
    FolderTree,
    GraduationCap,
    Heart,
    HeartPulse,
    TrendingUp,
    Utensils,
    Plus,
} from 'lucide-react';
import type { WorldCategory } from '../../types/api/agentWorld';

interface WorldCategoryTabProps {
    categories: WorldCategory[];
    onAdd: () => void;
    onEdit: (category: WorldCategory) => void;
    onToggle: (item: WorldCategory) => void;
    busyIds: string[];
}

function getCategoryVisual(name: string) {
    if (/财经|金融|商业|财富|投资/i.test(name)) {
        return {
            bg: 'bg-amber-50',
            text: 'text-amber-600',
            border: 'border-amber-200/80',
            Icon: TrendingUp,
        };
    }
    if (/科技|技术|代码|AI|计算|数码/i.test(name)) {
        return {
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            border: 'border-blue-200/80',
            Icon: Cpu,
        };
    }
    if (/旅行|旅游|户外|地理|探险/i.test(name)) {
        return {
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            border: 'border-emerald-200/80',
            Icon: Compass,
        };
    }
    if (/美食|料理|烹饪|餐饮|吃/i.test(name)) {
        return {
            bg: 'bg-orange-50',
            text: 'text-orange-600',
            border: 'border-orange-200/80',
            Icon: Utensils,
        };
    }
    if (/健康|医疗|医学|养生|保健|医药|医/i.test(name)) {
        return {
            bg: 'bg-teal-50',
            text: 'text-teal-600',
            border: 'border-teal-200/80',
            Icon: HeartPulse,
        };
    }
    if (/情感|恋爱|心理|社交|生活/i.test(name)) {
        return {
            bg: 'bg-pink-50',
            text: 'text-pink-600',
            border: 'border-pink-200/80',
            Icon: Heart,
        };
    }
    if (/阅读|文学|书|写作|小说|笔/i.test(name)) {
        return {
            bg: 'bg-purple-50',
            text: 'text-purple-600',
            border: 'border-purple-200/80',
            Icon: BookOpen,
        };
    }
    if (/摄影|图片|视觉|胶片|画/i.test(name)) {
        return {
            bg: 'bg-rose-50',
            text: 'text-rose-600',
            border: 'border-rose-200/80',
            Icon: Camera,
        };
    }
    if (/研究|学术|科学|哲学|分析/i.test(name)) {
        return {
            bg: 'bg-indigo-50',
            text: 'text-indigo-600',
            border: 'border-indigo-200/80',
            Icon: GraduationCap,
        };
    }
    return {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200/80',
        Icon: FolderTree,
    };
}

export function WorldCategoryTab({ categories, onAdd, onEdit, onToggle, busyIds }: WorldCategoryTabProps) {
    if (categories.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-2.5">
                    <FolderTree className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-slate-700">暂无世界分类</p>
                <p className="text-xs text-slate-400 mt-1">创建第一个世界分类以开启帖子分类管理与加成</p>
                <button
                    type="button"
                    onClick={onAdd}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增分类</span>
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3 min-w-0 w-full">
            {/* 列表顶部工具条：统计数量与新增操作 */}
            <div className="flex items-center justify-between gap-3 px-0.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">全部分类</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-600">
                        {categories.length}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onAdd}
                    className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 whitespace-nowrap shrink-0"
                >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>新增分类</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0 w-full">
            {categories.map(c => {
                const visual = getCategoryVisual(c.name);
                const IconComponent = visual.Icon;

                return (
                    <div
                        key={c.id}
                        onClick={() => onEdit(c)}
                        className="group bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs hover:border-orange-300 hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer"
                    >
                        {/* 左侧图标 + 中间文字与排序权重 */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                                className={`w-10 h-10 rounded-lg ${visual.bg} ${visual.text} border ${visual.border} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                            >
                                <IconComponent className="w-5 h-5" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="font-bold text-sm text-slate-800 truncate group-hover:text-orange-600 transition-colors"
                                        title={c.name}
                                    >
                                        {c.name}
                                    </span>
                                </div>

                                <p
                                    className="text-[11px] text-slate-400 truncate mt-0.5 max-w-sm"
                                    title={c.description || '暂无说明'}
                                >
                                    {c.description || '暂无说明'}
                                </p>
                            </div>
                        </div>

                        {/* 右侧状态与编辑操作 */}
                        <div className="flex items-center gap-2 shrink-0">
                            <CatalogEnabledToggle name={c.name} enabled={c.enabled} busy={busyIds.includes(c.id)} onToggle={() => onToggle(c)} />

                            <button
                                type="button"
                                onClick={e => {
                                    e.stopPropagation();
                                    onEdit(c);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-orange-600 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg transition-all font-medium whitespace-nowrap shrink-0"
                                title="编辑分类"
                            >
                                <Edit2 className="w-3 h-3" />
                                <span>编辑</span>
                            </button>
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}
