import {useState} from 'react';
import {
    Calendar,
    Compass,
    Edit3,
    Info,
    Lightbulb,
    Loader2,
    MessageSquare,
    ShieldCheck,
    Sparkles,
    Target,
    X,
} from 'lucide-react';
import type {CourseData} from '../../types/api/learning';
import {cardClass, inputClass, recommendationName} from './presentation';

interface ProfilePanelProps {
    course: CourseData;
    busy: boolean;
    evaluate: () => void;
    correct: (value: string) => Promise<void>;
}

export default function ProfilePanel({course, busy, evaluate, correct}: ProfilePanelProps) {
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const isEvaluating = course.requests?.some(
        r => r.kind === 'evaluate' && ['pending', 'running'].includes(r.status)
    );

    const assessment = course.assessment;
    const status = assessment?.status || '待初测';
    const level = course.config?.level || '不确定';
    const points = assessment?.points || [];

    const handleSaveCorrection = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await correct(content);
            setContent('');
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : '保存失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={`${cardClass} space-y-5 transition-all`}>
            {/* 顶部标题与操作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100/80 text-orange-600 shadow-2xs">
                        <Target size={16} className="shrink-0" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">老师的整体评估</h2>
                        <p className="text-xs text-slate-400">基于作答表现动态推演 · 掌握各维度学情</p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-2xs whitespace-nowrap shrink-0 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Edit3 size={13} className="shrink-0 text-slate-400" />
                        <span>补充／纠正画像</span>
                    </button>

                    <button
                        type="button"
                        disabled={busy || isEvaluating}
                        onClick={evaluate}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs shadow-orange-500/20 whitespace-nowrap shrink-0 transition-all hover:from-orange-600 hover:to-orange-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isEvaluating ? (
                            <Loader2 size={13} className="animate-spin shrink-0 text-white" />
                        ) : (
                            <Sparkles size={13} className="shrink-0 text-white" />
                        )}
                        <span>{isEvaluating ? '正在评估…' : '生成阶段评估'}</span>
                    </button>
                </div>
            </div>

            {/* 动态学习评估概况 Banner */}
            <div className="rounded-2xl border border-orange-100/90 bg-gradient-to-br from-orange-50/80 via-orange-50/40 to-amber-50/30 p-4 sm:p-5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shadow-2xs">
                            <Sparkles size={14} className="fill-orange-400" />
                        </div>
                        <span className="text-sm font-bold text-slate-900">动态学习评估</span>
                        <span className="inline-flex items-center rounded-full border border-orange-200/80 bg-orange-100/90 px-2.5 py-0.5 text-xs font-semibold text-orange-800 shadow-2xs">
                            {status}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>起始自评等级：</span>
                        <strong className="rounded-lg border border-slate-200/80 bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs">
                            {level}
                        </strong>
                    </div>
                </div>

                <div className="mt-3.5 flex items-start gap-2 border-t border-orange-200/60 pt-3 text-xs leading-relaxed text-slate-600">
                    <Info size={14} className="mt-0.5 shrink-0 text-orange-500" />
                    <span>
                        起始自评仅作初测参考。后续老师将根据每个知识点的正式作答表现动态调整难度与巩固节奏，不代表固定考试等级。
                    </span>
                </div>
            </div>

            {/* 知识点诊断卡片列表 */}
            {points.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            知识点学情与巩固指引 ({points.length})
                        </h3>
                        <span className="text-[11px] text-slate-400">自适应练习诊断</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {points.map(p => {
                            const isConsolidate = p.guidance.includes('巩固') || p.guidance.includes('基础');
                            const isMastered = p.guidance.includes('掌握') || p.guidance.includes('良好');

                            return (
                                <div
                                    key={p.id}
                                    className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 shadow-2xs transition-all hover:border-orange-200/80 hover:bg-white hover:shadow-xs"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                                            <p className="truncate text-sm font-semibold text-slate-800">
                                                {p.name}
                                            </p>
                                        </div>

                                        <span
                                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-2xs whitespace-nowrap ${
                                                isConsolidate
                                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                    : isMastered
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : 'border-orange-200 bg-orange-50 text-orange-700'
                                            }`}
                                        >
                                            {p.guidance}
                                        </span>
                                    </div>

                                    <div className="mt-2.5 rounded-lg bg-white/80 p-2 text-xs leading-relaxed text-slate-500 border border-slate-100/80">
                                        {p.reason}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 阶段评估历史记录 */}
            {course.evaluations && course.evaluations.length > 0 ? (
                <div className="space-y-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            阶段评估报告 ({course.evaluations.length})
                        </h3>
                        <span className="text-[11px] text-slate-400">基于客观作答推演</span>
                    </div>

                    <div className="space-y-4">
                        {course.evaluations.map(v => (
                            <article
                                key={v.id}
                                className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all hover:border-orange-200 hover:shadow-xs space-y-3.5"
                            >
                                {/* 报告顶栏 */}
                                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/70 bg-orange-100/80 px-2.5 py-0.5 text-xs font-semibold text-orange-700 shadow-2xs">
                                            <Sparkles size={12} className="shrink-0 fill-orange-500 text-orange-500" />
                                            <span>阶段学习诊断报告</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-slate-400">
                                            <Calendar size={12} className="shrink-0" />
                                            <span className="font-mono">{new Date(v.createdAt).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                        <span>依据</span>
                                        <strong className="text-slate-800">{v.evidence.length}</strong>
                                        <span>次作答记录</span>
                                    </div>
                                </div>

                                {/* 评估综述 */}
                                <div className="rounded-xl border border-slate-100/90 bg-slate-50/70 p-4">
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 font-normal">
                                        {v.result.summary}
                                    </p>
                                </div>

                                {/* 老师专属建议（若存在 recommendation） */}
                                {v.result.recommendation && (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-900">
                                        <Lightbulb size={15} className="mt-0.5 shrink-0 text-blue-600" />
                                        <div>
                                            <strong className="font-semibold text-blue-950">学习建议：</strong>
                                            <span>{recommendationName[v.result.recommendation] || v.result.recommendation}</span>
                                        </div>
                                    </div>
                                )}

                                {/* 下一步行动重点卡片 */}
                                <div className="rounded-xl border border-orange-200/80 bg-gradient-to-r from-orange-50/90 via-amber-50/40 to-white p-4 shadow-2xs">
                                    <div className="flex items-center gap-2 text-xs font-bold text-orange-900">
                                        <Compass size={15} className="shrink-0 text-orange-600" />
                                        <span>下一步重点与行动建议</span>
                                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                                            重点攻克
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800 whitespace-pre-wrap">
                                        {v.result.nextFocus}
                                    </p>
                                </div>

                                {/* 底部机制说明与链接 */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                        <ShieldCheck size={13} className="shrink-0 text-emerald-500" />
                                        <span>诊断结论已同步留存 · 不代表考试定级 · 后续练习将动态自适应</span>
                                    </div>
                                    <span>具体依据见知识点画像</span>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    <Compass size={24} className="mx-auto text-slate-300" />
                    <p className="mt-2 text-xs text-slate-400">
                        完成几轮练习后，点击右上角「生成阶段评估」，老师将结合完整作答记录深入分析你的进步与薄弱点。
                    </p>
                </div>
            )}

            {/* 用户补充纠正说明 */}
            {course.corrections && course.corrections.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        我的自述与纠正
                    </h3>
                    <div className="space-y-2">
                        {course.corrections.map(v => (
                            <div
                                key={v.id}
                                className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/50 p-3 text-xs leading-relaxed text-slate-700 shadow-2xs"
                            >
                                <MessageSquare size={14} className="mt-0.5 shrink-0 text-amber-600" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-amber-900">我的说明：</p>
                                    <p className="mt-0.5 whitespace-pre-wrap">{v.content}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 补充/纠正弹窗 Modal */}
            {editing && (
                <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs">
                    <form
                        onSubmit={handleSaveCorrection}
                        className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900">补充或纠正老师判断</h2>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs leading-relaxed text-slate-500">
                            你可以记录自身情况（例如答错是因为打字手滑，或想优先专注特定场景）。系统会保留原始作答，老师将在后续评估中将你的说明纳入参考。
                        </p>

                        <div>
                            <textarea
                                required
                                aria-label="画像修正说明"
                                maxLength={1000}
                                rows={4}
                                className={`${inputClass} resize-none`}
                                placeholder="例如：这次拼写错误是打字失误，我想重点多练酒店入住和问路交流。"
                                value={content}
                                onChange={e => setContent(e.target.value)}
                            />
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
                                disabled={saving || busy || !content.trim()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-2xs hover:bg-orange-600 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin shrink-0" /> : null}
                                <span>{saving ? '保存中…' : '保存说明'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </section>
    );
}
