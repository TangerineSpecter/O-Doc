import {ChevronDown, ChevronUp, Plus, X} from 'lucide-react';
import {useState} from 'react';
import type {DecisionConnection, DecisionFailoverState} from '../../types/api/decision';
import {Select} from '../common/Select';
import {formatStickyUntil, MAX_DECISION_FAILOVER, STICKY_TTL_OPTIONS} from './decisionFailover';

interface DecisionFailoverEditorProps {
    connections: DecisionConnection[];
    primaryId: string;
    backupIds: string[];
    ttlSeconds: string;
    failover: DecisionFailoverState | null;
    disabled?: boolean;
    onBackupIdsChange: (ids: string[]) => void;
    onTtlChange: (seconds: string) => void;
}

function connectionName(connections: DecisionConnection[], id: string) {
    return connections.find(connection => connection.id === id)?.name || `不可用连接（${id}）`;
}

export function DecisionFailoverEditor({
    connections, primaryId, backupIds, ttlSeconds, failover, disabled = false, onBackupIdsChange, onTtlChange,
}: DecisionFailoverEditorProps) {
    const [pending, setPending] = useState('');
    const used = new Set([primaryId, ...backupIds]);
    const available = connections.filter(connection => !used.has(connection.id));
    const pendingValue = available.some(connection => connection.id === pending) ? pending : (available[0]?.id || '');
    const stickyName = failover?.stickyConnectionId ? connectionName(connections, failover.stickyConnectionId) : '';
    const atLimit = backupIds.length + 1 >= MAX_DECISION_FAILOVER;

    const move = (index: number, delta: number) => {
        const next = index + delta;
        if (next < 0 || next >= backupIds.length) return;
        const copy = [...backupIds];
        [copy[index], copy[next]] = [copy[next], copy[index]];
        onBackupIdsChange(copy);
    };

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
                <p className="text-xs font-semibold text-slate-700">故障转移与暂时沿用</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                    主模型挂起、超时或返回无效结果时，按顺序尝试备用模型。每个模型单独最多等 60 秒，不占用后面的模型，也不占用普通文本回退的 60 秒。备用一旦成功，这台设备会暂时改用它，避免主模型停几小时时每个日程都先白等一轮。到期后自动回到主模型。
                </p>
            </div>
            <p role="status" className={`rounded-lg border px-3 py-2 text-xs leading-5 ${failover?.stickyConnectionId ? 'border-lime-200 bg-lime-50 text-lime-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                {failover?.stickyConnectionId && failover.stickyUntil
                    ? `当前暂时沿用「${stickyName}」，${formatStickyUntil(failover.stickyUntil)} 后重新从主模型开始。这个状态只在本机，不随 WebDAV 同步。`
                    : '当前从主决策模型开始。还没有需要暂时沿用的备用模型。'}
            </p>
            <ol className="space-y-2">
                <li className="flex items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-2">
                    <span className="w-4 text-xs font-semibold text-orange-700">1</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{connectionName(connections, primaryId)}</span>
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">主模型</span>
                </li>
                {backupIds.map((id, index) => {
                    const name = connectionName(connections, id);
                    return (
                        <li key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <span className="w-4 text-xs font-semibold text-slate-400">{index + 2}</span>
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{name}</span>
                            <div className="flex flex-wrap gap-1.5">
                                <button type="button" aria-label={`上移${name}`} disabled={disabled || index === 0} onClick={() => move(index, -1)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:text-orange-600 disabled:opacity-40"><ChevronUp className="h-3.5 w-3.5"/>上移</button>
                                <button type="button" aria-label={`下移${name}`} disabled={disabled || index === backupIds.length - 1} onClick={() => move(index, 1)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:text-orange-600 disabled:opacity-40"><ChevronDown className="h-3.5 w-3.5"/>下移</button>
                                <button type="button" aria-label={`移除${name}`} disabled={disabled} onClick={() => onBackupIdsChange(backupIds.filter(item => item !== id))} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"><X className="h-3.5 w-3.5"/>移除</button>
                            </div>
                        </li>
                    );
                })}
            </ol>
            {available.length > 0 && !atLimit ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                        <Select menuPortal value={pendingValue} options={available.map(connection => ({value: connection.id, label: connection.name, description: connection.modelId}))} onChange={setPending} placeholder="选择备用决策模型" disabled={disabled}/>
                    </div>
                    <button type="button" disabled={disabled || !pendingValue} onClick={() => onBackupIdsChange([...backupIds, pendingValue])} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"><Plus className="h-3.5 w-3.5"/>加入备用</button>
                </div>
            ) : (
                <p className="text-xs leading-5 text-slate-500">{atLimit ? `最多 ${MAX_DECISION_FAILOVER} 个决策模型，含主模型。` : '在 AI 模型接入 → 决策模型连接中再添加一个本地模型，就可以排进备用顺序。'}</p>
            )}
            <label className="block space-y-2 text-sm font-semibold text-slate-700">
                <span>暂时沿用时间</span>
                <Select menuPortal value={ttlSeconds} options={STICKY_TTL_OPTIONS.map(option => ({value: option.value, label: option.label, description: option.description}))} onChange={onTtlChange} disabled={disabled}/>
            </label>
        </div>
    );
}
