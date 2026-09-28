import { Download, X, AlertTriangle, FileCode } from 'lucide-react';
import { useEscapeDismissal } from '@/hooks/useEscapeDismissal';
import type { LogDetail } from '@/types/systemLogs';

const labels: Record<string, string> = {
    module: '来源模块',
    errorType: '异常类型',
    reason: '异常原因',
    exceptionClass: '异常类',
    httpStatus: 'HTTP 状态',
    providerCode: '提供商错误码',
    businessCode: '业务错误码',
    providerName: '提供商',
    modelName: '模型',
    modelRole: '模型用途',
    operation: '操作 / 阶段',
    path: '请求路径',
    durationMs: '耗时（毫秒）',
    attempt: '请求尝试次数',
    sdkRetries: 'SDK 重试上限',
    requestId: '请求 ID',
    modelRequestId: '模型请求 ID',
    resourceId: '资源 ID',
    taskId: '任务 ID',
    agentId: 'Agent ID',
    bookId: '图书 ID',
    userId: '用户 ID',
    captures: '关联记录次数',
    lostEvents: '未能采集的事件数',
    logger: '记录模块',
};

export function SystemLogDetail({
    detail,
    busy,
    onClose,
    onDownload,
}: {
    detail: LogDetail;
    busy: boolean;
    onClose: () => void;
    onDownload: () => void;
}) {
    useEscapeDismissal(true, onClose);

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* 半透明背景 */}
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" />

            {/* 弹窗容器 */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="异常日志明细"
                className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                onClick={event => event.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="break-words text-base font-bold text-slate-800 leading-snug">
                                {detail.title}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400 font-mono">
                                记录时间：{new Date(detail.created * 1000).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <button
                        aria-label="关闭详情"
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600 shrink-0"
                        autoFocus
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="space-y-5 overflow-y-auto p-6">
                    {/* 键值元信息 */}
                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                            上下文属性
                        </h4>
                        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {Object.entries(labels)
                                .filter(
                                    ([key]) =>
                                        detail[key] !== undefined &&
                                        detail[key] !== null &&
                                        detail[key] !== ''
                                )
                                .map(([key, label]) => (
                                    <div
                                        key={key}
                                        className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition-colors hover:border-slate-200"
                                    >
                                        <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
                                        <dd className="mt-1 break-words font-mono text-xs text-slate-800">
                                            {String(detail[key])}
                                        </dd>
                                    </div>
                                ))}
                        </dl>
                    </div>

                    {/* 异常堆栈 */}
                    {Boolean(detail.stack) && (
                        <div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                                <FileCode className="h-3.5 w-3.5 text-orange-500" />
                                <span>异常调用堆栈</span>
                            </div>
                            <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-6 text-slate-200 shadow-inner selection:bg-orange-500/40">
                                {String(detail.stack)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
                    <button
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        onClick={onClose}
                    >
                        关闭
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                        disabled={busy}
                        onClick={onDownload}
                    >
                        <Download className="h-3.5 w-3.5" />
                        下载明细
                    </button>
                </div>
            </div>
        </div>
    );
}
