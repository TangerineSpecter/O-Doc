import type {BattleAppearanceImageTask} from '@/api/setting';

const stages: Record<string, string> = {
    submitting: '正在提交到生图服务', generating: '生图服务处理中',
    download_pending: '图片已生成，正在下载并保存', succeeded: '图片已生成',
    failed: '生成失败', submission_unknown: '无法确认服务商是否接收请求',
    cancelled: '已取消等待', timed_out: '等待已超时',
};
function duration(seconds: number) {
    return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}

type Props = {
    task: BattleAppearanceImageTask;
    active: boolean;
    cancelling: boolean;
    recovering: boolean;
    elapsedSeconds: number;
    waitLimit: number;
    queryError: string;
    lastCheckedAt: number | null;
    onCancel: () => void;
    onRecover: () => void;
    onLoad: () => void;
    loadedAssetId: string;
};

export function BattleHeadTaskStatus(props: Props) {
    const {task, active, cancelling, recovering, elapsedSeconds, waitLimit, queryError, lastCheckedAt, onCancel, onRecover, onLoad, loadedAssetId} = props;
    return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{stages[task.status] || task.status}</span>
            {active && <button type="button" disabled={cancelling} onClick={onCancel} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{cancelling ? '正在取消…' : '取消任务'}</button>}
        </div>
        {active && <p className="mt-1 tabular-nums">已等待 {duration(elapsedSeconds)} · 最多等待 {Math.floor(waitLimit / 60)} 分钟</p>}
        {active && lastCheckedAt && <p className="mt-1 text-slate-400">最近查询：{new Date(lastCheckedAt).toLocaleTimeString()} · 自动查询间隔约 5 秒</p>}
        {(queryError || task.message) && <p className="mt-1 leading-5 text-amber-700">{queryError || task.message}{queryError && active ? ' 将继续查询同一任务，不会重新生图。' : ''}</p>}
        {active && <p className="mt-1 leading-5 text-slate-400">关闭窗口不会取消。取消会停止本地等待并允许重新生成，服务商可能仍继续处理或计费。</p>}
        {task.status === 'succeeded' && task.assetId && task.assetId !== loadedAssetId && <button type="button" onClick={onLoad} className="mt-1 font-semibold text-violet-700 underline">载入生成结果</button>}
        {task.status === 'timed_out' && <button type="button" disabled={recovering} onClick={onRecover} className="mt-2 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 font-semibold text-orange-700 disabled:opacity-50">{recovering ? '正在查询原任务…' : '查询原任务结果'}</button>}
    </div>;
}
