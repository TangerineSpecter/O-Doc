import {useEffect, useState} from 'react';
import type {AgentConfig} from '../../types/api/setting';
import {getLifeConfig, runLifeActivity} from '../../api/agentLife';
import {Select} from '../common/Select';
import WorldDialog from '../AgentWorld/WorldDialog';
export default function LifeManualRunDialog({taskId, agents, onClose}: {taskId: string; agents: AgentConfig[]; onClose: () => void}) {
    const [eligible, setEligible] = useState<AgentConfig[]>([]);
    const [actorId, setActorId] = useState('');
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {const c = new AbortController(); getLifeConfig(c.signal).then(config => {if (!c.signal.aborted) setEligible(agents.filter(a => (config.activeAgentIds || config.settings.agentIds).includes(a.id) && !config.pausedAgents.includes(a.id)));}).catch(e => {if (!c.signal.aborted) setError(e.message || '居民加载失败');}).finally(() => {if (!c.signal.aborted) setBusy(false);}); return () => c.abort();}, [agents]);
    const run = async () => {setBusy(true); try {await runLifeActivity(taskId, actorId); onClose();} catch(e) {setError(e instanceof Error ? e.message : '启动失败');} finally {setBusy(false);}};
    return <WorldDialog title="手动执行活动" onClose={onClose}><div className="space-y-4 p-6"><p className="text-sm text-slate-500">指定执行居民，仍读取其生活目标与后续资金预留。</p><Select menuPortal value={actorId} placeholder="选择居民" options={eligible.map(a => ({value: a.id, label: a.name}))} onChange={setActorId}/>{!busy && !eligible.length && <p className="text-sm text-slate-500">暂无可执行居民，请先在统一生活设置中配置。</p>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button type="button" disabled={busy || !actorId} onClick={() => void run()} className="rounded-xl bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">开始执行</button></div></WorldDialog>;
}
