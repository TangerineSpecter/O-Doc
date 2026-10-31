import { useState, useEffect } from 'react';
import {
    ArrowLeft,
    Network,
    RefreshCw,
    Cpu,
    Layers,
    Clock,
    CheckCircle2,
    FileText,
    Sliders,
    ChevronDown,
    Activity,
    GitBranch,
    Info,
} from 'lucide-react';
import { factorName } from '../../utils/quantFactorName';
import { graphRelations, graphViews, type GraphView } from '../../utils/quantGraphView';
import { useQuantGraph } from '../../hooks/useQuantGraph';
import type { QuantGraphNode, QuantGraphEdge } from '../../types/api/quantGraph';
import { QuantButton, QuantEmpty, cardClass } from './ui';
import { FactorGraphCanvas } from './FactorGraphCanvas';
import { FactorVerification } from './verification/FactorVerification';
import { ResearchRelation } from './graph/ResearchRelation';
import { factorFamilies, factorRoles } from './factorPresentation';
import type { QuantFactorFamily, QuantFactorRole } from '../../types/api/quant';

const axesConfig: Record<string, { label: string; defaultWeight: number }> = {
    mechanism: { label: '计算机制', defaultWeight: 30 },
    calculation: { label: '计算结构', defaultWeight: 25 },
    inputs: { label: '数据输入', defaultWeight: 20 },
    output: { label: '输出类型与单位', defaultWeight: 15 },
    parameters: { label: '参数设定', defaultWeight: 10 },
};

/**
 * 因子属性相似度 5 维贡献拆解组件
 */
