import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import {learningApi} from '../../api/learning';
import type {Attempt, Exercise} from '../../types/api/learning';
import {buttonClass, cardClass, inputClass, kindName, statusName} from './presentation';

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
        <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium text-orange-600">{kindName[exercise.kind]} · {statusName[exercise.status]}</p><h1 className="mt-2 text-xl font-bold">{exercise.title}</h1></div>{active && <button disabled={busy} onClick={() => setEnding(true)} className="text-sm text-slate-400">结束这份练习</button>}</div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{exercise.introduction}</p>
            {ending && <div className="mt-4 rounded-xl bg-orange-50 p-4 text-sm"><p>保留已有记录，结束后释放未完成名额。</p><div className="mt-3 flex gap-3"><button className={buttonClass} disabled={busy} onClick={() => void act(() => learningApi.exerciseAction(collId, exercise.id, 'end'))}>确认结束</button><button onClick={() => setEnding(false)}>继续学习</button></div></div>}
            {exercise.status === 'ready' && !attempt && <button disabled={busy} className={`${buttonClass} mt-4`} onClick={() => void act(() => learningApi.exerciseAction(collId, exercise.id, 'start'))}>开始作答</button>}
            {exercise.status === 'completed' && <button disabled={busy} className={`${buttonClass} mt-4`} onClick={() => void act(() => learningApi.exerciseAction(collId, exercise.id, 'start'))}>重新练习（保留历史）</button>}
            {grade && <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-orange-50 p-4"><strong className="text-orange-700">{grade.score ?? '—'} 分</strong><span className="text-sm text-slate-600">完成 {grade.answered}/{grade.total} 题 · 完成率 {grade.completion}%</span></div>}
        </section>
        {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}<button className="ml-3 underline" onClick={() => {dirty.current = false; live.current = null; void refresh();}}>重新加载答案</button></div>}
        {exercise.questions.map((q, index) => {
            const result = grade?.items.find(i => i.questionId === q.id);
            const help = revealed[q.id];
            return <section className={cardClass} key={q.id}><div className="flex flex-wrap gap-2 text-xs text-slate-400"><span>第 {index + 1} 题</span><span>{q.knowledgeName}</span>{q.review && <span className="text-orange-600">回顾检测</span>}{attempt?.assisted.includes(q.id) && <span className="text-blue-600">辅助作答</span>}</div><p className="my-4 whitespace-pre-wrap text-base leading-relaxed text-slate-800">{q.prompt}</p>
                {q.type === 'choice' ? <div className="space-y-2">{q.options.map(option => <label key={option} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${answers[q.id] === option ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}><input type="radio" name={q.id} disabled={!isDraft || busy} checked={answers[q.id] === option} onChange={() => change(q.id, option)} onBlur={() => {void save().catch(() => {});}}/>{option}</label>)}</div> : <textarea aria-label={`第${index + 1}题答案`} disabled={!isDraft || busy} className={`${inputClass} resize-none disabled:bg-slate-50`} rows={q.type === 'fill' ? 2 : 4} value={answers[q.id] || ''} placeholder="写下你的答案…" onChange={e => change(q.id, e.target.value)} onBlur={() => {void save().catch(() => {});}}/>}
                {isDraft && <div className="mt-3 flex flex-wrap gap-4"><button disabled={busy} className="text-xs text-orange-600" onClick={() => {void act(async () => {await save(); ask(q.id);});}}>请老师提示</button><button disabled={busy} className="text-xs text-slate-400" onClick={() => {void act(async () => {await save(); const v = await learningApi.answer(collId, attempt.id, q.id); live.current = v.attempt; setRevealed(prev => ({...prev, [q.id]: v}));});}}>查看答案（标记辅助）</button></div>}
                {(q.referenceAnswer || help) && <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed"><p><span className="text-slate-400">参考答案：</span>{q.referenceAnswer || help?.referenceAnswer}</p><p className="whitespace-pre-wrap text-slate-600">{q.explanation || help?.explanation}</p></div>}
                {result && <div className="mt-4 space-y-2 text-sm"><p className="font-semibold text-orange-700">{result.skipped ? '本题跳过' : `${result.score} 分`}</p><p className="whitespace-pre-wrap text-slate-600">{result.feedback}</p>{result.dimensions.map((d, i) => <p key={i} className="text-slate-500">{['意思与任务', '语法与用词', '自然度与场景'][i]} {d.score}/{d.maxScore}：{d.reason}</p>)}{result.naturalExpression && <p className="text-slate-600">更自然的表达：{result.naturalExpression}</p>}<button className="text-orange-600" disabled={busy} onClick={() => ask(q.id)}>追问这道题</button></div>}
            </section>;
        })}
        {isDraft && <section className={`${cardClass} space-y-3`}><p className="text-xs text-slate-400">{saving ? '正在保存答案…' : '离开输入框时保存；提交前会再次保存。'}</p>{totalSkipped > 0 && <label className="flex gap-2 text-sm text-slate-500"><input type="checkbox" checked={skipConfirm} onChange={e => setSkipConfirm(e.target.checked)}/>确认跳过 {totalSkipped} 道未作答题（不记为能力错误）</label>}<button disabled={busy || (totalSkipped > 0 && !skipConfirm)} className={buttonClass} onClick={() => void act(async () => {await save(); await learningApi.submit(collId, attempt.id, 'submit', crypto.randomUUID(), skipConfirm);})}>提交并批改</button></section>}
        {attempt?.status === 'failed' && <button disabled={busy} className={buttonClass} onClick={() => void act(() => learningApi.submit(collId, attempt.id, 'retry', crypto.randomUUID()))}>重试批改</button>}
        {attempt?.status === 'completed' && !attempt.reviewRequested && <button disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => void act(() => learningApi.submit(collId, attempt.id, 'review', crypto.randomUUID()))}>申请一次评分复核</button>}
        {['pending', 'running'].includes(attempt?.status || '') && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-700">老师正在批改，答案已保留，可稍后回来查看。</p>}
        {(exercise.attempts.length > 1 || exercise.attempts.some(a => a.grades.length > 1)) && <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">历史作答与评分版本</summary>{exercise.attempts.map(a => <div key={a.id} className="mt-4 border-t border-slate-100 pt-3 text-sm"><p>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '未提交'} · {statusName[a.status]}</p>{a.grades.map(g => <div key={g.id} className="mt-2"><p>评分版本 {g.version}：{g.result.score ?? '—'} 分</p>{exercise.questions.map(q => <p key={q.id} className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{q.prompt} — {a.answers[q.id] || '跳过'}；{g.result.items.find(i => i.questionId === q.id)?.feedback}</p>)}</div>)}</div>)}</details>}
    </div>;
}
