import type {GoalProposal, LearningSubject} from '../../types/api/learning';
import {Select} from '../common/Select';
import {buttonClass, inputClass} from './presentation';

interface Props {
    subjects: LearningSubject[]; changeSubject: (id: string) => void; subject?: LearningSubject; currentGoal?: string; selected: string[]; supplement: string; proposal: GoalProposal | null;
    busy: boolean; error: string; change: (selected: string[], supplement: string) => void; prepare: () => void;
}
export default function GoalSetup({subjects, changeSubject, subject, currentGoal, selected, supplement, proposal, busy, error, change, prepare}: Props) {
    const toggle = (id: string) => change(id === 'unsure' ? selected.includes(id) ? [] : [id] : selected.includes(id) ? selected.filter(v => v !== id) : [...selected.filter(v => v !== 'unsure'), id], supplement);
    const option = (id: string, label: string) => <button key={id} type="button" disabled={busy} aria-pressed={selected.includes(id)} onClick={() => toggle(id)} className={`whitespace-nowrap shrink-0 rounded-full border px-3 py-2 text-sm ${selected.includes(id) ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500'}`}>{label}</button>;
    return <section className="space-y-4">
        <div><h3 className="text-sm font-semibold">你想学习什么？</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">选大方向即可，不必逐项选择具体场景。老师会根据初测安排阶段重点，并持续调整难度。</p></div>
        {currentGoal && <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">当前已确认目标</p><p className="mt-1 break-words text-sm leading-relaxed">{currentGoal}</p></div>}
        <div><p className="mb-2 text-xs font-medium text-slate-500">学习内容</p>{!currentGoal && subjects.length > 1 ? <Select menuPortal disabled={busy} value={subject?.id || ''} onChange={changeSubject} options={subjects.map(s => ({value: s.id, label: s.name}))}/> : <span className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">{subject?.name || '加载中…'}</span>}</div>
        <fieldset><legend className="mb-2 text-xs font-medium text-slate-500">学习方向（可多选）</legend><div className="flex flex-wrap gap-2">{subject?.directions.map(direction => option(direction.id, direction.label))}</div><div className="mt-3 space-y-1">{subject?.directions.filter(d => selected.includes(d.id)).map(d => <p key={d.id} className="text-xs leading-relaxed text-slate-500">{d.label}：{d.description}</p>)}</div></fieldset>
        <label className="block text-sm font-medium">还有什么具体需求？（可选）<textarea maxLength={1000} disabled={busy} className={`${inputClass} mt-2 resize-none`} rows={2} placeholder="例如：想读懂技术文档，或者和国外同事讨论项目。留空也可以。" value={supplement} onChange={e => change(selected, e.target.value)}/></label>
        <button type="button" disabled={busy || (!selected.length && !supplement.trim())} className={buttonClass} onClick={prepare}>{busy ? '正在整理目标…' : proposal ? '重新整理目标' : '整理目标并预览'}</button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {proposal && ['ready', 'confirmed'].includes(proposal.status) && <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-4"><p className="text-sm font-semibold">待确认的学习目标</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{proposal.result.goal}</p><p className="break-words text-xs leading-relaxed text-slate-500">{proposal.result.note}</p><p className="text-xs text-orange-700">点击下方“确认目标并保存”后生效；初测后再确认阶段计划。</p></div>}
    </section>;
}
