import { Download, X } from 'lucide-react';
import { useEscapeDismissal } from '@/hooks/useEscapeDismissal';
import type { LogDetail } from '@/types/systemLogs';

const labels: Record<string, string> = {
    module: '来源模块', errorType: '异常类型', reason: '异常原因', exceptionClass: '异常类',
    httpStatus: 'HTTP 状态', providerCode: '提供商错误码', businessCode: '业务错误码',
    providerName: '提供商', modelName: '模型', modelRole: '模型用途', operation: '操作 / 阶段',
    path: '请求路径', durationMs: '耗时（毫秒）', attempt: '请求尝试次数', sdkRetries: 'SDK 重试上限',
    requestId: '请求 ID', modelRequestId: '模型请求 ID', resourceId: '资源 ID', taskId: '任务 ID',
    agentId: 'Agent ID', bookId: '图书 ID', userId: '用户 ID', captures: '关联记录次数', lostEvents: '未能采集的事件数', logger: '记录模块',
};
export function SystemLogDetail({ detail, busy, onClose, onDownload }: {
    detail: LogDetail; busy: boolean; onClose: () => void; onDownload: () => void;
}) {
    useEscapeDismissal(true, onClose);
    return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="异常日志明细" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="break-words font-semibold text-slate-900">{detail.title}</h3><p className="mt-1 text-xs text-slate-400">{new Date(detail.created * 1000).toLocaleString()}</p></div><button aria-label="关闭详情" className="shrink-0" autoFocus onClick={onClose}><X className="h-5 w-5" /></button></div>
            <div className="my-4 overflow-auto"><dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">{Object.entries(labels).filter(([key]) => detail[key] !== undefined && detail[key] !== null && detail[key] !== '').map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-700">{String(detail[key])}</dd></div>)}</dl>
                {Boolean(detail.stack) && <div className="mt-5"><h4 className="text-sm font-medium text-slate-700">异常堆栈</h4><pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-700">{String(detail.stack)}</pre></div>}
            </div>
            <button className="inline-flex items-center gap-1 self-end rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40" disabled={busy} onClick={onDownload}><Download className="h-4 w-4" />下载明细</button>
        </div>
    </div>;
}
