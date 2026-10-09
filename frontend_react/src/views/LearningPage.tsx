import {useRef, useState} from 'react';
import {ArrowLeft, GraduationCap, Settings2, Sparkles} from 'lucide-react';
import {useNavigate, useParams} from 'react-router-dom';
import {learningApi} from '../api/learning';
import {useLearning} from '../hooks/useLearning';
import LearningSettings from '../components/Learning/LearningSettings';
import ExercisePanel from '../components/Learning/ExercisePanel';
import TeacherChat from '../components/Learning/TeacherChat';
import {ExerciseList, KnowledgeList, PlanEditor, ProfilePanel} from '../components/Learning/StudyOverview';
import {buttonClass, cardClass} from '../components/Learning/presentation';

export default function LearningPage() {
    const {collId = '', exerciseId} = useParams();
    const navigate = useNavigate();
    const {course, exercise, busy, error, refresh, run} = useLearning(collId, exerciseId);
    const [settings, setSettings] = useState(false);
    const [tab, setTab] = useState('今日学习');
    const [questionId, setQuestionId] = useState<string>();
    const flush = useRef<(() => Promise<void>) | null>(null);
    const generateKey = useRef<string | null>(null);
    const open = (id: string) => {setQuestionId(undefined); navigate(`/learning/${collId}/exercises/${id}`);};
    const generate = () => void run(async () => {
        generateKey.current ||= crypto.randomUUID();
        const result = await learningApi.generate(collId, generateKey.current);
        generateKey.current = null;
        if (result.request) open(result.request.targetId);
    });
    return <main className="mx-auto max-w-7xl space-y-5 p-4 text-slate-800 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><button aria-label="返回" onClick={() => {void (async () => {try {await flush.current?.(); navigate(exerciseId ? `/learning/${collId}` : '/');} catch { /* Exercise panel presents the save conflict. */ }})();}} className="rounded-xl border border-slate-200 bg-white p-2"><ArrowLeft size={18}/></button><div className="rounded-2xl bg-orange-100 p-3 text-orange-600"><GraduationCap size={24}/></div><div><p className="text-xs text-orange-600">学习文集 · 仅本人可见</p><h1 className="mt-1 text-xl font-bold">{course?.title || '我的学习'}</h1></div></div><button disabled={!course || busy} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" onClick={() => setSettings(true)}><Settings2 size={16}/>学习设置</button></header>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}<button className="ml-3 underline" onClick={() => void refresh()}>重新加载</button></div>}
        {!course && !error && <p className="p-8 text-center text-sm text-slate-400">正在打开学习文集…</p>}
        {course && !course.config && <section className={`${cardClass} py-12 text-center`}><GraduationCap className="mx-auto text-orange-400" size={40}/><h2 className="mt-4 text-lg font-semibold">让老师认识你的学习目标</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">从工作邮件、旅行交流或语法开始。每次一小份练习，老师根据你的作答安排讲解与回顾。</p><button className={`${buttonClass} mt-6`} onClick={() => setSettings(true)}>设置目标与老师</button></section>}
        {course?.config && <>
            {!course.modelAvailable && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-700">老师模型不可用，请在学习设置中重新选择。历史记录已保留。</p>}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-5">
                    {exerciseId ? exercise && <ExercisePanel key={exercise.id} collId={collId} exercise={exercise} busy={busy} refresh={refresh} act={run} ask={setQuestionId} flushRef={flush}/> : <>
                        <section className={`${cardClass} relative overflow-hidden`}><div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-50"/><div className="relative"><p className="text-xs font-medium text-orange-600">一点一点，学会应用</p><h2 className="mt-3 text-lg font-semibold">{course.config.goal}</h2><div className="mt-5 flex flex-wrap items-center gap-4"><span className="text-sm text-slate-500">每次约 {course.config.minutes} 分钟</span><span className="text-sm text-slate-500">待完成 {course.pendingCount}/{course.config.pendingLimit} 份</span><span className="text-sm text-slate-500">已完成 {course.completedCount} 份</span></div><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy || !course.modelAvailable || (course.pendingCount || 0) >= course.config.pendingLimit || (!!course.plan && !course.plan.confirmed)} className={`${buttonClass} flex items-center gap-2`} onClick={generate}><Sparkles size={16}/>准备下一份练习</button>{course.exercises?.find(e => ['ready', 'in_progress', 'grading', 'failed_grading'].includes(e.status)) && <button className="rounded-xl border border-orange-200 px-4 py-2 text-sm text-orange-700" onClick={() => open(course.exercises!.find(e => ['ready', 'in_progress', 'grading', 'failed_grading'].includes(e.status))!.id)}>继续已有练习</button>}</div><p className="mt-3 text-xs text-slate-400">达到上限暂停出题。中断学习后先回顾，不补发积压作业。</p></div></section>
                        <nav aria-label="学习内容" className="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 scrollbar-hide">{['今日学习', '复习', '学习画像', '学习记录'].map(v => <button key={v} aria-current={tab === v ? 'page' : undefined} onClick={() => setTab(v)} className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm ${tab === v ? 'bg-white font-medium text-orange-600 shadow-sm' : 'text-slate-500'}`}>{v}</button>)}</nav>
                        {tab === '今日学习' && <><ExerciseList course={course} history={false} open={open}/><PlanEditor course={course} busy={busy} save={async (stages, stage) => {await learningApi.plan(collId, course.plan!.id, stages, stage); await refresh();}}/></>}
                        {tab === '复习' && <KnowledgeList knowledge={course.knowledge || []} dueOnly open={open}/>}
                        {tab === '学习画像' && <><ProfilePanel course={course} busy={busy} evaluate={() => void run(() => learningApi.evaluate(collId, crypto.randomUUID()))} correct={async value => {await learningApi.correct(collId, value); await refresh();}}/><KnowledgeList knowledge={course.knowledge || []} dueOnly={false} open={open}/></>}
                        {tab === '学习记录' && <ExerciseList course={course} history open={open}/>}
                    </>}
                </div>
                <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
                    {questionId && exercise && <div className="rounded-xl bg-orange-50 p-3 text-xs text-orange-700">正在讨论 {exercise.questions.find(q => q.id === questionId)?.knowledgeName || '当前题目'}<button className="ml-2 underline" onClick={() => setQuestionId(undefined)}>清除</button></div>}
                    <TeacherChat name={course.config.teacherName} messages={course.messages || []} busy={busy} pending={!!course.requests?.some(r => r.kind === 'chat' && ['pending', 'running'].includes(r.status))} send={async content => {await flush.current?.(); await learningApi.chat(collId, content, crypto.randomUUID(), exercise?.attempt?.id, questionId); await refresh();}}/>
                    {course.requests?.filter(r => r.status === 'failed').slice(0, 3).map(r => <p key={r.id} className="rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-600">{r.error}{['chat', 'evaluate', 'generate'].includes(r.kind) && <button className="ml-2 underline" disabled={busy} onClick={() => void run(async () => {
                        if (r.kind === 'chat') {
                            const message = course.messages?.find(m => m.id === r.targetId);
                            if (message) await learningApi.chat(collId, message.content, crypto.randomUUID(), message.attemptId || undefined, message.questionId || undefined);
                        } else if (r.kind === 'evaluate') await learningApi.evaluate(collId, crypto.randomUUID());
                        else {const value = await learningApi.generate(collId, crypto.randomUUID()); if (value.request) open(value.request.targetId);}
                    })}>重试</button>}</p>)}
                </aside>
            </div>
        </>}
        {settings && course && <LearningSettings saveError={error} collId={collId} config={course.config} enabled={!!course.autoEnabled} busy={busy} close={() => setSettings(false)} save={(config, enabled, proposalId) => void run(async () => {await learningApi.configure(collId, config, enabled, proposalId); setSettings(false);})}/>}
    </main>;
}
