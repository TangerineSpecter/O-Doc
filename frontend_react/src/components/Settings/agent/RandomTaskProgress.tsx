import type {AgentTaskRandomProgress} from '@/types/api/setting';

const statusLabels = {scheduled: '等待随机执行', running: '执行中', retrying: '等待补执行', complete: '本周期已完成'};

export function RandomTaskProgress({progress, enabled}: {progress?: AgentTaskRandomProgress | null; enabled: boolean}) {
    if (!progress) return null;
    return <div className="mt-2 space-y-1 text-xs text-slate-600">
        <p>{enabled ? (progress.status === 'complete' && progress.agents.some(agent => agent.unavailable) ? '本周期调度结束' : statusLabels[progress.status]) : '已暂停'} · {progress.mode === 'parallel' ? `每个 Agent ${progress.targetCount} 次` : `任务合计 ${progress.targetCount} 次`}</p>
        {progress.agents.map(agent => <p key={agent.agentId}>{agent.agentName}：{agent.successCount} / {agent.target} 次成功{agent.unavailable ? ' · 已跳过（Agent 已删除）' : ''}</p>)}
        {enabled && progress.nextExecutionAt && progress.status !== 'running' && <p>下次{progress.status === 'retrying' ? '补执行' : '执行'}：{new Date(progress.nextExecutionAt).toLocaleString('zh-CN')}</p>}
        {progress.configPending && <p className="text-orange-600">配置变更将在下周期生效</p>}
    </div>;
}
