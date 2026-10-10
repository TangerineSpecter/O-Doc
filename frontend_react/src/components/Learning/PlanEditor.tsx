import {useState} from 'react';
import {
    ArrowRight,
    Check,
    Flag,
    Info,
    Loader2,
    Milestone,
    SlidersHorizontal,
    Sparkles,
    X,
} from 'lucide-react';
import type {CourseData, Stage} from '../../types/api/learning';
import {cardClass, inputClass} from './presentation';

interface PlanEditorProps {
    course: CourseData;
    busy: boolean;
    save: (stages: Stage[], stage: number) => Promise<void>;
}

export default function PlanEditor({course, busy, save}: PlanEditorProps) {
    const plan = course.plan;
    const [editing, setEditing] = useState(false);
    const [stages, setStages] = useState<Stage[]>([]);
    const [stage, setStage] = useState(0);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (!plan) {
        return (
            <section className={`${cardClass} relative overflow-hidden p-6 sm:p-7 transition-all`}>
                <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 shadow-2xs">
                        <Flag size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">从一次轻量初测开始</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            老师会结合你的学习目标和初测表现，为你定制三个循序渐进的阶段重点。初测是起点，不是水平考试认证。
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    const currentStageIndex = plan.stage;
    const stageCompleted = course.stageCompleted || 0;
    const isConfirmed = plan.confirmed;

    const handleOpenEdit = () => {
        setStages(plan.stages);
        setStage(plan.stage);
        setError('');
        setEditing(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await save(stages, stage);
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : '保存失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={`${cardClass} space-y-5 transition-all p-5 sm:p-6`}>
            {/* 顶部标题与操作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100/80 text-orange-600 shadow-2xs">
                        <Milestone size={16} className="shrink-0" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900">
                                {isConfirmed ? '阶段学习规划' : '确认你的学习计划'}
                            </h2>
                            <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                                    isConfirmed
                                        ? 'border-orange-200/80 bg-orange-100/80 text-orange-800'
                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}
                            >
                                {isConfirmed ? `进行中 · 阶段 ${currentStageIndex + 1}` : '待确认'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                            三阶段循序渐进 · 依据你的作答表现动态调优
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    disabled={busy}
                    onClick={handleOpenEdit}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-2xs whitespace-nowrap shrink-0 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <SlidersHorizontal size={13} className="shrink-0 text-slate-400" />
                    <span>调整计划</span>
                </button>
            </div>

            {/* 3 阶段旅程卡片列表 */}
            <ol className="space-y-3.5">
                {plan.stages.map((s, i) => {
                    const isCompleted = isConfirmed && i < currentStageIndex;
                    const isActive = isConfirmed && i === currentStageIndex;
                    const isPendingConfirmation = !isConfirmed && i === 0;

                    return (
                        <li
                            key={i}
                            className={`relative overflow-hidden rounded-2xl transition-all ${
                                isActive || isPendingConfirmation
                                    ? 'border-2 border-orange-300/80 bg-gradient-to-br from-white via-orange-50/40 to-amber-50/25 p-5 shadow-xs'
                                    : isCompleted
                                    ? 'border border-emerald-200/70 bg-emerald-50/20 p-4 sm:p-5'
                                    : 'border border-slate-200/70 bg-slate-50/50 p-4 sm:p-5 opacity-90 hover:opacity-100'
                            }`}
                        >
                            {/* 阶段 Header */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold shadow-2xs ${
                                            isCompleted
                                                ? 'bg-emerald-500 text-white'
                                                : isActive || isPendingConfirmation
                                                ? 'bg-orange-500 text-white'
                                                : 'bg-slate-200 text-slate-600'
                                        }`}
                                    >
                                        {isCompleted ? <Check size={13} /> : i + 1}
                                    </div>
                                    <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                                        {s.title}
                                    </h3>
                                </div>

                                <span
                                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                                        isCompleted
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : isActive
                                            ? 'border-orange-200 bg-orange-100 text-orange-800'
                                            : isPendingConfirmation
                                            ? 'border-orange-200 bg-orange-100 text-orange-800'
                                            : 'border-slate-200 bg-white text-slate-400'
                                    }`}
                                >
                                    {isCompleted
                                        ? '已达成'
                                        : isActive || isPendingConfirmation
                                        ? '当前专注阶段'
                                        : '后续进阶'}
                                </span>
                            </div>

                            {/* 阶段重点内容 */}
                            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-600 whitespace-pre-wrap pl-8.5">
                                {s.focus}
                            </p>

                            {/* 若为当前进行中阶段，展示可视化练习进度槽 */}
                            {(isActive || isPendingConfirmation) && (
                                <div className="mt-3.5 pt-3 border-t border-orange-100/80 flex flex-wrap items-center justify-between gap-2.5 pl-8.5">
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-500 font-medium">阶段练习进度</span>
                                        <span className="font-bold text-orange-700">
                                            {stageCompleted} / 5 份
                                        </span>
                                    </div>

                                    {/* 5 格 Mini 槽位指示器 */}
                                    <div
                                        className="flex items-center gap-1.5"
                                        aria-label={`当前阶段进度：已完成 ${stageCompleted} 共 5 份`}
                                    >
                                        {Array.from({length: 5}).map((_, idx) => (
                                            <span
                                                key={idx}
                                                className={`h-2 w-5 rounded-full transition-all ${
                                                    idx < stageCompleted
                                                        ? 'bg-orange-500 shadow-2xs'
                                                        : 'bg-slate-200'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            {/* 底部行动引导栏 */}
            <div className="pt-2 border-t border-slate-100">
                {!isConfirmed ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50/60 border border-orange-100 p-3.5">
                        <div className="flex items-center gap-2 text-xs text-orange-800">
                            <Sparkles size={14} className="shrink-0 text-orange-600" />
                            <span>
                                老师已为你量身规划阶段目标，确认后即刻开启阶段一练习。
                            </span>
                        </div>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void save(plan.stages, plan.stage)}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs whitespace-nowrap shrink-0 transition-all hover:from-orange-600 hover:to-orange-700 active:scale-95 disabled:opacity-50"
                        >
                            <Check size={14} className="shrink-0" />
                            <span>确认并开始学习</span>
                        </button>
                    </div>
                ) : course.stageEvaluationDue && plan.stage < 2 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3.5">
                        <div className="flex items-center gap-2 text-xs text-emerald-800">
                            <Sparkles size={14} className="shrink-0 text-emerald-600" />
                            <span>
                                🎉 恭喜完成当前阶段练习！老师已根据你的表现评估就绪，确认后开启下一阶段。
                            </span>
                        </div>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                setStages(plan.stages);
                                setStage(plan.stage + 1);
                                setEditing(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-semibold text-white shadow-2xs whitespace-nowrap shrink-0 transition-all hover:from-emerald-600 hover:to-teal-700 active:scale-95 disabled:opacity-50"
                        >
                            <span>确认进入下一阶段</span>
                            <ArrowRight size={14} className="shrink-0" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Info size={13} className="shrink-0 text-slate-400" />
                        <span>
                            完成阶段内 5 份练习后进行阶段评估；计划重点可随时按需调整。
                        </span>
                    </div>
                )}
            </div>

            {/* 调整阶段计划弹窗 Modal */}
            {editing && (
                <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs">
                    <form
                        onSubmit={handleSave}
                        className="max-h-[85vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl scrollbar-hide"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900">调整阶段学习计划</h2>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs leading-relaxed text-slate-500">
                            可自主编辑各阶段的重点场景与训练策略，或切换当前专注阶段。
                        </p>

                        <div className="space-y-3.5">
                            {stages.map((s, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-700">
                                            阶段 {i + 1}
                                        </span>
                                        <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="stage"
                                                checked={stage === i}
                                                onChange={() => setStage(i)}
                                                className="accent-orange-500"
                                            />
                                            <span>设为当前进行阶段</span>
                                        </label>
                                    </div>

                                    <div>
                                        <input
                                            aria-label={`阶段${i + 1}标题`}
                                            required
                                            maxLength={100}
                                            className={`${inputClass} text-xs font-semibold`}
                                            placeholder="阶段标题（如：旅行场景核心句型）"
                                            value={s.title}
                                            onChange={e =>
                                                setStages(prev =>
                                                    prev.map((v, j) =>
                                                        j === i ? {...v, title: e.target.value} : v
                                                    )
                                                )
                                            }
                                        />
                                    </div>

                                    <div>
                                        <textarea
                                            aria-label={`阶段${i + 1}重点`}
                                            required
                                            maxLength={1000}
                                            className={`${inputClass} resize-none text-xs leading-relaxed`}
                                            rows={2}
                                            placeholder="学习重点与练习形式说明"
                                            value={s.focus}
                                            onChange={e =>
                                                setStages(prev =>
                                                    prev.map((v, j) =>
                                                        j === i ? {...v, focus: e.target.value} : v
                                                    )
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {error && <p className="text-xs text-red-600">{error}</p>}

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => setEditing(false)}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={saving || busy}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-2xs hover:bg-orange-600 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                {saving ? (
                                    <Loader2 size={14} className="animate-spin shrink-0" />
                                ) : (
                                    <Check size={14} className="shrink-0" />
                                )}
                                <span>{saving ? '保存中…' : '保存并确认'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </section>
    );
}
