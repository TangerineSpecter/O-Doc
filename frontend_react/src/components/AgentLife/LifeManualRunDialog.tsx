import {useEffect, useState} from 'react';
import type {AgentConfig} from '../../types/api/setting';
import {getLifeConfig, runLifeActivity} from '../../api/agentLife';
import {Select} from '../common/Select';
import {useToast} from '../common/ToastProvider';
import WorldDialog from '../AgentWorld/WorldDialog';

export default function LifeManualRunDialog({taskId, agents, onClose}: {
    taskId: string;
    agents: AgentConfig[];
    onClose: () => void;
}) {
    const toast = useToast();
    const [eligible, setEligible] = useState<AgentConfig[]>([]);
    const [actorId, setActorId] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        getLifeConfig(controller.signal).then(config => {
            if (!controller.signal.aborted) {
                setEligible(agents.filter(agent =>
                    (config.activeAgentIds || config.settings.agentIds).includes(agent.id)
                    && !config.pausedAgents.includes(agent.id)));
            }
        }).catch(error => {
            if (!controller.signal.aborted) setError(error.message || '居民加载失败');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [agents]);

    const run = async () => {
        if (loading || submitting || !eligible.some(agent => agent.id === actorId)) return;
        setSubmitting(true);
        setError('');
        try {
            await runLifeActivity(taskId, actorId);
            const name = eligible.find(agent => agent.id === actorId)?.name || '居民';
            toast.success(`${name}的活动已启动，可在每日活动查看进展`);
            onClose();
        } catch (error) {
            setError(error instanceof Error ? error.message : '启动失败');
        } finally {
            setSubmitting(false);
        }
    };

    return <WorldDialog title="手动执行活动" onClose={onClose}>
        <div className="space-y-4 p-6">
            <p className="text-sm text-slate-500">指定执行居民，仍读取其生活目标与后续资金预留。</p>
            <Select menuPortal value={actorId} placeholder="选择居民"
                options={eligible.map(agent => ({value: agent.id, label: agent.name}))}
                onChange={value => {if (!submitting) setActorId(value);}}/>
            {!loading && !eligible.length && <p className="text-sm text-slate-500">暂无可执行居民，请先在统一生活设置中配置。</p>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="button" disabled={loading || submitting || !eligible.some(agent => agent.id === actorId)}
                aria-busy={submitting} onClick={() => void run()}
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">
                {loading ? '加载中…' : submitting ? '正在提交…' : '开始执行'}
            </button>
        </div>
    </WorldDialog>;
}
