import {CheckCircle2, Edit2, Loader2, Wifi, X, XCircle} from 'lucide-react';
import type {DecisionConnection} from '../../types/api/decision';

export interface DecisionConnectionTestResult {
    success: boolean;
    message: string;
}

interface DecisionConnectionCardProps {
    connection: DecisionConnection;
    result?: DecisionConnectionTestResult;
    busy?: boolean;
    failoverLabel?: string;
    stickyLabel?: string;
    onTest: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}

export function DecisionConnectionCard({
    connection,
    result,
    busy,
    failoverLabel,
    stickyLabel,
    onTest,
    onEdit,
    onDelete,
}: DecisionConnectionCardProps) {
    const isSuccess = result?.success === true;

    return (
        <div className="group flex items-start justify-between gap-2.5 rounded-xl border border-slate-100 bg-slate-50/30 p-3 transition-all hover:border-orange-200 hover:bg-white hover:shadow-sm">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div
                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        connection.apiKeyConfigured
                            ? 'bg-emerald-500'
                            : 'bg-slate-300 group-hover:bg-orange-400'
                    }`}
                    title={connection.apiKeyConfigured ? 'API Key 已配置' : '未配置 API Key'}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-slate-700" title={`${connection.name} (${connection.modelId})`}>
                        {connection.name}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                            connection.protocol === 'systemone'
                                ? 'border-blue-100 bg-blue-50 text-blue-600'
                                : 'border-indigo-100 bg-indigo-50 text-indigo-600'
                        }`}>
                            {connection.protocol === 'systemone' ? (connection.id === 'jev' ? 'JEV' : 'System One') : 'JSON 决策'}
                        </span>
                        {connection.builtIn && (
                            <span className="shrink-0 whitespace-nowrap rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-500">
                                内置
                            </span>
                        )}
                        {failoverLabel && (
                            <span className="shrink-0 whitespace-nowrap rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-orange-700">
                                {failoverLabel}
                            </span>
                        )}
                        {stickyLabel && (
                            <span className="shrink-0 whitespace-nowrap rounded border border-lime-200 bg-lime-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-lime-700" title={stickyLabel}>
                                沿用中
                            </span>
                        )}
                        {result && (
                            <span
                                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium ${
                                    isSuccess ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                                title={result.message}
                            >
                                {isSuccess ? <CheckCircle2 className="h-3 w-3 shrink-0"/> : <XCircle className="h-3 w-3 shrink-0"/>}
                                <span>{isSuccess ? '正常' : '失败'}</span>
                            </span>
                        )}
                    </div>
                    {result && !isSuccess && (
                        <p role="alert" className="mt-2 break-words text-xs leading-5 text-rose-700">
                            {result.message}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {!connection.builtIn && onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        title="编辑连接"
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600"
                    >
                        <Edit2 className="h-3.5 w-3.5"/>
                    </button>
                )}
                <button
                    type="button"
                    onClick={onTest}
                    disabled={busy}
                    title={busy ? '检测中…' : '测试连接'}
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Wifi className="h-3.5 w-3.5"/>}
                </button>
                {!connection.builtIn && onDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        title="删除连接"
                        aria-label={`删除${connection.name}`}
                        className="rounded-md p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    >
                        <X className="h-3.5 w-3.5"/>
                    </button>
                )}
            </div>
        </div>
    );
}
