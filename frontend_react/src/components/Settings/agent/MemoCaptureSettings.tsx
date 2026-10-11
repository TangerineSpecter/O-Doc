import {useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {Checkbox} from '@/components/common/Checkbox';
import {BuiltinPostTaskCard} from './BuiltinPostTaskCard';
import {RandomTaskNumberInput} from './RandomTaskNumberInput';
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
        <BuiltinPostTaskCard
            task={task || defaultMemoCaptureTask}
            agentNames={agents.filter(agent => task?.agents?.includes(agent.id)).map(agent => agent.name)}
            running={running}
            onConfigure={configure}
            onToggle={() => {if (task) void onSave({...task, enabled: !task.enabled});}}
            toggleDisabled={busy}
            onRun={() => {if (task) onRun(task.id);}}
            description={`每周总共 ${task?.randomCount || 3} 次机会，随机分给所选居民。没有新想法可以跳过。`}
            details={<>
                {counts ? (
                    <dl aria-label="本周随手记执行统计" className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] leading-4">
                        <div className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/60 px-2 py-1">
                            <dt className="text-emerald-700">已记录</dt>
                            <dd className="font-semibold tabular-nums text-emerald-700">{counts.recorded}</dd>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200/70 bg-slate-50 px-2 py-1">
                            <dt className="text-slate-500">已跳过</dt>
                            <dd className="font-semibold tabular-nums text-slate-600">{counts.skipped}</dd>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-md border border-orange-100 bg-orange-50/60 px-2 py-1">
                            <dt className="text-orange-700">待执行</dt>
                            <dd className="font-semibold tabular-nums text-orange-700">{Math.max(0, (progress?.targetCount || 0) - counts.recorded - counts.skipped)}</dd>
                        </div>
                    </dl>
                ) : <p className="mt-2 text-[11px] leading-relaxed text-slate-500">本机默认关闭 · 仅在一台设备开启自动执行</p>}
                {progress?.configPending && <p className="mt-1 text-[11px] text-orange-600">新配置下周生效</p>}
            </>}
        />
        {open && createPortal(
            <div data-modal-scroll-lock role="dialog" aria-modal="true" aria-label="随手记设置" className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4" onClick={() => setOpen(false)}>
                <section onClick={event => event.stopPropagation()} className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <header className="flex items-center justify-between border-b border-slate-100 p-5">
                        <h3 className="font-bold text-slate-800">随手记设置</h3>
                        <button type="button" aria-label="关闭随手记设置" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"><X size={18}/></button>
                    </header>
                    <div className="scrollbar-hide space-y-5 overflow-y-auto p-5">
                        <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">每周总机会数</p>
                            <RandomTaskNumberInput ariaLabel="每周总机会数" min={1} max={10000} value={count} onChange={value => setCount(Number(value))} className="h-10"/>
                            <p className="mt-2 text-xs text-slate-500">增加居民不会增加总量。主动跳过也会消耗一次机会。</p>
                        </div>
                        <fieldset>
                            <legend className="mb-2 text-sm font-medium text-slate-700">参与居民</legend>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {agents.map(agent => (
                                    <Checkbox
                                        key={agent.id}
                                        checked={participants.includes(agent.id)}
                                        onChange={checked => setParticipants(current => checked ? [...current, agent.id] : current.filter(id => id !== agent.id))}
                                        label={agent.name}
                                        className="flex min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 hover:border-orange-200"
                                        labelClassName="break-words"
                                    />
                                ))}
                            </div>
                        </fieldset>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">执行模型</label>
                            <Select menuPortal value={model} options={[{value: '', label: '沿用各居民模型'}, ...models]} onChange={setModel}/>
                        </div>
                        <div>
                            <label htmlFor="capture-prompt" className="mb-2 block text-sm font-medium text-slate-700">补充偏好（可选）</label>
                            <textarea id="capture-prompt" rows={3} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：更喜欢具体的小发现，少写抽象感悟。" className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                        </div>
                        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                    </div>
                    <footer className="border-t border-slate-100 p-5">
                        <button type="button" disabled={busy} onClick={() => void save()} className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-40">{busy ? '保存中…' : '保存配置'}</button>
                    </footer>
                </section>
            </div>,
            document.body,
        )}
    </>;
}
