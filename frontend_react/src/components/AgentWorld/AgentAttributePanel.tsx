import {useEffect, useState} from 'react';
import type {AgentRelationEdge, AgentRelationGraph, AgentRelationNode} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';
import WorldDialog from './WorldDialog';

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
    return (
        <div className={`rounded-xl border ${expanded ? 'border-orange-200 bg-orange-50/40' : 'border-slate-100 bg-white'}`}>
            <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                <AgentAvatar name={node.name} avatar={node.avatar} size="sm"/>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{node.name}</span>
                        <span className="text-sm font-bold text-orange-600">{node.creativity}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-orange-100">
                        <span className="block h-full rounded-full bg-orange-400" style={{width: `${Math.max(0, Math.min(100, node.creativity))}%`}}/>
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                        近 30 天发帖 {node.postCount} · 获评 {node.ratedPostCount} · 活跃 {node.activeDays} 天
                    </span>
                </span>
            </button>
            {expanded ? (
                <div className="border-t border-orange-100 px-3 py-2">
                    {relations.length ? relations.map(relation => (
                        <div key={relation.name} className="flex items-center justify-between gap-2 py-1.5 text-xs text-slate-600">
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
        <WorldDialog title="居民属性" description="创作力是最近 30 天的水平。点开一行查看和别人的好感。" onClose={onClose}>
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在计算属性...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && !nodes.length ? <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p> : null}
            <div className="space-y-2">
                {nodes.map(node => (
                    <AttributeRow
                        key={node.id}
                        node={node}
                        relations={relationsFor(node.id, graph?.edges || [])}
                        expanded={expandedId === node.id}
                        onToggle={() => setExpandedId(current => current === node.id ? '' : node.id)}
                    />
                ))}
            </div>
        </WorldDialog>
    );
}
