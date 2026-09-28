import type {AgentTaskConfig} from '@/types/api/setting';

export function SystemTaskProgress({progress}: {progress?: AgentTaskConfig['worldProgress']}) {
    if (!progress) return null;
    return <div className="mt-2 space-y-1 text-xs text-slate-500">
        {progress.targetCount != null && <p>已处理 {progress.processedCount} / {progress.targetCount} 次机会 · 错过 {progress.missedCount} 次</p>}
        {progress.nextExecutionAt && <p>下次机会：{new Date(progress.nextExecutionAt).toLocaleString('zh-CN')}</p>}
        {progress.configPending && <p className="text-orange-600">周期与次数将在下周期生效</p>}
    </div>;
}
