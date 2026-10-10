import {residentRelations, type ResidentRelation} from '../../utils/agentRelations';
import ResidentRelationsDialog from './ResidentRelationsDialog';
import ResidentActivityDialog from './ResidentActivityDialog';
import {useState} from 'react';
import type {AgentRelationGraph, AgentRelationNode} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';
import WorldDialog from './WorldDialog';
import {
    Battery,
    CalendarDays,
    Activity,
    ChefHat,
    FileText,
    MessageSquare,
    Package,
    Sparkles,
    Sprout,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import {AgentInventoryDialog} from './AgentInventoryDialog';
import {AgentHoldingsDialog} from './AgentHoldingsDialog';
import ProfessionBadge from './ProfessionBadge';
import LevelPlate from './LevelPlate';

interface AgentAttributePanelProps {
    graph: AgentRelationGraph | null;
    loading: boolean;
    error: string;
    selectedAgentId: string;
    onClose: () => void;
    onViewActivities?: (actorId: string) => void;
    onOpenCombat?: (actorId: string) => void;
    onOpenInvestment?: (actorId?: string) => void;
}

function AttributeRow({
    node,
    relations,
    onOpenRelations,
    onOpenActivities,
    onOpenInventory,
    onOpenHoldings,
    onOpenCombat,
}: {
    node: AgentRelationNode;
    relations: ResidentRelation[];
    onOpenRelations: () => void;
    onOpenActivities: () => void;
    onOpenInventory: () => void;
    onOpenHoldings: () => void;
    onOpenCombat?: () => void;
}) {
    const stamina = node.stamina == null ? null : Number(node.stamina);
    const energy = stamina != null && Number.isFinite(stamina) ? Math.max(0, Math.min(100, stamina)) : null;

    return (
        <div
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 transition-colors hover:border-orange-200 hover:shadow-xs"
        >
            <div>
                {onOpenCombat && <button onClick={onOpenCombat} className="mb-3 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">冒险 · 装备与战斗</button>}
                {/* 头部居民信息与独立互动、活动入口 */}
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
                            <span>{node.currentAction || (node.status === 'running' ? '正在活动' : '休息中')}</span>
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <button type="button" onClick={onOpenRelations} aria-label={`查看${node.name}的互动`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-2xs transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"><MessageSquare className="h-3 w-3 text-slate-400"/>互动<span className="border-l border-slate-200 pl-1.5 tabular-nums text-slate-400">{relations.length}</span></button>
                        <button type="button" onClick={onOpenActivities} aria-label={`查看${node.name}的活动`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-orange-200/80 bg-orange-50/60 px-2 text-[11px] font-medium text-orange-700 shadow-2xs transition-colors hover:border-orange-300 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"><Activity className="h-3 w-3 text-orange-500"/>活动</button>
                    </div>
                </div>

                {/* 居民生活技能与核心指标：种植、创作力、厨艺、体力 双列紧凑并排 */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {/* 种植技能 */}
                    <div className="rounded-xl border border-lime-100 bg-lime-50/40 p-2">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                                <Sprout className="h-3 w-3 text-lime-600" />
                                种植
                                <LevelPlate level={node.planting?.level || 1} variant="lime" size="xs" />
                            </span>
                            <span className="text-xs font-bold tabular-nums text-slate-700">
                                {node.planting?.experience || 0}
                                <span className="ml-0.5 text-[10px] font-normal text-slate-400">经验</span>
                            </span>
                        </div>
                        <div
                            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-lime-100"
                            role="progressbar"
                            aria-label={`${node.name}的种植经验进度`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round((node.planting?.progress || 0) * 100)}
                        >
                            <div
                                className="h-full rounded-full bg-lime-500 transition-all duration-300"
                                style={{width: `${Math.max(0, Math.min(100, (node.planting?.progress || 0) * 100))}%`}}
                            />
                        </div>
                    </div>

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

                    {/* 厨艺技能 */}
                    <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-2">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                                <ChefHat className="h-3 w-3 text-orange-500" />
                                厨艺
                                <LevelPlate level={node.cooking?.level || 1} variant="orange" size="xs" />
                            </span>
                            <span className="text-xs font-bold tabular-nums text-slate-700">
                                {node.cooking?.experience || 0}
                                <span className="ml-0.5 text-[10px] font-normal text-slate-400">经验</span>
                            </span>
                        </div>
                        <div
                            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-orange-100"
                            role="progressbar"
                            aria-label={`${node.name}的厨艺经验进度`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round((node.cooking?.progress || 0) * 100)}
                        >
                            <div
                                className="h-full rounded-full bg-orange-400 transition-all duration-300"
                                style={{width: `${Math.max(0, Math.min(100, (node.cooking?.progress || 0) * 100))}%`}}
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


        </div>
    );
}

export default function AgentAttributePanel({
    graph,
    loading,
    error,
    selectedAgentId,
    onClose,
    onOpenCombat,
    onOpenInvestment,
    onViewActivities,
}: AgentAttributePanelProps) {
    const [relationAgent, setRelationAgent] = useState<AgentRelationNode | null>(null);
    const [activityAgent, setActivityAgent] = useState<AgentRelationNode | null>(null);
    const [inventoryAgent, setInventoryAgent] = useState<AgentRelationNode | null>(null);
    const [holdingsAgent, setHoldingsAgent] = useState<AgentRelationNode | null>(null);

    const nodes = [...(graph?.nodes || [])].sort((left, right) => {
        if (left.id === selectedAgentId) return -1;
        if (right.id === selectedAgentId) return 1;
        return right.creativity - left.creativity;
    });

    return (
        <WorldDialog
            title="居民属性"
            description="创作统计近 30 天，互动保留历史关系；体力、金钱余额与资产显示当前状态。"
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
                              relations={residentRelations(node.id, graph)}
                              onOpenRelations={() => setRelationAgent(node)}
                              onOpenActivities={() => setActivityAgent(node)}
                              onOpenInventory={() => setInventoryAgent(node)}
                              onOpenHoldings={() => setHoldingsAgent(node)}
                              onOpenCombat={onOpenCombat ? () => onOpenCombat(node.id) : undefined}
                          />
                      ))
                    : null}
            </div>

            {relationAgent && <ResidentRelationsDialog agent={relationAgent} relations={residentRelations(relationAgent.id, graph)} onClose={() => setRelationAgent(null)}/>}
            {activityAgent && <ResidentActivityDialog key={activityAgent.id} agent={activityAgent} onClose={() => setActivityAgent(null)} onViewComplete={onViewActivities ? () => {setActivityAgent(null); onViewActivities(activityAgent.id);} : undefined}/>}

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
