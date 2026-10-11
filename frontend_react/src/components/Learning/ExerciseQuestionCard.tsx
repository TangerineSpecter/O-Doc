import {useState} from 'react';
import {
    AlertCircle,
    BookOpen,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    HelpCircle,
    Lightbulb,
    MessageCircleQuestion,
    MessageSquareQuote,
    PencilLine,
    RotateCcw,
    Sparkles,
} from 'lucide-react';
import type {Attempt, GradeItem, Question} from '../../types/api/learning';
import {cardClass, inputClass} from './presentation';
import RevisionPanel from './RevisionPanel';

/**
 * 将长段反馈智能拆解为【整体概述】与【关键问题要点】
 */
function parseFeedback(feedback: string): {overview: string; issues: string[]} {
    if (!feedback) return {overview: '', issues: []};
    const str = feedback.trim();
    // 匹配 "关键问题："、"主要问题："、"核心问题：" 等
    const keyIssueMatch = str.match(/^([\s\S]*?)(?:关键问题|主要问题|核心问题|改进要点|问题)\s*[:：]\s*([\s\S]*)$/);
    if (keyIssueMatch) {
        const overview = keyIssueMatch[1].trim();
        const rawIssues = keyIssueMatch[2].trim();
        const items = rawIssues
            .split(/(?:^|[\s\n；;]+)(?:\d+[\)）\.]\s*|[-•]\s*)/)
            .map(s => s.trim().replace(/[；;]$/, ''))
            .filter(Boolean);
        return {
            overview: overview || '综合评价',
            issues: items.length > 0 ? items : [rawIssues],
        };
    }
    // 尝试直接匹配按编号开头的行 (1. 或 1）)
    const numberedMatch = str.split(/(?:^|[\n；;]+)(?:\d+[\)）\.]\s*)/);
    if (numberedMatch.length > 1) {
        return {
            overview: numberedMatch[0].trim(),
            issues: numberedMatch.slice(1).map(s => s.trim().replace(/[；;]$/, '')).filter(Boolean),
        };
    }
    return {overview: str, issues: []};
}

export interface ExerciseQuestionCardProps {
    collId: string;
    question: Question;
    index: number;
    answer: string;
    isDraft: boolean;
    busy: boolean;
    attempt: Attempt | null;
    gradeItem?: GradeItem;
    help?: {referenceAnswer: string; explanation: string};
    format?: 'classic' | 'scenario';
    onChangeAnswer: (value: string) => void;
    onSaveAnswer: () => void;
    onAskHint: () => void;
    onRevealAnswer: () => void;
    onAskTeacher: () => void;
    act: (fn: () => Promise<unknown>) => Promise<void>;
}

