import type {CourseData} from '../../types/api/learning';
import {cardClass} from './presentation';

export default function LearningGrowth({course, open}: {course: CourseData; open: (id: string) => void}) {
    const growth = course.growth;
    return <section className={`${cardClass} space-y-5`}><div><h2 className="font-semibold">从看懂到独立表达</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">依据正式作答，分别观察文字理解与表达；不推断听力、发音或口语流利度。</p></div>
        {!course.skills?.some(p => p.recognition.evidence.length || p.expression.evidence.length) && <p className="text-sm text-slate-400">完成正式验证后，逐步建立学习依据。</p>}
        <div className="space-y-3">{course.skills?.filter(p => p.recognition.evidence.length || p.expression.evidence.length).map(p => <details key={p.id} className="rounded-xl border border-slate-100 p-4"><summary className="cursor-pointer text-sm font-medium">{p.name}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{([{key: 'recognition', title: '理解表现'}, {key: 'expression', title: '独立表达'}] as const).map(s => <div key={s.key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium">{s.title} · {p[s.key].status}</p>{p[s.key].evidence.slice(-3).map(e => <button key={e.attemptId} className="mt-2 block text-left text-xs text-orange-600" onClick={() => open(e.exerciseId)}>{e.date} · {e.assisted ? '提示后作答' : '独立作答'} · {e.score} 分 → 查看依据</button>)}{!p[s.key].evidence.length && <p className="mt-2 text-xs text-slate-400">尚无这类正式验证</p>}</div>)}</div></details>)}</div>
        {!!growth?.nextFocus.length && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-800">下一步重点：{growth.nextFocus.join('、')}</p>}
        {!!growth?.independentExamples.length && <div><h3 className="text-sm font-semibold">已经独立表达过</h3>{growth.independentExamples.map(e => <button key={`${e.attemptId}:${e.knowledgeName}`} onClick={() => open(e.exerciseId)} className="mt-3 block w-full rounded-xl bg-slate-50 p-4 text-left"><p className="text-xs text-slate-400">{e.knowledgeName} · {e.date}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{e.example}</p></button>)}</div>}
        {!!growth?.repeatedDifficulties.length && <div><h3 className="text-sm font-semibold">值得再练的地方</h3>{growth.repeatedDifficulties.map(p => <p key={p.knowledgeName} className="mt-3 text-xs leading-relaxed text-slate-500">{p.knowledgeName}：近期有 {p.count} 次表达需要巩固。{p.feedback}</p>)}</div>}
    </section>;
}
