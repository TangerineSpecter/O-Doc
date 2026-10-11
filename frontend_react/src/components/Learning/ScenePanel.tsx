import {useRef, useState, type ComponentProps} from 'react';
import {ArrowRight, BookOpen, MessageCircle, BookmarkPlus} from 'lucide-react';
import {learningApi} from '../../api/learning';
import {useLessonSession} from '../../hooks/useLessonSession';
import type {LessonPhase, LessonTeaching} from '../../types/api/learning';
import ExercisePanel from './ExercisePanel';
import {buttonClass, cardClass, inputClass, statusName} from './presentation';

const phases: {id: LessonPhase; title: string}[] = [{id: 'demo', title: '理解场景'}, {id: 'expressions', title: '学表达'}, {id: 'substitution', title: '变化组句'}, {id: 'conversation', title: '场景交流'}, {id: 'verification', title: '独立验证'}, {id: 'completed', title: '回顾订正'}];

export default function ScenePanel(props: ComponentProps<typeof ExercisePanel>) {
    const {exercise, collId, busy, act, flushRef} = props;
    const session = exercise.session;
    const formal = !!session && ['verification', 'completed'].includes(session.phase);
    const draft = useLessonSession(collId, session, flushRef, !formal);
    const startKey = useRef<string | null>(null);
    const [ending, setEnding] = useState(false);
    const [saved, setSaved] = useState<string[]>([]);
    const teaching = exercise.teaching as LessonTeaching;
    if (!teaching.task) return <ExercisePanel {...props}/>;
    const phase = session?.phase || 'demo';
    const count = session?.turns.filter(t => t.kind === phase && t.status === 'completed').length || 0;
    // Blur starts autosave before click. Actions await that save; disabling the
    // button during blur would swallow the user's click.
    const blocked = busy || !!session?.pending;
    const terminal = phase === 'ended' || exercise.status === 'ended';
    const turns = session?.turns.filter(t => ['help', phase].includes(t.kind)) || [];
    const failed = session?.turns.find(t => t.status === 'failed');
    const advance = () => void act(() => draft.action('advance'));
    return <div className="space-y-4">
        <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-orange-600">场景学习 · 文字理解与表达</p><h2 className="mt-2 text-xl font-bold">{teaching.task}</h2></div>{!terminal && exercise.status !== 'completed' && <button disabled={busy} className="whitespace-nowrap shrink-0 text-xs text-slate-500" onClick={() => setEnding(true)}>结束学习</button>}</div>
            <ol aria-label="学习步骤" className="mt-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">{phases.map((p, index) => <li key={p.id} aria-current={phase === p.id ? 'step' : undefined} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${phase === p.id ? 'bg-orange-100 font-semibold text-orange-700' : 'bg-slate-50 text-slate-500'}`}>{index + 1} · {p.title}</li>)}</ol>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">先有表达可用，再练独立使用。教学提示和订正不会增加掌握证据。</p>
            {ending && <div className="mt-4 space-y-3 rounded-xl bg-orange-50 p-4 text-sm"><p>已有交流会保留，结束后释放未完成名额。</p><div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonClass} onClick={() => void act(async () => {await draft.save(); await learningApi.exerciseAction(collId, exercise.id, 'end');})}>确认结束</button><button className="whitespace-nowrap shrink-0" onClick={() => setEnding(false)}>继续学习</button></div></div>}
            {!session && exercise.status === 'ready' && <button disabled={busy} className={`${buttonClass} mt-4`} onClick={() => void act(async () => {startKey.current ||= crypto.randomUUID(); await learningApi.startSession(collId, exercise.id, startKey.current); startKey.current = null;})}>开始这次学习</button>}
            {terminal && <p className="mt-4 text-sm text-slate-500">本次学习已结束，交流记录保留。</p>}
        </section>
        {draft.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{draft.error}<button className="ml-3 whitespace-nowrap shrink-0 underline" onClick={() => void act(draft.reload)}>重新加载并核对输入</button></div>}
        {session && !formal && !terminal && <section className={`${cardClass} space-y-5`}>
            {phase === 'demo' && <><h3 className="flex items-center gap-2 font-semibold"><BookOpen size={18}/>读懂这段交流</h3><div className="space-y-3">{teaching.dialogue.map((line, i) => <div key={i} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">{line.speaker}</p><p className="mt-1 break-words text-base leading-relaxed">{line.text}</p><p className="mt-2 text-sm text-slate-500">{line.meaning}</p></div>)}</div><label className="block text-sm font-medium">{teaching.understanding}<textarea aria-label="场景理解" maxLength={3000} disabled={blocked} value={draft.text} onChange={e => draft.change(e.target.value)} onBlur={() => void draft.save().catch(() => {})} rows={2} className={`${inputClass} mt-3 resize-none`} placeholder="用中文说说你理解的意思…"/></label><button disabled={blocked || !draft.text.trim()} className={buttonClass} onClick={advance}>学几个用得到的表达</button></>}
            {phase === 'expressions' && <><h3 className="font-semibold">这次先学这些表达</h3><p className="text-xs text-slate-500">收藏后会安排情境复习；没有收藏也可以继续学习。</p>{teaching.expressions.map(item => <article key={item.text} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="break-words text-lg font-semibold">{item.text}</h4><button disabled={busy || saved.includes(item.text)} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-orange-600" onClick={() => void act(async () => {await learningApi.saveItem(collId, {...item, sourceExerciseId: exercise.id}); setSaved(v => [...v, item.text]);})}><BookmarkPlus size={14}/>{saved.includes(item.text) ? '已收藏' : '加入我的词与表达'}</button></div><p className="mt-2 text-sm">{item.meaning}</p><p className="mt-3 break-words rounded-lg bg-slate-50 p-3 text-sm">{item.example}</p><p className="mt-3 text-xs leading-relaxed text-slate-500">{item.usage}</p></article>)}<button disabled={blocked} className={buttonClass} onClick={advance}>试着变化组句</button></>}
            {['substitution', 'conversation'].includes(phase) && <>
                <h3 className="flex items-center gap-2 font-semibold"><MessageCircle size={18}/>{phase === 'substitution' ? `变化组句 ${Math.min(count + 1, 2)}/2` : `和${teaching.role}交流 ${Math.min(count + 1, 3)}/3`}</h3>
                {phase === 'substitution' && count < 2 && <div className="space-y-2 rounded-xl bg-orange-50 p-4 text-sm"><p>{teaching.substitutions[count].prompt}</p><p className="text-slate-500">{teaching.substitutions[count].frame}</p></div>}
                {phase === 'conversation' && <p className="break-words rounded-xl bg-slate-50 p-4 text-sm">{teaching.opening}</p>}
                <div className="max-h-[420px] space-y-3 overflow-y-auto scrollbar-hide">{turns.map(t => <article key={t.id} className="space-y-2 rounded-xl border border-slate-100 p-4 text-sm"><p className="whitespace-pre-wrap break-words text-slate-800">你：{t.content}</p>{t.result.reply && <p className="whitespace-pre-wrap break-words text-orange-800">{teaching.role}：{t.result.reply}</p>}{t.result.feedback && <p className="whitespace-pre-wrap text-xs text-slate-500">{t.result.feedback}</p>}{t.result.corrections?.map((v, i) => <p key={i} className="text-xs text-slate-500">{v}</p>)}{t.status !== 'completed' && <p className="text-xs text-slate-400">{statusName[t.status]}</p>}</article>)}</div>
                {count < (phase === 'substitution' ? 2 : 3) && <><textarea aria-label={phase === 'substitution' ? '变化组句回答' : '场景交流回答'} maxLength={3000} rows={3} disabled={blocked || !!failed} value={draft.text} onChange={e => draft.change(e.target.value)} onBlur={() => void draft.save().catch(() => {})} className={`${inputClass} resize-none`} placeholder="先用简单英语把意思说清楚…"/><div className="flex flex-wrap items-center gap-3"><button disabled={blocked || !!failed || !draft.text.trim()} className={buttonClass} onClick={() => void act(() => draft.action('turn'))}>发送表达</button><button disabled={blocked || !!failed} className="whitespace-nowrap shrink-0 text-sm text-orange-600" onClick={() => void act(() => draft.action('help'))}>给我一点提示</button><span className="text-xs text-slate-400">{draft.saving ? '正在保存…' : session.pending ? '老师正在回应…' : '输入自动保存'}</span></div></>}
                {failed && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">老师回复失败，原输入已保留。<button disabled={busy} className="ml-3 whitespace-nowrap shrink-0 underline" onClick={() => void act(() => draft.action('retry', failed.id))}>重试</button></div>}
                {count >= (phase === 'substitution' ? 2 : 3) && <button disabled={blocked} className={`${buttonClass} inline-flex items-center gap-2`} onClick={advance}>{phase === 'substitution' ? '开始场景交流' : '换个情境，独立试试'}<ArrowRight size={15}/></button>}
            </>}
        </section>}
        {formal && <><p className="rounded-xl bg-orange-50 p-4 text-sm leading-relaxed text-orange-800">{phase === 'completed' ? '回顾反馈，再修改一次自己的表达。订正保留原成绩。' : '现在换一个情境，不看例句试试。请求帮助仍然可以，但会标记为辅助作答。'}</p><ExercisePanel key={session.attemptId} {...props}/></>}
        {!!exercise.sessionHistory.length && <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">场景交流与反馈记录</summary>{exercise.sessionHistory.map((s, i) => <article key={s.id} className="mt-4 space-y-3 border-t border-slate-100 pt-4"><p className="text-xs text-orange-600">第 {exercise.sessionHistory.length - i} 次学习</p>{s.turns.filter(t => t.kind === 'conversation').map(t => <div key={t.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="whitespace-pre-wrap break-words">你：{t.content}</p><p className="mt-2 whitespace-pre-wrap break-words text-slate-600">{t.result.reply}</p></div>)}{s.feedback.corrections?.map((v, n) => <p key={n} className="text-xs leading-relaxed text-slate-500">{v}</p>)}</article>)}</details>}
        {terminal && session?.turns.length ? <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">查看本次交流记录</summary>{session.turns.map(t => <p key={t.id} className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-500">{t.content}{t.result.reply ? `\n${t.result.reply}` : ''}</p>)}</details> : null}
    </div>;
}
