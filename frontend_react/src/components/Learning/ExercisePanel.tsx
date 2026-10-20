import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import {Award, CheckCircle2, FileCheck, Play, RotateCcw} from 'lucide-react';
import ExerciseQuestionCard from './ExerciseQuestionCard';
import {learningApi} from '../../api/learning';
import {createRequestKey} from '../../utils/requestKey';
import type {Attempt, Exercise} from '../../types/api/learning';
import {buttonClass, cardClass, kindName, statusName} from './presentation';

export default function ExercisePanel({collId, exercise, busy, refresh, act, ask, flushRef}: {collId: string; exercise: Exercise; busy: boolean; refresh: () => Promise<void>; act: (fn: () => Promise<unknown>) => Promise<void>; ask: (questionId: string) => void; flushRef: MutableRefObject<(() => Promise<void>) | null>}) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [revealed, setRevealed] = useState<Record<string, {referenceAnswer: string; explanation: string}>>({});
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [skipConfirm, setSkipConfirm] = useState(false);
    const attempt = exercise.attempt;
    const live = useRef<Attempt | null>(null);
    const dirty = useRef(false);
    const answerRef = useRef(answers);
    const chain = useRef<Promise<void>>(Promise.resolve());
    useEffect(() => {
        if (live.current?.id !== attempt?.id) {
            live.current = attempt; dirty.current = false;
            const next = attempt?.answers || {};
            answerRef.current = next; setAnswers(next); setRevealed({}); setError('');
        } else if (!dirty.current && attempt && attempt.revision >= (live.current?.revision || 0)) {
            live.current = attempt;
            if (JSON.stringify(answerRef.current) !== JSON.stringify(attempt.answers)) {
                answerRef.current = attempt.answers; setAnswers(attempt.answers);
            }
        }
    }, [attempt]);
    const save = useCallback(async () => {
        const persist = async () => {
            if (!dirty.current || !live.current || live.current.status !== 'draft') return;
            setSaving(true);
            const snapshot = {...answerRef.current};
            try {
                live.current = await learningApi.save(collId, live.current.id, live.current.revision, snapshot);
                dirty.current = JSON.stringify(snapshot) !== JSON.stringify(answerRef.current);
                setError('');
            } catch (err) {
                setError(err instanceof Error ? err.message : '答案保存失败');
                throw err;
            } finally {setSaving(false);}
        };
        const next = chain.current.catch(() => {}).then(persist);
        chain.current = next;
        await next;
    }, [collId]);
    useEffect(() => {
        flushRef.current = save;
        return () => {flushRef.current = null;};
    });
    useEffect(() => {
        const timer = window.setTimeout(() => {void save().catch(() => {});}, 800);
        return () => window.clearTimeout(timer);
    }, [answers, save]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (dirty.current) {event.preventDefault(); event.returnValue = '';}
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, []);
    const change = (id: string, value: string) => {
        const next = {...answerRef.current, [id]: value};
        answerRef.current = next; dirty.current = true; setAnswers(next); setSkipConfirm(false);
    };
    const [ending, setEnding] = useState(false);
    const isDraft = attempt?.status === 'draft';
    const active = ['ready', 'generating', 'in_progress', 'grading', 'failed_grading'].includes(exercise.status);
    const totalSkipped = exercise.questions.filter(q => !(answers[q.id] || '').trim()).length;
    const grade = attempt?.grade;
    return <div className="space-y-4">
        <section className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/80 px-2.5 py-0.5 text-xs font-semibold text-orange-700 shadow-2xs">
                        <span>{kindName[exercise.kind]}</span>
                        <span className="opacity-40">·</span>
                        <span>{statusName[exercise.status]}</span>
                    </div>
                    <h1 className="mt-2 text-xl font-bold text-slate-900">{exercise.title}</h1>
                </div>
                {active && (
                    <button
                        disabled={busy}
                        onClick={() => setEnding(true)}
                        className="rounded-lg px-2.5 py-1 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        结束这份练习
                    </button>
                )}
            </div>

            <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                {exercise.introduction}
            </p>

            {ending && (
                <div className="mt-4 rounded-xl bg-orange-50 p-4 text-sm space-y-3">
                    <p className="text-slate-700">保留已有记录，结束后释放未完成名额。</p>
                    <div className="flex gap-3">
                        <button
                            className={buttonClass}
                            disabled={busy}
                            onClick={() => void act(() => learningApi.exerciseAction(collId, exercise.id, 'end'))}
                        >
                            确认结束
                        </button>
                        <button
                            onClick={() => setEnding(false)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                        >
                            继续学习
                        </button>
                    </div>
                </div>
            )}

            {/* 开始作答入口（待作答状态） */}
            {exercise.status === 'ready' && !attempt && (
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-400">共 {exercise.questions.length} 道题目 · 作答自动保存</span>
                    <button
                        disabled={busy}
                        className={`${buttonClass} inline-flex items-center gap-1.5`}
                        onClick={() => void act(() => learningApi.exerciseAction(collId, exercise.id, 'start'))}
                    >
                        <Play size={13} className="fill-current" />
                        <span>开始作答</span>
                    </button>
                </div>
            )}

            {/* 练习成绩与表现成果看板（整合得分展示与重新练习操作） */}
            {grade && (
                <div className="mt-5 rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/60 via-amber-50/20 to-white p-4 shadow-2xs sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        {/* 得分与完成度概览 */}
                        <div className="flex items-center gap-4">
                            <div
                                className={`flex h-16 min-w-[72px] flex-col items-center justify-center rounded-2xl border px-3 shadow-2xs ${
                                    (grade.score ?? 0) >= 85
                                        ? 'border-emerald-600 bg-emerald-500 text-white'
                                        : (grade.score ?? 0) >= 60
                                          ? 'border-orange-500 bg-orange-500 text-white'
                                          : 'border-rose-500 bg-rose-500 text-white'
                                }`}
                            >
                                <span className="text-2xl font-black leading-none tracking-tight">
                                    {exercise.format === 'scenario' ? '已批改' : grade.score ?? '—'}
                                </span>
                                <span className="mt-1 text-[10px] font-medium opacity-90">
                                    {exercise.format === 'scenario'
                                        ? '情境任务'
                                        : (grade.score ?? 0) >= 85
                                          ? '掌握优秀'
                                          : (grade.score ?? 0) >= 60
                                            ? '表现良好'
                                            : '需要巩固'}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-slate-800">练习成果表现</h3>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                        <CheckCircle2 size={11} />
                                        已完成
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <FileCheck size={13} className="text-slate-400" />
                                        <span>
                                            完成题目：<strong className="font-semibold text-slate-700">{grade.answered}/{grade.total} 题</strong>
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Award size={13} className="text-slate-400" />
                                        <span>
                                            完成率：<strong className="font-semibold text-slate-700">{grade.completion}%</strong>
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 重新练习操作按钮 */}
                        {exercise.status === 'completed' && (
                            <div className="flex items-center sm:self-center">
                                <button
                                    disabled={busy}
                                    onClick={() =>
                                        void act(() =>
                                            exercise.format === 'scenario'
                                                ? learningApi.startSession(collId, exercise.id, createRequestKey())
                                                : learningApi.exerciseAction(collId, exercise.id, 'start')
                                        )
                                    }
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-700 shadow-2xs transition-all hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40 sm:w-auto"
                                >
                                    <RotateCcw size={13} />
                                    <span>重新练习（保留历史）</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 未出 grade 但已完成时的备选重新练习操作 */}
            {exercise.status === 'completed' && !grade && (
                <div className="mt-4 flex justify-end">
                    <button
                        disabled={busy}
                        onClick={() =>
                            void act(() =>
                                exercise.format === 'scenario'
                                    ? learningApi.startSession(collId, exercise.id, createRequestKey())
                                    : learningApi.exerciseAction(collId, exercise.id, 'start')
                            )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-700 shadow-2xs hover:bg-orange-50 disabled:opacity-40"
                    >
                        <RotateCcw size={13} />
                        <span>重新练习（保留历史）</span>
                    </button>
                </div>
            )}
        </section>
        {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}<button className="ml-3 underline" onClick={() => {dirty.current = false; live.current = null; void refresh();}}>重新加载答案</button></div>}
        {exercise.questions.map((q, index) => {
            const result = grade?.items.find(i => i.questionId === q.id);
            const help = revealed[q.id];
            return (
                <ExerciseQuestionCard
                    key={q.id}
                    collId={collId}
                    question={q}
                    index={index}
                    answer={answers[q.id] || ''}
                    isDraft={isDraft}
                    busy={busy}
                    attempt={attempt}
                    gradeItem={result}
                    help={help}
                    format={exercise.format}
                    onChangeAnswer={val => change(q.id, val)}
                    onSaveAnswer={() => {
                        void save().catch(() => {});
                    }}
                    onAskHint={() => {
                        void act(async () => {
                            await save();
                            ask(q.id);
                        });
                    }}
                    onRevealAnswer={() => {
                        if (!attempt) return;
                        void act(async () => {
                            await save();
                            const v = await learningApi.answer(collId, attempt.id, q.id);
                            live.current = v.attempt;
                            setRevealed(prev => ({...prev, [q.id]: v}));
                        });
                    }}
                    onAskTeacher={() => ask(q.id)}
                    act={act}
                />
            );
        })}
        {isDraft && <section className={`${cardClass} space-y-3`}><p className="text-xs text-slate-400">{saving ? '正在保存答案…' : '离开输入框时保存；提交前会再次保存。'}</p>{totalSkipped > 0 && <label className="flex gap-2 text-sm text-slate-500"><input type="checkbox" checked={skipConfirm} onChange={e => setSkipConfirm(e.target.checked)}/>确认跳过 {totalSkipped} 道未作答题（不记为能力错误）</label>}<button disabled={busy || (totalSkipped > 0 && !skipConfirm)} className={buttonClass} onClick={() => void act(async () => {await save(); await learningApi.submit(collId, attempt.id, 'submit', createRequestKey(), skipConfirm);})}>提交并批改</button></section>}
        {attempt?.status === 'failed' && <button disabled={busy} className={buttonClass} onClick={() => void act(() => learningApi.submit(collId, attempt.id, 'retry', createRequestKey()))}>重试批改</button>}
        {attempt?.status === 'completed' && !attempt.reviewRequested && <button disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => void act(() => learningApi.submit(collId, attempt.id, 'review', createRequestKey()))}>申请一次评分复核</button>}
        {['pending', 'running'].includes(attempt?.status || '') && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-700">老师正在批改，答案已保留，可稍后回来查看。</p>}
        {(exercise.attempts.length > 1 || exercise.attempts.some(a => a.grades.length > 1)) && <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">历史作答与评分版本</summary>{exercise.attempts.map(a => <div key={a.id} className="mt-4 border-t border-slate-100 pt-3 text-sm"><p>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '未提交'} · {statusName[a.status]}</p>{a.grades.map(g => <div key={g.id} className="mt-2"><p>评分版本 {g.version}：{g.result.score ?? '—'} 分</p>{exercise.questions.map(q => <p key={q.id} className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{q.prompt} — {a.answers[q.id] || '跳过'}；{g.result.items.find(i => i.questionId === q.id)?.feedback}</p>)}</div>)}</div>)}</details>}
    </div>;
}
