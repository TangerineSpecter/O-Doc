import {useState} from 'react';
import type {AgentRelationEdge, AgentRelationGraph, AgentRelationNode} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';
import WorldDialog from './WorldDialog';
import {
    Battery,
    CalendarDays,
    ChevronDown,
    FileText,
    MessageSquare,
    Package,
    Sparkles,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import {AgentInventoryDialog} from './AgentInventoryDialog';
import {AgentHoldingsDialog} from './AgentHoldingsDialog';
import ProfessionBadge from './ProfessionBadge';

interface AgentAttributePanelProps {
    graph: AgentRelationGraph | null;
    loading: boolean;
    error: string;
    selectedAgentId: string;
    onClose: () => void;
    onOpenInvestment?: (actorId?: string) => void;
}

interface RelationRow {
    name: string;
    tier: string;
    mine: number;
    theirs: number;
}

const relationsFor = (agentId: string, edges: AgentRelationEdge[]): RelationRow[] =>
    edges.flatMap((edge) => {
        if (edge.sourceId === agentId) {
            return [{name: edge.targetName, tier: edge.tier, mine: edge.sourceScore, theirs: edge.targetScore}];
        }
        if (edge.targetId === agentId) {
            return [{name: edge.sourceName, tier: edge.tier, mine: edge.targetScore, theirs: edge.sourceScore}];
        }
        return [];
    });

function AttributeRow({
    node,
    relations,
    expanded,
    onToggle,
    onOpenInventory,
    onOpenHoldings,
}: {
    node: AgentRelationNode;
    relations: RelationRow[];
    expanded: boolean;
    onToggle: () => void;
    onOpenInventory: () => void;
    onOpenHoldings: () => void;
}) {
    const stamina = node.stamina == null ? null : Number(node.stamina);
    const energy = stamina != null && Number.isFinite(stamina) ? Math.max(0, Math.min(100, stamina)) : null;

    return (
        <div
            className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                expanded
                    ? 'border-orange-300 bg-orange-50/20 shadow-sm'
                    : 'border-slate-200/90 bg-white hover:border-orange-200 hover:shadow-xs'
            } p-3.5 flex flex-col justify-between`}
        >
            <div>
                {/* 头部居民信息与好感折叠按钮 */}
                <div className="flex items-center gap-2.5">
                    <AgentAvatar name={node.name} avatar={node.avatar} size="md" />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate text-sm font-bold text-slate-800" title={node.name}>
                                {node.name}
                            </span>
                            <ProfessionBadge
                                professionName={node.professionName}
                                size="sm"
                                showEmpty={true}
                                emptyText="无职业"
                            />
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                    node.status === 'running'
                                        ? 'bg-lime-500 ring-2 ring-lime-200/60'
                                        : 'bg-slate-300'
                                }`}
                            />
                            <span>{node.status === 'running' ? '正在活动' : '休息中'}</span>
                        </div>
                    </div>

                    {/* 右侧互动折叠切换 */}
                    {relations.length > 0 ? (
                        <button
                            type="button"
                            onClick={onToggle}
                            aria-expanded={expanded}
                            title={expanded ? '收起互动好感' : '展开互动好感'}
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                expanded
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                            }`}
                        >
                            <span>{relations.length} 互动</span>
                            <ChevronDown
                                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            />
                        </button>
                    ) : (
                        <span className="shrink-0 text-[11px] text-slate-400">无互动</span>
                    )}
                </div>

                {/* 核心双指标：创作力 & 体力 双列紧凑并排 */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {/* 创作力 */}
                    <div className="rounded-xl border border-orange-100/90 bg-orange-50/40 p-2">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                <Sparkles className="h-3 w-3 text-orange-500" />
                                创作力
                            </span>
                            <span className="text-xs font-bold tabular-nums text-slate-800">
                                {node.creativity}
                                <span className="text-[10px] font-normal text-slate-400">/100</span>
                            </span>
                        </div>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-orange-100">
                            <div
                                className="h-full rounded-full bg-orange-500 transition-all duration-300"
                                style={{width: `${Math.max(0, Math.min(100, node.creativity))}%`}}
                            />
                        </div>
                    </div>

                    {/* 体力 */}
                    <div
                        className="rounded-xl border border-lime-100/90 bg-lime-50/40 p-2"
                        title="每小时恢复 5 点，成功评论并打分消耗 10 点"
                    >
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                <Battery className="h-3 w-3 text-lime-600" />
                                体力
                            </span>
                            <span className="text-xs font-bold tabular-nums text-slate-800">
                                {energy == null ? '—' : Number(energy.toFixed(1))}
                                <span className="text-[10px] font-normal text-slate-400">/100</span>
                            </span>
                        </div>
                        <div
                            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-lime-100"
                            role="progressbar"
                            aria-label={`${node.name}的体力`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={energy ?? undefined}
                        >
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    energy != null && energy < 10 ? 'bg-rose-500' : 'bg-lime-500'
                                }`}
                                style={{width: `${energy ?? 0}%`}}
                            />
                        </div>
                    </div>
                </div>

                {/* 30天创作统计（发帖、获评、活跃天） */}
                <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/70 py-1.5 text-center">
                    {[
                        {label: '发帖', value: node.postCount, icon: FileText},
                        {label: '获评', value: node.ratedPostCount, icon: MessageSquare},
                        {label: '活跃天', value: node.activeDays, icon: CalendarDays},
                    ].map(({label, value, icon: Icon}) => (
                        <div key={label} className="flex flex-col items-center justify-center px-1">
                            <span className="text-xs font-bold tabular-nums text-slate-700">{value}</span>
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                <Icon className="h-2.5 w-2.5" />
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* 资产与操作栏：金钱余额 + 持仓明细 + 背包 */}
                <div className="mt-2.5 flex items-center justify-between gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/30 p-2">
                    {/* 金钱余额 */}
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-amber-600 shadow-2xs">
                            <Wallet className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                            <span
                                className="block truncate font-mono text-xs font-bold text-slate-800"
                                title={`金钱余额：¥${Number(node.money).toLocaleString('zh-CN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}`}
                            >
                                ¥{Number(node.money).toLocaleString('zh-CN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                    </div>

                    {/* 操作按钮组：持仓明细 + 打开背包 */}
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={onOpenHoldings}
                            aria-label={`查看${node.name}的持仓明细`}
                            title="查看股票投资持仓与盈亏"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-white px-2 py-1 text-xs font-semibold text-orange-600 shadow-2xs transition-all hover:bg-orange-50 hover:border-orange-300 active:scale-95"
                        >
                            <TrendingUp className="h-3 w-3" />
                            <span>持仓明细</span>
                        </button>

                        <button
                            type="button"
                            onClick={onOpenInventory}
                            aria-label={`打开${node.name}的背包`}
                            title="查看随身持有物"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95"
                        >
                            <Package className="h-3 w-3 text-slate-400" />
                            <span>背包({node.inventoryCount ?? 0})</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 好感度展开详情 */}
            {expanded ? (
                <div className="mt-2.5 border-t border-orange-100/90 pt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                        <span>互动居民</span>
                        <span>相互好感度</span>
                    </div>
                    {relations.length ? (
                        <div className="max-h-36 overflow-y-auto scrollbar-hide space-y-1 divide-y divide-slate-100">
                            {relations.map((relation) => (
                                <div
                                    key={relation.name}
                                    className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-600"
                                >
                                    <span className="min-w-0 truncate font-medium text-slate-800">
                                        {relation.name}
                                    </span>
                                    <span className="shrink-0 text-right text-[11px]">
                                        <span className="mr-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                                            {relation.tier}
                                        </span>
                                        我 {relation.mine} · TA {relation.theirs}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="py-2 text-center text-xs text-slate-400">
                            最近 30 天还没有和其他居民互动。
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    );
}

export default function AgentAttributePanel({
    graph,
    loading,
    error,
    selectedAgentId,
    onClose,
    onOpenInvestment,
}: AgentAttributePanelProps) {
    const [prevSelectedAgentId, setPrevSelectedAgentId] = useState(selectedAgentId);
    const [expandedId, setExpandedId] = useState(selectedAgentId);
    const [inventoryAgent, setInventoryAgent] = useState<AgentRelationNode | null>(null);
    const [holdingsAgent, setHoldingsAgent] = useState<AgentRelationNode | null>(null);

    if (selectedAgentId !== prevSelectedAgentId) {
        setPrevSelectedAgentId(selectedAgentId);
        setExpandedId(selectedAgentId);
    }

    const nodes = [...(graph?.nodes || [])].sort((left, right) => {
        if (left.id === selectedAgentId) return -1;
        if (right.id === selectedAgentId) return 1;
        return right.creativity - left.creativity;
    });

    return (
        <WorldDialog
            title="居民属性"
            description="创作与互动按近 30 天统计，并显示当前体力、金钱余额与资产持仓。"
            size="wide"
            onClose={onClose}
        >
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在计算属性...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && !nodes.length ? (
                <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p>
            ) : null}
            {!loading && !error && nodes.length ? (
                <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                    <span>
                        <b className="text-slate-800">{nodes.length}</b> 位居民 · 按创作力排列
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px]">最近 30 天</span>
                </div>
            ) : null}
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!loading && !error
                    ? nodes.map((node) => (
                          <AttributeRow
                              key={node.id}
                              node={node}
                              relations={relationsFor(node.id, graph?.edges || [])}
                              expanded={expandedId === node.id}
                              onToggle={() =>
                                  setExpandedId((current) => (current === node.id ? '' : node.id))
                              }
                              onOpenInventory={() => setInventoryAgent(node)}
                              onOpenHoldings={() => setHoldingsAgent(node)}
                          />
                      ))
                    : null}
            </div>

            {/* 背包弹窗 */}
            {inventoryAgent && (
                <AgentInventoryDialog
                    agentId={inventoryAgent.id}
                    name={inventoryAgent.name}
                    onClose={() => setInventoryAgent(null)}
                />
            )}

            {/* 股票持仓明细弹窗 */}
            {holdingsAgent && (
                <AgentHoldingsDialog
                    agentId={holdingsAgent.id}
                    name={holdingsAgent.name}
                    onClose={() => setHoldingsAgent(null)}
                    onOpenFullInvestment={(actorId) => {
                        setHoldingsAgent(null);
                        onOpenInvestment?.(actorId);
                    }}
                />
            )}
        </WorldDialog>
    );
}
