import {Activity, Edit2, KeyRound, Trash2, Wifi} from 'lucide-react';
import type {DecisionConnection} from '../../types/api/decision';

interface DecisionConnectionCardProps {
    connection: DecisionConnection;
    result?: string;
    busy?: boolean;
    failoverLabel?: string;
    stickyLabel?: string;
    onTest: () => void;
    onEdit?: () => void;
    onClearKey?: () => void;
    onDelete?: () => void;
}

const protocolName = (protocol: DecisionConnection['protocol']) =>
    protocol === 'systemone' ? 'JEV / TypeSafe System One' : 'OpenAI Chat + JSON 决策';

export function DecisionConnectionCard({connection, result, busy, failoverLabel, stickyLabel, onTest, onEdit, onClearKey, onDelete}: DecisionConnectionCardProps) {
    return (
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><Activity className="h-4 w-4"/></div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-800">{connection.name}</h4>
                        {connection.builtIn && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">内置</span>}
                        {failoverLabel && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">{failoverLabel}</span>}
                        {stickyLabel && <span className="rounded-md bg-lime-50 px-2 py-0.5 text-[10px] font-semibold text-lime-700">{stickyLabel}</span>}
                        <span className={`text-[11px] ${connection.apiKeyConfigured ? 'text-lime-700' : 'text-slate-400'}`}>
                            {connection.apiKeyConfigured ? 'API Key 已配置' : 'API Key 未配置'}
                        </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{connection.modelId} · {connection.baseUrl}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{protocolName(connection.protocol)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} onClick={onTest} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-orange-200 hover:text-orange-600 disabled:opacity-50"><Wifi className="h-3.5 w-3.5"/>{busy ? '检测中…' : '测试连接'}</button>
                    {!connection.builtIn && onEdit && <button type="button" onClick={onEdit} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-orange-600"><Edit2 className="h-3.5 w-3.5"/>编辑</button>}
                    {!connection.builtIn && onClearKey && connection.apiKeyConfigured && <button type="button" onClick={onClearKey} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600"><KeyRound className="h-3.5 w-3.5"/>清除密钥</button>}
                    {!connection.builtIn && onDelete && <button type="button" onClick={onDelete} aria-label={`删除${connection.name}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/>删除</button>}
                </div>
            </div>
            {result && <p role="status" className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">{result}</p>}
        </article>
    );
}
