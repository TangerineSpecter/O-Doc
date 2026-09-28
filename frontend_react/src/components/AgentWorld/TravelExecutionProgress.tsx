import type {AgentRunRecordConfig} from '../../types/api/setting';

const time = (value: string | null) => value ? new Date(value).toLocaleTimeString('zh-CN', {hour12: false}) : '待安排';

export function TravelExecutionProgress({progress}: {progress: NonNullable<AgentRunRecordConfig['travelProgress']>}) {
    return <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-xs leading-6 text-slate-600">
        <p>最近推进：{time(progress.updatedAt)} · 当前节点已失败 {progress.attempts} 次</p>
        <p>{progress.status === 'waiting' ? `等待自动重试，下次尝试：${time(progress.nextAt)}` : progress.status === 'manual' ? '已停止自动重试，请在旅行详情中查看原因并人工恢复。' : progress.status === 'paused' ? '旅行已暂停，请在旅行详情中恢复。' : progress.status === 'active' ? `下一节点预计：${time(progress.nextAt)}（正在处理时可能延后）` : '旅行已结束。'}</p>
        {!progress.authorized && <p>本机没有执行授权，请在旅行详情中手动恢复。</p>}
        <p>每 10 秒刷新。服务停止期间不会推进；同一设备重启后按已保存节点恢复。</p>
    </div>;
}
