import {fullRoleText} from '@/utils/agentRole';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {ArchiveRestore, ChevronLeft} from 'lucide-react';
import type {AgentConfig} from '@/types/api/setting';
import WorldDialog from '@/components/AgentWorld/WorldDialog';
import AgentAvatar from '@/components/AgentWorld/AgentAvatar';
import ConfirmationModal from '@/components/common/ConfirmationModal';

interface Props {
    agents: AgentConfig[];
    focusId?: string | null;
    onRestore: (id: string) => Promise<boolean>;
    onClose: () => void;
}

export function AgentArchiveDialog({agents, focusId, onRestore, onClose}: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(focusId || null);
    const [restoreId, setRestoreId] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);
    const selected = agents.find(agent => agent.id === selectedId);
    const restoreTarget = agents.find(agent => agent.id === restoreId);

    return <WorldDialog title="归档居民" description="资料与资产仍保留，归档期间不执行任务。恢复后继续未来任务，不补跑错过的机会。" onClose={onClose} size="wide">
        <div className="min-h-0 space-y-4">
            {!agents.length ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">暂无归档居民。</p> : null}
            {selected ? <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <button type="button" onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-orange-600"><ChevronLeft className="h-4 w-4"/>返回归档列表</button>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3"><AgentAvatar name={selected.name} avatar={selected.avatar} size="md"/><div className="min-w-0"><h3 className="break-words font-bold text-slate-800">{selected.name}</h3><p className="mt-1 text-xs text-slate-500">已归档 · {selected.archivedAt ? new Date(selected.archivedAt).toLocaleString('zh-CN') : ''}</p></div></div>
                    <button type="button" onClick={() => setRestoreId(selected.id)} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600">恢复居民</button>
                </div>
                <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2"><div><dt className="text-slate-400">模型</dt><dd className="mt-1 break-words text-slate-700">{selected.modelDetail?.name || '未配置'}</dd></div><div><dt className="text-slate-400">职业 / 余额</dt><dd className="mt-1 text-slate-700">{selected.professionName || '未配置'} · {selected.money}</dd></div><div><dt className="text-slate-400">MCP / 技能</dt><dd className="mt-1 text-slate-700">{selected.mcpServers.length} 个 MCP · {selected.skills.length} 个技能</dd></div><div><dt className="text-slate-400">飞书配置</dt><dd className="mt-1 text-slate-700">{selected.feishuImEnabled ? '已保留，恢复后启用' : '未开启'}</dd></div></dl>
                <div><p className="text-xs text-slate-400">角色设定</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{fullRoleText(selected.name, selected.roleProfile || {}, selected.prompt)}</p></div>
                <p className="text-xs text-slate-400">任务绑定、记忆、历史关系及资产保留在原居民名下。归档时的挂牌已下架，恢复后须重新上架。</p>
            </div> : agents.map(agent => <article key={agent.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <AgentAvatar name={agent.name} avatar={agent.avatar} size="md"/>
                <button type="button" onClick={() => setSelectedId(agent.id)} className="min-w-0 flex-1 text-left"><span className="block break-words text-sm font-bold text-slate-800">{agent.name}</span><span className="mt-1 block text-xs text-slate-400">已归档 · 点击查看资料</span></button>
                <button type="button" onClick={() => setRestoreId(agent.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-600 hover:bg-orange-100"><ArchiveRestore className="h-4 w-4"/>恢复</button>
            </article>)}
        </div>
        {restoreTarget && createPortal(<ConfirmationModal isOpen title={`恢复 ${restoreTarget.name}`} description="恢复后沿用原配置执行未来任务，原有暂停状态保持，错过的机会不补跑；挂牌保持下架。" confirmText="恢复居民" type="warning" isLoading={restoring} onClose={() => setRestoreId(null)} onConfirm={async () => {
            setRestoring(true);
            try {if (await onRestore(restoreTarget.id)) {setRestoreId(null); setSelectedId(null);}} finally {setRestoring(false);}
        }}/>, document.body)}
    </WorldDialog>;
}