function AttributionMatrix({ edge }: { edge: QuantGraphEdge }) {
    if (!edge.attributes?.axes) return null;

    return (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">五维相似度加权贡献拆解</span>
                <span className="text-[11px] text-slate-400">各维度相似度 × 权重 = 贡献得分</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(edge.attributes.axes).map(([key, axis]) => {
                    const cfg = axesConfig[key] || { label: key, defaultWeight: axis.weight };
                    const similarityPct = Math.round(axis.similarity * 100);
                    const contribution = (axis.similarity * axis.weight).toFixed(1);

                    // 进度条颜色根据相似度
                    const barColor =
                        similarityPct >= 80
                            ? 'bg-orange-500'
                            : similarityPct >= 40
                              ? 'bg-amber-500'
                              : similarityPct > 0
                                ? 'bg-sky-500'
                                : 'bg-slate-300';

                    return (
                        <div
                            key={key}
                            className="rounded-lg border border-slate-200/60 bg-white p-2.5 shadow-2xs"
                        >
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-600">{cfg.label}</span>
                                <span className="text-[11px] text-slate-400">{axis.weight}%权重</span>
                            </div>
                            <div className="my-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                    style={{ width: `${similarityPct}%` }}
                                />
                            </div>
                            <div className="flex items-baseline justify-between text-xs">
                                <span className="tabular-nums font-semibold text-slate-800">
                                    {similarityPct}%
                                </span>
                                <span className="tabular-nums text-[11px] text-slate-500">
                                    +{contribution}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * 共同计算特征标签区
 */
function SharedFeatures({ edge }: { edge: QuantGraphEdge }) {
    const [expandedOps, setExpandedOps] = useState(false);
    const shared = edge.attributes?.shared;
    if (!shared) return null;

    const ops = shared.operations || [];
    const inputs = shared.inputs || [];
    const params = shared.parameters || [];

    const visibleOps = expandedOps ? ops : ops.slice(0, 10);
    const hasMoreOps = ops.length > 10;

    if (!inputs.length && !ops.length && !params.length) return null;

    return (
        <div className="mt-3.5 space-y-2 text-xs">
            {inputs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400">共同数据输入：</span>
                    {inputs.map((inp) => (
                        <span
                            key={inp}
                            className="rounded-md border border-sky-100 bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-medium text-sky-700"
                        >
                            {inp}
                        </span>
                    ))}
                </div>
            )}

            {ops.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400">共同计算算子：</span>
                    {visibleOps.map((op) => (
                        <span
                            key={op}
                            className="rounded border border-slate-200/80 bg-slate-100/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                        >
                            {op}
                        </span>
                    ))}
                    {hasMoreOps && (
                        <button
                            type="button"
                            onClick={() => setExpandedOps(!expandedOps)}
                            className="text-[11px] font-medium text-orange-600 hover:text-orange-700 hover:underline"
                        >
                            {expandedOps ? '收起' : `+ 展开全部 ${ops.length} 个`}
                        </button>
                    )}
                </div>
            )}

            {params.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400">共同算法参数：</span>
                    {params.map((param) => (
                        <span
                            key={param}
                            className="rounded-md border border-purple-100 bg-purple-50 px-2 py-0.5 font-mono text-[11px] font-medium text-purple-700"
                        >
                            {param}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export function FactorGraph({
    collection,
    initialFocus,
    close,
    openSource,
    openComparison,
    openExperiment,
    onFocusChange,
}: {
    collection: string;
    initialFocus: string;
    close: () => void;
    openSource: (node: QuantGraphNode) => void;
    openComparison?: (id: string) => void;
    openExperiment: (id: string) => void;
    onFocusChange?: (id: string) => void;
}) {
    const [focus, setFocus] = useState(initialFocus);
    const [view, setView] = useState<GraphView>('algorithms');
    const [showExplanation, setShowExplanation] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const controller = useQuantGraph(collection, focus);
    const graph = controller.data;

    useEffect(() => {
        if (graph?.focusId) onFocusChange?.(graph.focusId);
    }, [graph?.focusId, onFocusChange]);

    const center = graph?.nodes.find((node) => node.id === `factor:${graph.focusId}`);
    const profile = center?.algorithmProfile;
    const relations = graphRelations(graph, view);
    const counts = {
        algorithms: graphRelations(graph, 'algorithms').length,
        records: graphRelations(graph, 'records').length,
        all: graphRelations(graph, 'all').length,
    };

    const centerName = center ? factorName(center.label, center.originalName) : null;

    return (
        <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6">
            <div className="mx-auto max-w-6xl space-y-6">
                {/* 页面顶栏 */}
                <section className={cardClass}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-200/80 bg-orange-50 text-orange-600 shadow-2xs">
                                <Network size={22} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">因子算法图谱</h2>
                                <p className="text-xs text-slate-500 sm:text-sm">
                                    按计算机制、输入、计算结构、输出和参数关联算法，展示每条相似关系的计算依据。
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <QuantButton onClick={close}>
                                <ArrowLeft size={14} />
                                返回因子库
                            </QuantButton>
                            <QuantButton
                                aria-label="刷新关系图谱"
                                onClick={controller.reload}
                                disabled={controller.loading}
                            >
                                <RefreshCw
                                    size={15}
                                    className={controller.loading ? 'animate-spin' : ''}
                                />
                            </QuantButton>
                        </div>
                    </div>
                </section>

                {controller.loading ? (
                    <div role="status" className={`${cardClass} flex items-center justify-center gap-3 py-12 text-sm text-slate-500`}>
                        <RefreshCw size={18} className="animate-spin text-orange-500" />
                        正在整理算法属性与关联拓扑…
                    </div>
                ) : controller.error ? (
                    <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}>
                        <p>{controller.error}</p>
                        <QuantButton onClick={controller.reload}>重试</QuantButton>
                    </div>
                ) : graph && !center ? (
                    <QuantEmpty
                        title="还没有提取的算法"
                        description="分析源码后，计算算法及其属性会出现在这里。"
                    />
                ) : (
                    graph &&
                    center && (
                        <>
                            {/* 核心因子档案卡 (Focus Hero Profile) */}
                            <section className={`${cardClass} relative overflow-hidden border-orange-100 bg-gradient-to-b from-orange-50/20 to-white`}>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-100/70 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
                                                <span className="h-1.5 w-1.5 rounded-full bg-orange-600" />
                                                研究中心
                                            </span>
                                            {profile && (
                                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs">
                                                    机制：
                                                    {factorFamilies[profile.family as QuantFactorFamily] ||
                                                        profile.family}
                                                </span>
                                            )}
                                            {profile?.role && (
                                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs">
                                                    {factorRoles[profile.role as QuantFactorRole] || profile.role}
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="mt-2.5 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                                            {centerName?.title}
                                        </h3>
                                        {centerName?.identifier && (
                                            <p className="mt-1 font-mono text-xs text-slate-500">
                                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                                                    {centerName.identifier}
                                                </span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <QuantButton primary onClick={() => openSource(center)}>
                                            <FileText size={14} />
                                            查看来源报告
                                        </QuantButton>
                                    </div>
                                </div>

                                {/* 4 大核心指标卡片看板 */}
                                {profile && (
                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        {/* 计算机制 */}
                                        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Cpu size={14} className="text-orange-500" />
                                                <span>计算机制</span>
                                            </div>
                                            <p className="mt-1.5 text-sm font-bold text-slate-800">
                                                {factorFamilies[profile.family as QuantFactorFamily] ||
                                                    profile.family}
                                            </p>
                                            <p className="mt-0.5 text-xs text-slate-400">
                                                {factorRoles[profile.role as QuantFactorRole] || '核心算子'}
                                            </p>
                                        </div>

                                        {/* 数据输入 */}
                                        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Layers size={14} className="text-sky-500" />
                                                <span>数据输入</span>
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                                {profile.inputs.map((inp) => (
                                                    <span
                                                        key={inp}
                                                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700"
                                                    >
                                                        {inp}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                {profile.marketScope}
                                            </p>
                                        </div>

                                        {/* 市场与周期 */}
                                        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Clock size={14} className="text-purple-500" />
                                                <span>市场与周期</span>
                                            </div>
                                            <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-700">
                                                {profile.timeframe || '自适应图表周期'}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-slate-400">
                                                逐根 K 线序列计算
                                            </p>
                                        </div>

                                        {/* 定义完整度 */}
                                        <div
                                            className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs"
                                            title={profile.scoreMeaning}
                                        >
                                            <div className="flex items-center justify-between text-xs text-slate-500">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                                    <span>定义完整度</span>
                                                </div>
                                                <span className="font-mono font-bold text-slate-800">
                                                    {profile.definitionScore}/100
                                                </span>
                                            </div>
                                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                                    style={{ width: `${profile.definitionScore}%` }}
                                                />
                                            </div>
                                            <p className="mt-1 truncate text-[11px] text-slate-400">
                                                输入与计算闭合
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* 关系拓扑图谱区域 (Graph Canvas Section) */}
                            <section className={cardClass}>
                                {/* 控制与分类分段按钮 */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                    <div
                                        role="group"
                                        aria-label="关系分类"
                                        className="inline-flex rounded-xl bg-slate-100 p-1"
                                    >
                                        {(Object.keys(graphViews) as GraphView[]).map((kind) => (
                                            <button
                                                key={kind}
                                                type="button"
                                                aria-pressed={view === kind}
                                                onClick={() => setView(kind)}
                                                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                                                    view === kind
                                                        ? 'bg-white text-slate-900 shadow-sm'
                                                        : 'text-slate-600 hover:text-slate-900'
                                                }`}
                                            >
                                                {graphViews[kind]} · {counts[kind]}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <button
                                            type="button"
                                            onClick={() => setShowExplanation(!showExplanation)}
                                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                        >
                                            <Info size={13} className="text-orange-500" />
                                            <span>五维相似度加权规则</span>
                                            <ChevronDown
                                                size={13}
                                                className={`transition-transform ${showExplanation ? 'rotate-180' : ''}`}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {/* 加权规则展开提示卡片 */}
                                {showExplanation && (
                                    <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-xs leading-6 text-slate-700">
                                        <div className="flex flex-wrap items-center gap-2 font-medium text-orange-950">
                                            <span>加权模型公式：</span>
                                            <span className="rounded bg-white px-2 py-0.5 font-mono text-orange-800 shadow-2xs">
                                                综合属性相似度 = 机制 30% + 计算结构 25% + 数据输入 20% + 输出 15% + 参数 10%
                                            </span>
                                        </div>
                                        <p className="mt-2 text-slate-600">
                                            • 属性相似度基于 AST 语法树解析与变量签名计算，共用上游计算会提高相似度；
                                            <br />
                                            • 连线仅表示算法静态构造与输入输出属性的接近程度，不代表实际运行时收益依赖、相关性或可互相替换；
                                            <br />
                                            • 实际策略收益表现与统计相关由后续独立回测与评估记录提供。
                                        </p>
                                    </div>
                                )}

                                {/* 图谱 Canvas */}
                                <div className="mt-4">
                                    {relations.some(
                                        (edge) =>
                                            !['extracted_from', 'analyzed_from', 'origin_context'].includes(
                                                edge.kind
                                            )
                                    ) ? (
                                        <FactorGraphCanvas
                                            graph={{ ...graph, edges: relations }}
                                            focus={setFocus}
                                        />
                                    ) : (
                                        <div className="my-8 rounded-xl border border-dashed border-slate-200 py-10 text-center">
                                            <p className="text-sm font-medium text-slate-600">
                                                {view === 'algorithms'
                                                    ? '本次范围内未匹配到相似度阈值以上的其他算法。继续入库后将自动按属性对齐。'
                                                    : '本分类暂无额外的计算与实验记录。'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {graph.limited && (
                                    <p className="mt-3 text-xs leading-6 text-slate-400">
                                        本次展示有界范围内的关联算法；图谱最多直观呈现 8 个主要邻居节点，完整条目与多维依据见下方详情列表。
                                    </p>
                                )}
                            </section>

                            {/* 关联算法与属性详细解析列表 */}
                            <section className={cardClass}>
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">
                                            {graphViews[view]}
                                        </h3>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                            共 {relations.length} 条关联
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {relations.map((edge) => {
                                        const target = graph.nodes.find(
                                            (node) =>
                                                node.id === (edge.from === center.id ? edge.to : edge.from)
                                        );
                                        if (!target) return null;

                                        const targetName = factorName(
                                            target.label,
                                            target.originalName
                                        );
                                        const hasSim = edge.similarity !== null;
                                        const simPct = hasSim
                                            ? (edge.similarity! * 100).toFixed(1)
                                            : null;
                                        const isHighSim = Number(simPct) >= 50;

                                        return (
                                            <div
                                                key={edge.id}
                                                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition-all hover:border-orange-200 hover:shadow-xs"
                                            >
                                                {/* 卡片头部 */}
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h4 className="break-words text-base font-bold text-slate-900">
                                                                {targetName.title}
                                                            </h4>
                                                            {targetName.identifier && (
                                                                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                                                                    {targetName.identifier}
                                                                </span>
                                                            )}
                                                            {hasSim && (
                                                                <span
                                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                                                        isHighSim
                                                                            ? 'border border-orange-200 bg-orange-50 text-orange-700'
                                                                            : 'border border-slate-200 bg-slate-100 text-slate-700'
                                                                    }`}
                                                                >
                                                                    {isHighSim ? '高度相似' : '中度相似'} ·{' '}
                                                                    {simPct}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {edge.label}
                                                        </p>
                                                    </div>

                                                    {/* 操作区 */}
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {target.kind === 'factor' && (
                                                            <QuantButton
                                                                size="sm"
                                                                primary
                                                                onClick={() => setFocus(target.id.slice(7))}
                                                            >
                                                                设为研究中心
                                                            </QuantButton>
                                                        )}
                                                        {target.kind === 'factor' && (
                                                            <QuantButton
                                                                size="sm"
                                                                onClick={() => setFocus(target.id.slice(7))}
                                                            >
                                                                查看此算法
                                                            </QuantButton>
                                                        )}
                                                        {target.reportId && (
                                                            <QuantButton
                                                                size="sm"
                                                                onClick={() => openSource(target)}
                                                            >
                                                                <FileText size={13} />
                                                                来源报告
                                                            </QuantButton>
                                                        )}
                                                        {edge.requestId && (
                                                            <QuantButton
                                                                size="sm"
                                                                onClick={() => openExperiment(edge.requestId!)}
                                                            >
                                                                <Activity size={13} />
                                                                计算实验
                                                            </QuantButton>
                                                        )}
                                                        {edge.comparisonId && openComparison && (
                                                            <QuantButton
                                                                size="sm"
                                                                onClick={() => openComparison(edge.comparisonId!)}
                                                            >
                                                                <GitBranch size={13} />
                                                                固定对照
                                                            </QuantButton>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 核心五维贡献度进度条 */}
                                                <AttributionMatrix edge={edge} />

                                                {/* 共同算子与共同变量标签墙 */}
                                                <SharedFeatures edge={edge} />

                                                {/* 详细依据说明 */}
                                                {edge.detail && (
                                                    <div className="mt-3.5 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-500">
                                                        <span className="font-semibold text-slate-600">计算依据与说明：</span>
                                                        {edge.detail}
                                                    </div>
                                                )}

                                                {/* 专门的研究关系 (组合、假设、观察) */}
                                                {edge.researchJson && (
                                                    <div className="mt-4 border-t border-slate-100 pt-3">
                                                        <ResearchRelation
                                                            json={edge.researchJson}
                                                            current={graph.focusId}
                                                            focus={setFocus}
                                                            available={graph.nodes
                                                                .filter((n) => n.kind === 'factor')
                                                                .map((n) => n.id.slice(7))}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {!relations.length && (
                                        <div className="py-12 text-center text-sm text-slate-400">
                                            本分类暂无关联记录。
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* 算法历史计算与参数记录折叠面板 */}
                            <section className={cardClass}>
                                <button
                                    type="button"
                                    onClick={() => setHistoryOpen(!historyOpen)}
                                    className="flex w-full items-center justify-between text-left focus:outline-none"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sliders size={16} className="text-orange-500" />
                                        <span className="text-sm font-bold text-slate-900">
                                            当前算法的历史计算与参数记录
                                        </span>
                                    </div>
                                    <ChevronDown
                                        size={16}
                                        className={`text-slate-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {historyOpen && (
                                    <div className="mt-5 border-t border-slate-100 pt-4">
                                        <FactorVerification
                                            key={graph.focusId}
                                            collection={collection}
                                            candidate={graph.focusId}
                                            openExperiment={openExperiment}
                                            openComparison={openComparison}
                                        />
                                    </div>
                                )}
                            </section>
                        </>
                    )
                )}
            </div>
        </div>
    );
}