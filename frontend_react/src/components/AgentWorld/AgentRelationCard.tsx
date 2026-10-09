import {useState} from 'react';
import {useAgentRelation} from '../../hooks/useAgentRelation';
import {useAgentRelationChart} from '../../hooks/useAgentRelationChart';
import type {AgentRelationEdge, AgentRelationGraph} from '../../types/api/setting';
import {RELATION_TIER_COLORS, relationNodeName} from '../../utils/relationGraph';
import WorldDialog from './WorldDialog';
import Checkbox from '../common/Checkbox';
import {Network, RotateCcw, Users} from 'lucide-react';
import './AgentRelationTooltip.css';

interface AgentRelationCardProps {
    graph: AgentRelationGraph | null;
    loading: boolean;
    error: string;
    selectedEdge: AgentRelationEdge | null;
    onSelectEdge: (edge: AgentRelationEdge | null) => void;
    onSelectAgent: (agentId: string) => void;
    onClose: () => void;
}

export default function AgentRelationCard({
    graph: currentGraph,
    loading: currentLoading,
    error: currentError,
    selectedEdge: currentSelectedEdge,
    onSelectEdge,
    onSelectAgent,
    onClose,
}: AgentRelationCardProps) {
    const [showDeparted, setShowDeparted] = useState(false);
    const history = useAgentRelation(showDeparted, true);
    const graph = showDeparted ? history.graph : currentGraph;
    const loading = showDeparted ? history.loading : currentLoading;
    const error = showDeparted ? history.error : currentError;
    const selectedEdge = graph?.edges.some(edge => edge.sourceId === currentSelectedEdge?.sourceId
        && edge.targetId === currentSelectedEdge?.targetId) ? currentSelectedEdge : null;

    const {chartRef, focusedNode, resetView} = useAgentRelationChart(graph, !loading && !error, onSelectEdge);

    return (
        <WorldDialog size="wide" title="关系图谱" description="悬停头像查看居民信息，悬停连线查看关系，点击连线查看详情；拖动头像带动关系网络。" onClose={onClose}>
            <Checkbox
                checked={showDeparted}
                onChange={checked => {
                    setShowDeparted(checked);
                    onSelectEdge(null);
                }}
                label="显示已离开居民"
                labelClassName="text-sm font-normal text-slate-600"
                className="mb-3 shrink-0"
            />
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在整理最近的互动...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && graph && !graph.nodes.length ? (
                <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p>
            ) : null}
            {!loading && !error && graph?.nodes.length ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-500">
                            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5"/><b className="text-slate-800">{graph.nodes.filter(node => node.kind !== 'user' && !node.departed).length}</b> 位当前居民
                                {showDeparted ? <span> · {graph.nodes.filter(node => node.departed).length} 位已离开</span> : null}</span>
                            <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5"/><b className="text-slate-800">{graph.edges.length}</b> 条关系</span>
                        </div>
                        <button type="button" onClick={resetView} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 transition-colors hover:border-orange-200 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                            <RotateCcw className="h-3 w-3"/>重置视图
                        </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                        <div ref={chartRef} role="img" aria-label="居民关系网络，点击头像聚焦，点击连线查看详情" className="min-h-64 w-full flex-1"/>
                        <div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-100 bg-white px-3 py-2.5">
                            {Object.entries(RELATION_TIER_COLORS).map(([tier, color]) => <span key={tier} className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-4 rounded-full" style={{backgroundColor: color}}/>{tier}</span>)}
                        </div>
                    </div>
                    <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500" aria-live="polite">
                        {focusedNode ? <>
                            <span>正在查看 <strong className="text-slate-700">{relationNodeName(focusedNode)}</strong> 的关系</span>
                            {focusedNode.kind !== 'user' && !focusedNode.departed ? <button type="button" onClick={() => onSelectAgent(focusedNode.id)} className="rounded-full bg-orange-50 px-3 py-1.5 font-medium text-orange-600 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">查看动态</button> : null}
                        </> : <span>{graph.edges.length ? '悬停头像查看信息 · 点击头像保持聚焦 · 点击连线查看详情' : '暂无互动连线 · 点击头像选择居民'}</span>}
                        <span className="text-slate-400">拖动头像带动网络 · 可缩放</span>
                    </div>
                    {selectedEdge ? (
                        <div className="max-h-40 shrink-0 overflow-y-auto scrollbar-hide rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 text-xs text-slate-600">
                            {[['source', selectedEdge.sourceName, selectedEdge.targetName, selectedEdge.sourceRelation], ['target', selectedEdge.targetName, selectedEdge.sourceName, selectedEdge.targetRelation]].map(([direction, name, target, feeling]) => {
                                const value = feeling as AgentRelationEdge['sourceRelation'];
                                if (!value) return null;
                                return <div key={String(direction)} className="mb-2"><strong>{String(name)}</strong> → {String(target)}：好感 {value.affinity}/100 · {value.familiarityLabel} {value.familiarity}/100 · {value.emotion.kind}
                                    <p className="mt-1 text-[11px] text-slate-500">{value.reason}</p></div>;
                            })}
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-orange-700">{selectedEdge.tier}{selectedEdge.oneWay ? ' · Agent单方面感受' : ''}</span>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </WorldDialog>
    );
}
