import type {CourseData, Knowledge} from '../../types/api/learning';
import {cardClass, kindName, statusName} from './presentation';

export function ExerciseList({course, history, open}: {course: CourseData; history: boolean; open: (id: string) => void}) {
    const exercises = (course.exercises || []).filter(e => history ? ['completed', 'ended', 'failed'].includes(e.status) : !['completed', 'ended', 'failed'].includes(e.status));
    return <section className={cardClass}><h2 className="mb-4 font-semibold">{history ? '学习记录' : '继续学习'}</h2>{!exercises.length && <p className="py-8 text-center text-sm text-slate-400">{history ? '完成练习后，你的成长会留在这里。' : '没有积压的练习，可以准备下一份。'}</p>}<div className="space-y-2">{exercises.map(e => <button key={e.id} onClick={() => open(e.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-4 text-left hover:border-orange-200 hover:bg-orange-50/40"><div><p className="text-sm font-medium">{e.title}</p><p className="mt-1 text-xs text-slate-400">{kindName[e.kind]} · {new Date(e.createdAt).toLocaleDateString()}</p></div><span className="shrink-0 text-xs text-orange-600">{statusName[e.status]}</span></button>)}</div></section>;
}

export function KnowledgeList({knowledge, dueOnly, open}: {knowledge: Knowledge[]; dueOnly: boolean; open: (id: string) => void}) {
    const points = dueOnly ? knowledge.filter(p => p.status === '需复习' || (p.lastScore !== null && p.lastScore < 80)) : knowledge;
    return <section className={cardClass}><h2 className="font-semibold">{dueOnly ? '回顾与错题' : '知识点画像'}</h2><p className="mt-1 text-xs text-slate-400">依据正式作答记录评估；到期只提示复习，不自动记错。</p>{!points.length && <p className="py-8 text-center text-sm text-slate-400">{dueOnly ? '暂时没有需要回顾的知识点。' : '完成初测后逐步建立学习画像。'}</p>}<div className="mt-4 space-y-3">{points.map(p => <details key={p.id} className="rounded-xl border border-slate-100 p-4"><summary className="flex cursor-pointer items-center justify-between gap-3 text-sm"><span>{p.name}</span><span className={p.status === '需复习' ? 'text-orange-600' : 'text-slate-400'}>{p.status}</span></summary><p className="mt-3 text-xs text-slate-500">最近得分 {p.lastScore ?? '—'} · 下次复习 {p.dueAt ? new Date(p.dueAt).toLocaleDateString() : '待评估'}</p>{p.evidence.map(e => <button key={e.attemptId} onClick={() => open(e.exerciseId)} className="mt-2 block text-left text-xs text-orange-600">{e.date} · {e.score}分 · {e.assisted ? '辅助作答' : '独立作答'}{e.review ? ' · 到期复习' : ''} → 查看依据</button>)}</details>)}</div></section>;
}

export {default as PlanEditor} from './PlanEditor';

export {default as ProfilePanel} from './ProfilePanel';
