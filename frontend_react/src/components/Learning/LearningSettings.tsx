import {useEffect, useState} from 'react';
import {X} from 'lucide-react';
import {Select} from '../common/Select';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {learningApi} from '../../api/learning';
import type {LearningConfig, LearningModel} from '../../types/api/learning';
import GoalSetup from './GoalSetup';
import {useLearningGoal} from '../../hooks/useLearningGoal';
import {buttonClass, inputClass} from './presentation';

const defaults: LearningConfig = {goal: '', subject: 'english', scenarios: [], level: '不确定', minutes: 10, questionCount: 5, pendingLimit: 2, teacherName: '英语老师', modelId: '', style: '耐心讲解，结合实际应用', scheduleTime: '09:00', timezone: 'Asia/Shanghai'};
export default function LearningSettings({collId, config, enabled, busy, saveError, close, save}: {collId: string; config: LearningConfig | null; enabled: boolean; busy: boolean; saveError: string; close: () => void; save: (config: LearningConfig, enabled: boolean, proposalId?: string) => void}) {
    const [form, setForm] = useState({...defaults, ...config});
    const goal = useLearningGoal(collId, form.subject);
    const preview = goal.proposal?.status === 'ready' ? goal.proposal : null;
    const canSave = !goal.busy && (preview || (config && !goal.dirty));
    const [auto, setAuto] = useState(enabled);
    const [models, setModels] = useState<LearningModel[]>([]);
    const [error, setError] = useState('');
    useEscapeDismissal(true, () => {if (!busy) close();});
    useEffect(() => {let active = true; learningApi.models().then(v => {if (active) setModels(v);}).catch(() => {if (active) setError('模型列表加载失败，请关闭后重试');}); return () => {active = false;};}, []);
    const field = <K extends keyof LearningConfig>(key: K, value: LearningConfig[K]) => setForm(prev => ({...prev, [key]: value}));
    return <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => {if (!busy) close();}}>
        <form aria-label="学习设置" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()} onSubmit={e => {e.preventDefault(); if (!canSave) return; if (preview?.result.goal && preview.result.scenarios) save({...form, goal: preview.result.goal, scenarios: preview.result.scenarios}, auto, preview.id); else if (config) save(form, auto);}}>
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><h2 className="text-lg font-bold">学习目标与老师</h2><button type="button" disabled={busy} onClick={close} aria-label="关闭设置"><X size={20}/></button></header>
            <div className="space-y-5 overflow-y-auto p-6 scrollbar-hide">
                {(error || saveError) && <p role="alert" className="text-sm text-red-600">{error || saveError}</p>}
                <GoalSetup subjects={goal.subjects} changeSubject={id => {field('subject', id); goal.change([], '');}} subject={goal.subjects.find(s => s.id === form.subject)} currentGoal={config?.goal} selected={goal.selected} supplement={goal.supplement} proposal={preview} busy={busy || goal.busy} error={goal.error} change={goal.change} prepare={() => void goal.prepare(form.modelId, form.style)}/>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div><p className="mb-2 text-sm font-medium">起始自评水平（可选）</p><Select menuPortal value={form.level} onChange={v => field('level', v)} options={['不确定', '基础', '能简单交流', '中等', '较熟练'].map(v => ({value: v, label: v === '不确定' ? '不确定，让老师初测' : v}))}/><p className="mt-2 text-xs leading-relaxed text-slate-500">仅供初测参考；后续按实际表现调整难度，不限制学习水平。</p></div>
                    <label className="text-sm font-medium">老师名称<input required maxLength={50} className={`${inputClass} mt-2`} value={form.teacherName} onChange={e => field('teacherName', e.target.value)}/></label>
                    <div><p className="mb-2 text-sm font-medium">老师模型</p><Select menuPortal value={form.modelId} onChange={v => field('modelId', v)} placeholder="选择现有对话模型" options={models.map(m => ({value: m.id, label: m.displayName || m.name}))}/></div>
                    <label className="text-sm font-medium">每次时间（分钟）<input required type="number" min={3} max={60} className={`${inputClass} mt-2`} value={form.minutes} onChange={e => field('minutes', Number(e.target.value))}/></label>
                    <label className="text-sm font-medium">每份题量<input required type="number" min={3} max={10} className={`${inputClass} mt-2`} value={form.questionCount} onChange={e => field('questionCount', Number(e.target.value))}/></label>
                    <label className="text-sm font-medium">未完成上限<input required type="number" min={1} max={5} className={`${inputClass} mt-2`} value={form.pendingLimit} onChange={e => field('pendingLimit', Number(e.target.value))}/></label>
                </div>
                <label className="block text-sm font-medium">教学风格<textarea required maxLength={500} rows={2} className={`${inputClass} mt-2 resize-none`} value={form.style} onChange={e => field('style', e.target.value)}/></label>
                <div className="space-y-3 rounded-xl bg-slate-50 p-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/>在本机每天准备一份练习</label><p className="text-xs leading-relaxed text-slate-500">达到上限暂停，不补发错过的练习。只在一个设备开启自动出题；同步恢复后需重新开启。</p><div className="grid grid-cols-2 gap-3"><label className="text-sm">出题时间<input type="time" required className={`${inputClass} mt-1`} value={form.scheduleTime} onChange={e => field('scheduleTime', e.target.value)}/></label><div><p className="mb-1 text-sm">时区</p><Select menuPortal value={form.timezone} onChange={v => field('timezone', v)} options={Array.from(new Set([form.timezone, 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'UTC'])).map(v => ({value: v, label: v}))}/></div></div></div>
            </div>
            <footer className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4"><button type="button" disabled={busy} onClick={close} className="text-sm text-slate-500">取消</button><button className={buttonClass} disabled={busy || !form.modelId || !canSave}>{busy ? '保存中…' : preview ? '确认目标并保存' : '保存学习设置'}</button></footer>
        </form>
    </div>;
}
