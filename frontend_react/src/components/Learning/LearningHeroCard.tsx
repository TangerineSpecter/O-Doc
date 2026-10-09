import {ArrowRight, CheckCircle2, Clock, Info, Layers, Loader2, Sparkles} from 'lucide-react';
import type {CourseData} from '../../types/api/learning';
import {scenarioName} from './presentation';

interface LearningHeroCardProps {
    course: CourseData;
    busy: boolean;
    onGenerate: () => void;
    onOpenExercise: (exerciseId: string) => void;
}

export default function LearningHeroCard({
    course,
    busy,
    onGenerate,
    onOpenExercise,
}: LearningHeroCardProps) {
    const config = course.config;
    if (!config) return null;

    const minutes = config.minutes || 10;
    const pendingLimit = config.pendingLimit || 2;
    const pendingCount = course.pendingCount || 0;
    const completedCount = course.completedCount || 0;
    const isLimitReached = pendingCount >= pendingLimit;
    const isPlanUnconfirmed = Boolean(course.plan && !course.plan.confirmed);
    const isModelUnavailable = !course.modelAvailable;
    const isGenerateDisabled = busy || isModelUnavailable || isLimitReached || isPlanUnconfirmed;

    const ongoingExercise = course.exercises?.find(e =>
        ['ready', 'in_progress', 'grading', 'failed_grading'].includes(e.status)
    );

    const getDisabledReason = () => {
        if (isModelUnavailable) return '伴学老师模型暂不可用，请在设置中选择';
        if (isPlanUnconfirmed) return '请先在下方确认当前阶段的学习计划';
        if (isLimitReached) return `待完成练习已达上限（${pendingLimit} 份），先完成已有练习`;
        return null;
    };
    const disabledReason = getDisabledReason();

    return (
        <section className="relative overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-br from-white via-orange-50/25 to-amber-50/20 p-4 shadow-sm transition-all sm:p-5">
            {/* 柔和背景光晕 */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-orange-200/35 via-amber-200/15 to-transparent blur-2xl" />

            <div className="relative space-y-3">
                {/* 顶部标签栏：精简同行两端对齐 */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/70 bg-orange-100/80 px-2.5 py-0.5 text-xs font-semibold text-orange-700 shadow-2xs">
                        <Sparkles size={12} className="shrink-0 fill-orange-500 text-orange-500" />
                        <span>一点一点，学会应用</span>
                    </div>

                    {config.teacherName && (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/90 px-2.5 py-0.5 text-xs text-slate-600 shadow-2xs">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                            <span>
                                伴学老师：<strong className="font-medium text-slate-700">{config.teacherName}</strong>
                            </span>
                        </div>
                    )}
                </div>

                {/* 核心学习目标与场景标签（紧凑排版） */}
                <div>
                    <h2 className="text-sm font-bold leading-relaxed text-slate-900 sm:text-base">
                        {config.goal}
                    </h2>

                    {config.scenarios && config.scenarios.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-400">重点场景：</span>
                            {config.scenarios.map(scenario => (
                                <span
                                    key={scenario}
                                    className="rounded-md border border-slate-200/70 bg-white/80 px-1.5 py-0.2 text-[11px] text-slate-600 shadow-2xs"
                                >
                                    {scenarioName[scenario] || scenario}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3 个核心指标栏：紧凑药丸卡片行（去除冗余副标题，节省大量高度） */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {/* 单次节奏 */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-100/90 bg-white/85 px-3 py-2 shadow-2xs">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-100/80 bg-orange-50 text-orange-600">
                            <Clock size={14} className="shrink-0" />
                        </div>
                        <div className="min-w-0 flex items-baseline gap-1.5">
                            <span className="text-xs text-slate-400">单次练习</span>
                            <span className="text-xs font-bold text-slate-800">约 {minutes} 分钟</span>
                        </div>
                    </div>

                    {/* 待完成池 */}
                    <div className="flex items-center justify-between rounded-xl border border-slate-100/90 bg-white/85 px-3 py-2 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                                    isLimitReached
                                        ? 'border-amber-200/80 bg-amber-50 text-amber-600'
                                        : 'border-orange-100/80 bg-orange-50 text-orange-600'
                                }`}
                            >
                                <Layers size={14} className="shrink-0" />
                            </div>
                            <div className="min-w-0 flex items-baseline gap-1.5">
                                <span className="text-xs text-slate-400">待完成</span>
                                <span
                                    className={`text-xs font-bold ${
                                        isLimitReached ? 'text-amber-600' : 'text-slate-800'
                                    }`}
                                >
                                    {pendingCount}/{pendingLimit} 份
                                </span>
                            </div>
                        </div>

                        {/* Mini 槽位指示器 */}
                        <div className="flex items-center gap-1 shrink-0" aria-label={`待完成容量 ${pendingCount} 共 ${pendingLimit} 份`}>
                            {Array.from({length: pendingLimit}).map((_, idx) => (
                                <span
                                    key={idx}
                                    className={`h-1.5 w-3 rounded-full transition-all ${
                                        idx < pendingCount
                                            ? isLimitReached
                                                ? 'bg-amber-500'
                                                : 'bg-orange-500'
                                            : 'bg-slate-200'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* 累计完成 */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-100/90 bg-white/85 px-3 py-2 shadow-2xs">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-100/80 bg-emerald-50 text-emerald-600">
                            <CheckCircle2 size={14} className="shrink-0" />
                        </div>
                        <div className="min-w-0 flex items-baseline gap-1.5">
                            <span className="text-xs text-slate-400">累计达成</span>
                            <span className="text-xs font-bold text-slate-800">已完成 {completedCount} 份</span>
                        </div>
                    </div>
                </div>

                {/* 底部紧凑操作栏与智能状态提示（横向协同排布） */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={isGenerateDisabled}
                            onClick={onGenerate}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                                isGenerateDisabled
                                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                    : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-2xs shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98]'
                            }`}
                        >
                            {busy ? (
                                <Loader2 size={14} className="animate-spin shrink-0 text-current" />
                            ) : (
                                <Sparkles size={14} className="shrink-0 text-current" />
                            )}
                            <span>{busy ? '正在出题…' : '准备下一份练习'}</span>
                        </button>

                        {ongoingExercise && (
                            <button
                                type="button"
                                onClick={() => onOpenExercise(ongoingExercise.id)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-medium text-orange-700 shadow-2xs whitespace-nowrap shrink-0 transition-all hover:border-orange-300 hover:bg-orange-50"
                            >
                                <span>继续已有练习</span>
                                <ArrowRight size={13} className="shrink-0 text-orange-600" />
                            </button>
                        )}
                    </div>

                    {/* 精炼状态或防积压提示（只占用极少单行空间） */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        {disabledReason ? (
                            <span className="text-amber-600 flex items-center gap-1 font-medium">
                                <Info size={12} className="shrink-0 text-amber-500" />
                                {disabledReason}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1">
                                <Info size={12} className="shrink-0 text-slate-400" />
                                达到上限暂停出题，中断先回顾，不补发积压作业
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
