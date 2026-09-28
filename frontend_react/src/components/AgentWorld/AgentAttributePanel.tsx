import {useEffect, useState} from 'react';
import type {AgentRelationEdge, AgentRelationGraph, AgentRelationNode} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';
import WorldDialog from './WorldDialog';
import {ChevronDown, MessageSquare, CalendarDays, FileText, Sparkles, Wallet, Battery} from 'lucide-react';
import ProfessionBadge from './ProfessionBadge';

interface AgentAttributePanelProps {
    graph: AgentRelationGraph | null;
    loading: boolean;
    error: string;
    selectedAgentId: string;
    onClose: () => void;
}

interface RelationRow {
    name: string;
    tier: string;
    mine: number;
    theirs: number;
}

const relationsFor = (agentId: string, edges: AgentRelationEdge[]): RelationRow[] => edges.flatMap(edge => {
    if (edge.sourceId === agentId) {
        return [{name: edge.targetName, tier: edge.tier, mine: edge.sourceScore, theirs: edge.targetScore}];
    }
    if (edge.targetId === agentId) {
        return [{name: edge.sourceName, tier: edge.tier, mine: edge.targetScore, theirs: edge.sourceScore}];
    }
    return [];
});

function AttributeRow({node, relations, expanded, onToggle}: {
    node: AgentRelationNode;
    relations: RelationRow[];
    expanded: boolean;
    onToggle: () => void;
}) {
    const stamina = node.stamina == null ? null : Number(node.stamina);
    const energy = stamina != null && Number.isFinite(stamina) ? Math.max(0, Math.min(100, stamina)) : null;
    return (
        <div className={`overflow-hidden rounded-2xl border transition-colors ${expanded ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200 bg-white hover:border-orange-200'}`}>
            <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400">
                <span className="flex items-center gap-3">
                    <AgentAvatar name={node.name} avatar={node.avatar} size="md"/>
                    <span className="min-w-0 flex-1 space-y-1 block">
                        <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate text-sm font-semibold text-slate-800">{node.name}</span>
                            <ProfessionBadge professionName={node.professionName} size="sm" showEmpty={true} emptyText="无职业"/>
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className={`h-1.5 w-1.5 rounded-full ${node.status === 'running' ? 'bg-lime-500 ring-2 ring-lime-200/60' : 'bg-slate-300'}`}/>
                            {node.status === 'running' ? '正在活动' : '休息中'}
                        </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
                </span>
                <span className="mt-5 flex items-end justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500"><Sparkles className="h-3.5 w-3.5 text-orange-500"/>创作力</span>
                    <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-800">{node.creativity}<span className="ml-1 text-[11px] font-normal text-slate-400">/ 100</span></span>
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-orange-400" style={{width: `${Math.max(0, Math.min(100, node.creativity))}%`}}/>
                </span>
                <span className="mt-4 flex items-end justify-between" title="每小时恢复 5 点，成功评论并打分消耗 10 点">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500"><Battery className="h-3.5 w-3.5 text-lime-600"/>体力</span>
                    <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-800">{energy == null ? '—' : Number(energy.toFixed(1))}<span className="ml-1 text-[11px] font-normal text-slate-400">/ 100</span></span>
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${node.name}的体力`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy ?? undefined}>
                    <span className={`block h-full rounded-full ${energy != null && energy < 10 ? 'bg-rose-400' : 'bg-lime-500'}`} style={{width: `${energy ?? 0}%`}}/>
                </span>
                <span className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3">
                    {[{label: '发帖', value: node.postCount, icon: FileText}, {label: '获评', value: node.ratedPostCount, icon: MessageSquare}, {label: '活跃天数', value: node.activeDays, icon: CalendarDays}].map(({label, value, icon: Icon}) => (
                        <span key={label} className="flex flex-col items-center gap-1.5"><span className="text-base font-semibold tabular-nums text-slate-700">{value}</span><span className="flex items-center gap-1 text-[10px] text-slate-500"><Icon className="h-3 w-3"/>{label}</span></span>
                    ))}
                </span>
                <span className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-orange-700"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600"><Wallet className="h-3.5 w-3.5"/></span><span className="truncate">金钱余额</span></span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums tracking-tight text-slate-800">¥{Number(node.money).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </span>
                <span className="mt-4 flex items-center justify-between text-[11px]"><span className="text-slate-400">{relations.length ? `${relations.length} 位互动居民` : '暂无互动记录'}</span><span className="text-orange-600">{expanded ? '收起好感' : '查看好感'}</span></span>
            </button>
            {expanded ? (
                <div className="border-t border-orange-100 px-3 py-2">
                    {relations.length ? relations.map(relation => (
                        <div key={relation.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-slate-600">
                            <span className="min-w-0 truncate font-medium text-slate-800">{relation.name}</span>
                            <span className="shrink-0 text-right">
                                <span className="mr-2 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-orange-700">{relation.tier}</span>
                                我对 TA {relation.mine} · TA 对我 {relation.theirs}
                            </span>
                        </div>
                    )) : <p className="py-2 text-xs text-slate-400">最近 30 天还没有和其他居民互动。</p>}
                </div>
            ) : null}
        </div>
    );
}

export default function AgentAttributePanel({graph, loading, error, selectedAgentId, onClose}: AgentAttributePanelProps) {
    const [expandedId, setExpandedId] = useState(selectedAgentId);

    useEffect(() => {
        setExpandedId(selectedAgentId);
    }, [selectedAgentId]);

    const nodes = [...(graph?.nodes || [])].sort((left, right) => {
        if (left.id === selectedAgentId) return -1;
        if (right.id === selectedAgentId) return 1;
        return right.creativity - left.creativity;
    });

    return (
        <WorldDialog title="居民属性" description="创作与互动按近 30 天统计，并显示当前体力与金钱余额。" onClose={onClose}>
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在计算属性...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && !nodes.length ? <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p> : null}
            {!loading && !error && nodes.length ? <div className="mb-4 flex items-center justify-between text-xs text-slate-500"><span><b className="text-slate-800">{nodes.length}</b> 位居民 · 按创作力排列</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px]">最近 30 天</span></div> : null}
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!loading && !error ? nodes.map(node => (
                    <AttributeRow
                        key={node.id}
                        node={node}
                        relations={relationsFor(node.id, graph?.edges || [])}
                        expanded={expandedId === node.id}
                        onToggle={() => setExpandedId(current => current === node.id ? '' : node.id)}
                    />
                )) : null}
            </div>
        </WorldDialog>
    );
}
