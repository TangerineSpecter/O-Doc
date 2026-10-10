import {useState} from 'react';
import {X, NotebookPen} from 'lucide-react';
import {Select} from '@/components/common/Select';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import type {AgentConfig, AgentTaskConfig} from '@/types/api/setting';
import {defaultMemoCaptureTask} from './builtinTasks';
interface Props {task?: AgentTaskConfig; agents: AgentConfig[]; models: {value: string; label: React.ReactNode}[]; progress?: AgentTaskConfig['randomProgress']; running: boolean; onSave: (task: Partial<AgentTaskConfig>) => Promise<boolean>; onRun: (id: string) => void}
export function MemoCaptureSettings({task, agents, models, progress, running, onSave, onRun}: Props) {
    const [open, setOpen] = useState(false);
    const [participants, setParticipants] = useState<string[]>([]);
    const [count, setCount] = useState(3);
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEscapeDismissal(open, () => setOpen(false));
    const configure = () => {setParticipants(task?.agents || []); setCount(task?.randomCount || 3); setPrompt(task?.prompt || ''); setModel(task?.model || ''); setError(''); setOpen(true);};
    const save = async () => {
        if (!participants.length || !Number.isSafeInteger(count) || count < 1 || count > 10000) {setError('请选择居民，并填写 1～10000 的每周总机会数'); return;}
        setBusy(true);
        try {if (await onSave({...defaultMemoCaptureTask, ...task, id: task?.id || undefined, agent: participants[0], agents: participants, randomCount: count, model: model || null, prompt})) setOpen(false); else setError('保存失败，请检查配置');}
        catch (e) {setError((e as Error).message);}
        finally {setBusy(false);}
    };
    const counts = progress?.captureCounts;
    return <>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between"><h4 className="inline-flex items-center gap-2 text-xs font-bold"><NotebookPen size={15} className="text-orange-600"/>随手记</h4><button type="button" onClick={configure} className="text-xs text-slate-500">配置</button></div><p className="mt-3 text-xs leading-5 text-slate-500">每周总共 {task?.randomCount || 3} 次机会，随机分给所选居民。没有新想法可以跳过。</p><p className="mt-2 text-xs text-slate-500">{counts ? `已记录 ${counts.recorded} · 已跳过 ${counts.skipped} · 待执行 ${Math.max(0, (progress?.targetCount || 0)-counts.recorded-counts.skipped)}` : '本机默认关闭 · 仅在一台设备开启自动执行'}</p>{progress?.configPending && <p className="mt-1 text-xs text-orange-600">新配置下周生效</p>}<div className="mt-3 flex gap-3 text-xs"><button type="button" disabled={!task?.id || busy} onClick={() => {if (task) void onSave({...task, enabled: !task.enabled});}} className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-700 disabled:opacity-40">{task?.enabled ? '本机已启用' : '本机已关闭'}</button><button type="button" disabled={!task?.id || running} onClick={() => task && onRun(task.id)} className="text-slate-500 disabled:opacity-40">{running ? '执行中…' : '手动试记一次'}</button></div></div>
        {open && <div data-modal-scroll-lock role="dialog" aria-modal="true" aria-label="随手记设置" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4" onClick={() => setOpen(false)}><section onClick={event => event.stopPropagation()} className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"><header className="flex justify-between border-b border-slate-100 p-5"><h3 className="font-bold">随手记设置</h3><button type="button" aria-label="关闭随手记设置" onClick={() => setOpen(false)}><X size={18}/></button></header><div className="scrollbar-hide space-y-5 overflow-y-auto p-5"><div><label htmlFor="capture-count" className="mb-2 block text-sm font-medium">每周总机会数</label><input id="capture-count" type="number" min={1} max={10000} value={count} onChange={event => setCount(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 p-3 text-sm"/><p className="mt-2 text-xs text-slate-500">增加居民不会增加总量。主动跳过也会消耗一次机会。</p></div><fieldset><legend className="mb-2 text-sm font-medium">参与居民</legend><div className="grid grid-cols-2 gap-2">{agents.map(agent => <label key={agent.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={participants.includes(agent.id)} onChange={event => setParticipants(current => event.target.checked ? [...current, agent.id] : current.filter(id => id !== agent.id))}/>{agent.name}</label>)}</div></fieldset><div><label className="mb-2 block text-sm font-medium">执行模型</label><Select menuPortal value={model} options={[{value: '', label: '沿用各居民模型'}, ...models]} onChange={setModel}/></div><div><label htmlFor="capture-prompt" className="mb-2 block text-sm font-medium">补充偏好（可选）</label><textarea id="capture-prompt" rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：更喜欢具体的小发现，少写抽象感悟。" className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm"/></div>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</div><footer className="border-t border-slate-100 p-5"><button type="button" disabled={busy} onClick={() => void save()} className="w-full rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? '保存中…' : '保存配置'}</button></footer></section></div>}
    </>;
}
