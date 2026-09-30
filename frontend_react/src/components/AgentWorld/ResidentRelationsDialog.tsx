import type {AgentRelationNode} from '../../types/api/setting';
import type {ResidentRelation} from '../../utils/agentRelations';
import AgentAvatar from './AgentAvatar';
import WorldDialog from './WorldDialog';

export default function ResidentRelationsDialog({agent, relations, onClose}: {agent: AgentRelationNode; relations: ResidentRelation[]; onClose: () => void}) {
    return <WorldDialog title={`${agent.name}的互动`} description="查看关联居民、关系与各自的好感。" size="compact" fixedHeight={false} onClose={onClose}>
        <div className="flex max-h-[65vh] min-h-0 flex-col">
            <div className="mb-4 flex shrink-0 items-center gap-3 rounded-xl bg-slate-50 p-3"><AgentAvatar name={agent.name} avatar={agent.avatar}/><div><p className="text-sm font-semibold text-slate-800">{agent.name}</p><p className="mt-1 text-xs text-slate-400">{relations.length} 位关联参与者</p></div></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-hide">{relations.map(row => <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-3"><AgentAvatar name={row.name} avatar={row.avatar}/><strong className="min-w-0 flex-1 truncate text-sm text-slate-800">{row.name}</strong><span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-700">{row.tier}</span></div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{agent.name} → {row.name}：<b className="font-semibold text-slate-700">{row.mine ?? '未形成'}</b></span>{!row.isUser && <span>{row.name} → {agent.name}：<b className="font-semibold text-slate-700">{row.theirs ?? '未形成'}</b></span>}</div>
                {row.isUser && <p className="mt-2 text-[11px] text-slate-400">仅记录居民对用户的感受。</p>}
            </div>)}{!relations.length && <p className="py-16 text-center text-sm text-slate-400">还没有形成互动关系。</p>}</div>
        </div>
    </WorldDialog>;
}
