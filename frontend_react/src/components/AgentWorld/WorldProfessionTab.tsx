import {CatalogEnabledToggle} from './CatalogEnabledToggle';
import {
    BookOpen,
    Briefcase,
    Camera,
    Compass,
    Cpu,
    Edit2,
    GraduationCap,
    Heart,
    HeartPulse,
    Sparkles,
    TrendingUp,
    Utensils,
    Sprout,
} from 'lucide-react';
import type { WorldCategory, WorldProfession } from '../../types/api/agentWorld';

interface WorldProfessionTabProps {
    professions: WorldProfession[];
    categories: WorldCategory[];
    onEdit: (profession: WorldProfession) => void;
    onToggle: (item: WorldProfession) => void;
    busyIds: string[];
}

function getProfessionVisual(name: string) {
    if (/农|种植|畜牧/i.test(name)) {
        return {bg: 'bg-lime-50', text: 'text-lime-600', border: 'border-lime-200/80', badge: 'bg-lime-50 text-lime-700 border-lime-200/80', Icon: Sprout};
    }
    if (/财经|金融|商业|财富|投资/i.test(name)) {
        return {
            bg: 'bg-amber-50',
            text: 'text-amber-600',
            border: 'border-amber-200/80',
            badge: 'bg-amber-50 text-amber-700 border-amber-200/80',
            Icon: TrendingUp,
        };
    }
    if (/科技|技术|代码|AI|计算|数码/i.test(name)) {
        return {
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            border: 'border-blue-200/80',
            badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
            Icon: Cpu,
        };
    }
    if (/旅行|旅游|户外|地理|探险/i.test(name)) {
        return {
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            border: 'border-emerald-200/80',
            badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
            Icon: Compass,
        };
    }
    if (/美食|料理|烹饪|餐饮|吃/i.test(name)) {
        return {
            bg: 'bg-orange-50',
            text: 'text-orange-600',
            border: 'border-orange-200/80',
            badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
            Icon: Utensils,
        };
    }
    if (/健康|医疗|医学|养生|保健|医生|医师|医药|医/i.test(name)) {
        return {
            bg: 'bg-teal-50',
            text: 'text-teal-600',
            border: 'border-teal-200/80',
            badge: 'bg-teal-50 text-teal-700 border-teal-200/80',
            Icon: HeartPulse,
        };
    }
    if (/情感|恋爱|心理|社交|生活/i.test(name)) {
        return {
            bg: 'bg-pink-50',
            text: 'text-pink-600',
            border: 'border-pink-200/80',
            badge: 'bg-pink-50 text-pink-700 border-pink-200/80',
            Icon: Heart,
        };
    }
    if (/阅读|文学|书|写作|小说|笔/i.test(name)) {
        return {
            bg: 'bg-purple-50',
            text: 'text-purple-600',
            border: 'border-purple-200/80',
            badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
            Icon: BookOpen,
        };
    }
    if (/摄影|图片|视觉|胶片|画/i.test(name)) {
        return {
            bg: 'bg-rose-50',
            text: 'text-rose-600',
            border: 'border-rose-200/80',
            badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
            Icon: Camera,
        };
    }
    if (/研究|学术|科学|哲学|分析/i.test(name)) {
        return {
            bg: 'bg-indigo-50',
            text: 'text-indigo-600',
            border: 'border-indigo-200/80',
            badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
            Icon: GraduationCap,
        };
    }
    return {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200/80',
        badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
        Icon: Briefcase,
    };
}

export function WorldProfessionTab({
    professions,
    categories,
    onEdit,
    onToggle,
    busyIds,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {professions.map(p => {
                const visual = getProfessionVisual(p.name);
                const IconComponent = visual.Icon;

                return (
                    <div
                        key={p.id}
                        onClick={() => onEdit(p)}
                        className="group bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs hover:border-orange-300 hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer"
                    >
                        {/* 左侧图标 + 中间文字与加成 */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                                className={`w-10 h-10 rounded-lg ${visual.bg} ${visual.text} border ${visual.border} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                            >
                                <IconComponent className="w-5 h-5" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className="font-bold text-sm text-slate-800 truncate group-hover:text-orange-600 transition-colors"
                                        title={p.name}
                                    >
                                        {p.name}
                                    </span>

                                    {p.bonuses && p.bonuses.length > 0 ? (
                                        p.bonuses.map((b, idx) => (
                                            <span
                                                key={idx}
                                                className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${visual.badge}`}
                                            >
                                                <Sparkles className="w-2.5 h-2.5 text-orange-500" />
                                                <span>{getCategoryName(b.category)}帖子收益</span>
                                                <span className="font-mono">+{Number(b.percentage)}%</span>
                                            </span>
                                        ))
                                    ) : null}
                                    {Number(p.farmYieldPercentage) > 0 && <span className="inline-flex items-center gap-1 rounded border border-lime-200 bg-lime-50 px-1.5 py-0.5 text-[10px] font-bold text-lime-700"><Sprout className="h-2.5 w-2.5" />农场产量 +{Number(p.farmYieldPercentage)}%</span>}
                                </div>

                                <p
                                    className="text-[11px] text-slate-400 truncate mt-0.5 max-w-sm"
                                    title={p.description || '暂无说明'}
                                >
                                    {p.description || '暂无说明'}
                                </p>
                            </div>
                        </div>

                        {/* 右侧状态与编辑操作 */}
                        <div className="flex items-center gap-2 shrink-0">
                            <CatalogEnabledToggle name={p.name} enabled={p.enabled} busy={busyIds.includes(p.id)} onToggle={() => onToggle(p)} />

                            <button
                                type="button"
                                onClick={e => {
                                    e.stopPropagation();
                                    onEdit(p);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-orange-600 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg transition-all font-medium whitespace-nowrap shrink-0"
                                title="编辑职业"
                            >
                                <Edit2 className="w-3 h-3" />
                                <span>编辑</span>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