export default function ExerciseQuestionCard({
    collId,
    question,
    index,
    answer,
    isDraft,
    busy,
    attempt,
    gradeItem,
    help,
    format,
    onChangeAnswer,
    onSaveAnswer,
    onAskHint,
    onRevealAnswer,
    onAskTeacher,
    act,
}: ExerciseQuestionCardProps) {
    const [copiedRef, setCopiedRef] = useState(false);
    const [copiedNatural, setCopiedNatural] = useState(false);
    const [showDimensions, setShowDimensions] = useState(false);
    const [revisionOpen, setRevisionOpen] = useState(false);

    const refAnswer = question.referenceAnswer || help?.referenceAnswer;
    const explanation = question.explanation || help?.explanation;

    const copyText = async (text: string, type: 'ref' | 'natural') => {
        try {
            await navigator.clipboard.writeText(text);
            if (type === 'ref') {
                setCopiedRef(true);
                setTimeout(() => setCopiedRef(false), 2000);
            } else {
                setCopiedNatural(true);
                setTimeout(() => setCopiedNatural(false), 2000);
            }
        } catch {
            // ignore clipboard error
        }
    };

    const {overview, issues} = gradeItem ? parseFeedback(gradeItem.feedback) : {overview: '', issues: []};
    const scoreVal = gradeItem?.score ?? 0;
    const canRevise = attempt?.status === 'completed' && gradeItem && !gradeItem.skipped && question.type !== 'choice';

    return (
        <section className={`${cardClass} space-y-4 transition-shadow`}>
            {/* 1. 顶部标签区：题号、知识点、回顾/辅助状态与得分胶囊 */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-lg border border-orange-200/70 bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                        第 {index + 1} 题
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        {question.knowledgeName}
                    </span>
                    {question.review && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <RotateCcw size={11} className="shrink-0" />
                            回顾检测
                        </span>
                    )}
                    {attempt?.assisted.includes(question.id) && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200/70 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            <HelpCircle size={11} className="shrink-0" />
                            辅助作答
                        </span>
                    )}
                </div>

                {gradeItem && !gradeItem.skipped && gradeItem.score !== null && (
                    <div
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold ${
                            scoreVal >= 85
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                : scoreVal >= 60
                                  ? 'border border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        <span>得分 {gradeItem.score}</span>
                        <span className="text-[10px] opacity-70">/ 100</span>
                    </div>
                )}
            </div>

            {/* 2. 题干任务说明 */}
            <div className="pt-1">
                <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-800">
                    {question.prompt}
                </p>
            </div>

            {/* 3. 作答区域 */}
            <div>
                {question.type === 'choice' ? (
                    <div className="space-y-2">
                        {question.options.map(option => (
                            <label
                                key={option}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition-colors ${
                                    answer === option
                                        ? 'border-orange-300 bg-orange-50/80 font-medium text-orange-950'
                                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={question.id}
                                    disabled={!isDraft || busy}
                                    checked={answer === option}
                                    onChange={() => onChangeAnswer(option)}
                                    onBlur={onSaveAnswer}
                                    className="text-orange-500 focus:ring-orange-400"
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                ) : isDraft ? (
                    <div>
                        <textarea
                            aria-label={`第${index + 1}题答案`}
                            disabled={busy}
                            className={`${inputClass} resize-none min-h-[96px]`}
                            rows={question.type === 'fill' ? 2 : 4}
                            value={answer}
                            placeholder="写下你的英文表达…"
                            onChange={e => onChangeAnswer(e.target.value)}
                            onBlur={onSaveAnswer}
                        />
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="inline-flex items-center gap-1 font-medium text-orange-600 hover:text-orange-700 disabled:opacity-40"
                                    onClick={onAskHint}
                                >
                                    <Lightbulb size={13} />
                                    <span>请老师提示</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
                                    onClick={onRevealAnswer}
                                >
                                    <span>查看答案（标记辅助）</span>
                                </button>
                            </div>
                            <span>离开输入框自动保存</span>
                        </div>
                    </div>
                ) : (
                    /* 已提交后的展示卡片：告别死板的大禁用文本域 */
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                            <PencilLine size={13} className="text-slate-400" />
                            <span>你的作答</span>
                        </div>
                        <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-slate-800">
                            {answer.trim() ? (
                                answer
                            ) : (
                                <span className="font-normal italic text-slate-400">未填写答案（本题跳过）</span>
                            )}
                        </p>
                    </div>
                )}
            </div>

            {/* 4. 参考答案与思路卡片（在有参考答案或请求帮助后展示） */}
            {refAnswer && (
                <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                                <Lightbulb size={13} className="text-amber-500" />
                                <span>参考答案</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 leading-snug sm:text-base">
                                {refAnswer}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void copyText(refAnswer, 'ref')}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            title="复制参考答案"
                        >
                            {copiedRef ? (
                                <>
                                    <Check size={12} className="text-emerald-600" />
                                    <span className="text-emerald-600">已复制</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    <span>复制</span>
                                </>
                            )}
                        </button>
                    </div>

                    {explanation && (
                        <div className="border-t border-slate-200/70 pt-2.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <BookOpen size={12} />
                                <span>解析思路</span>
                            </div>
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                                {explanation}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* 5. 批改反馈报告区（核心改造：呼吸感结构化卡片，告别一坨字密密麻麻） */}
            {gradeItem && (
                <div className="mt-4 space-y-4">
                    {gradeItem.skipped ? (
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            <AlertCircle size={16} className="text-slate-400" />
                            <span>本题已跳过，不计入得分和掌握证据</span>
                        </div>
                    ) : (
                        <div className="space-y-4 rounded-2xl border border-orange-100/90 bg-gradient-to-b from-orange-50/20 via-white to-white p-4 shadow-2xs sm:p-5">
                            {/* A. 评分仪表盘与微型维度进度条 */}
                            <div className="flex flex-col items-stretch justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
                                {/* 得分徽标 */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <div
                                        className={`flex h-16 min-w-[72px] flex-col items-center justify-center rounded-2xl border px-3 shadow-2xs ${
                                            scoreVal >= 85
                                                ? 'border-emerald-600 bg-emerald-500 text-white'
                                                : scoreVal >= 60
                                                  ? 'border-orange-500 bg-orange-500 text-white'
                                                  : 'border-rose-500 bg-rose-500 text-white'
                                        }`}
                                    >
                                        <span className="text-2xl font-black leading-none tracking-tight">
                                            {scoreVal}
                                        </span>
                                        <span className="mt-1 text-[10px] font-medium opacity-90">
                                            {scoreVal >= 85 ? '表达地道' : scoreVal >= 60 ? '基本达标' : '待提升'}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-800">
                                            {format === 'scenario' ? '情境任务批改' : '得分表现'}
                                        </h4>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            综合评定意思达成、语法自然度
                                        </p>
                                    </div>
                                </div>

                                {/* 三维度得分进度条（一秒看清丢分项） */}
                                {gradeItem.dimensions?.length === 3 && (
                                    <div className="grid max-w-md flex-1 grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
                                        {gradeItem.dimensions.map((d, i) => {
                                            const title = ['意思与任务', '语法与用词', '自然度与场景'][i];
                                            const pct = d.maxScore > 0 ? Math.round((d.score / d.maxScore) * 100) : 0;
                                            const barColor =
                                                pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-orange-500' : 'bg-rose-500';
                                            return (
                                                <div
                                                    key={i}
                                                    className="space-y-1.5 rounded-xl border border-slate-100 bg-white p-2.5 shadow-2xs"
                                                >
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="truncate text-[11px] font-medium text-slate-500">
                                                            {title}
                                                        </span>
                                                        <span className="text-[11px] font-bold text-slate-700">
                                                            {d.score}/{d.maxScore}
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                                            style={{width: `${Math.min(pct, 100)}%`}}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* B. 老师点评与关键问题诊断 */}
                            <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                                    <MessageSquareQuote size={15} className="text-amber-600" />
                                    <span>老师点评</span>
                                </div>

                                {overview && (
                                    <p className="text-sm font-normal leading-relaxed text-slate-700">
                                        {overview}
                                    </p>
                                )}

                                {issues.length > 0 && (
                                    <div className="space-y-2 border-t border-amber-200/50 pt-2">
                                        <p className="text-xs font-medium text-amber-800">关键问题与提升建议：</p>
                                        <div className="space-y-2">
                                            {issues.map((issue, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-start gap-2.5 rounded-lg border border-amber-200/60 bg-white/90 p-2.5 text-xs leading-relaxed text-slate-700 shadow-2xs"
                                                >
                                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="flex-1 font-normal">
                                                        {issue}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* C. 更地道的表达推荐（高光卡片） */}
                            {gradeItem.naturalExpression && (
                                <div className="space-y-2 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-emerald-50/60 p-3.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                                            <Sparkles size={14} className="text-emerald-600" />
                                            <span>更自然的表达推荐</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void copyText(gradeItem.naturalExpression, 'natural')}
                                            className="inline-flex items-center gap-1 rounded-md bg-emerald-100/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-200/70"
                                        >
                                            {copiedNatural ? (
                                                <>
                                                    <Check size={12} className="text-emerald-700" />
                                                    <span>已复制</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={12} />
                                                    <span>复制</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p className="font-sans text-sm font-semibold leading-relaxed text-emerald-950 sm:text-base">
                                        {gradeItem.naturalExpression}
                                    </p>
                                </div>
                            )}

                            {/* D. 评分依据详情折叠面板 */}
                            {gradeItem.dimensions?.length > 0 && (
                                <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50/40">
                                    <button
                                        type="button"
                                        onClick={() => setShowDimensions(v => !v)}
                                        className="flex w-full items-center justify-between p-3 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100/60 hover:text-slate-800"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                            查看 3 个维度的评分理由明细
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                            {showDimensions ? '收起' : '展开'}
                                            {showDimensions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </span>
                                    </button>

                                    {showDimensions && (
                                        <div className="space-y-2 border-t border-slate-200/50 p-3 pt-2">
                                            <div className="grid grid-cols-1 gap-2">
                                                {gradeItem.dimensions.map((d, i) => {
                                                    const dimTitle = ['意思与任务', '语法与用词', '自然度与场景'][i];
                                                    const verdictLabel =
                                                        d.verdict === 'correct'
                                                            ? '准确'
                                                            : d.verdict === 'partial'
                                                              ? '部分准确'
                                                              : '未达成';
                                                    const verdictStyle =
                                                        d.verdict === 'correct'
                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                            : d.verdict === 'partial'
                                                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                              : 'border-rose-200 bg-rose-50 text-rose-700';
                                                    return (
                                                        <div
                                                            key={i}
                                                            className="space-y-1.5 rounded-lg border border-slate-200/70 bg-white p-3"
                                                        >
                                                            <div className="flex items-center justify-between text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-semibold text-slate-800">
                                                                        {dimTitle}
                                                                    </span>
                                                                    <span
                                                                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${verdictStyle}`}
                                                                    >
                                                                        {verdictLabel}
                                                                    </span>
                                                                </div>
                                                                <span className="font-bold text-slate-700">
                                                                    {d.score} / {d.maxScore} 分
                                                                </span>
                                                            </div>
                                                            <p className="text-xs leading-relaxed text-slate-600">
                                                                {d.reason}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* E. 底部操作栏：追问与再表达一次 */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={onAskTeacher}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-600 disabled:opacity-40"
                                >
                                    <MessageCircleQuestion size={14} className="text-orange-500" />
                                    <span>追问这道题</span>
                                </button>

                                {canRevise && (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setRevisionOpen(v => !v)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold text-orange-700 shadow-2xs transition-colors hover:bg-orange-100 disabled:opacity-40"
                                    >
                                        <PencilLine size={13} />
                                        <span>{revisionOpen ? '收起订正' : '根据讲解，再表达一次'}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* F. 答后订正面板 */}
                    {canRevise && attempt && (
                        <RevisionPanel
                            collId={collId}
                            attempt={attempt}
                            questionId={question.id}
                            busy={busy}
                            act={act}
                            open={revisionOpen}
                            onToggleOpen={setRevisionOpen}
                        />
                    )}
                </div>
            )}
        </section>
    );
}
