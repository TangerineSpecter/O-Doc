import { useState } from 'react';
import { factorName } from '../../utils/quantFactorName';
import type { QuantGraph, QuantGraphNode, QuantGraphEdge } from '../../types/api/quantGraph';
import { factorFamilies } from './factorPresentation';
import type { QuantFactorFamily } from '../../types/api/quant';

/**
 * 现代高质感因子拓扑关系图谱
 * - 绝对防重叠几何算法：固定卡片高度 + 恒定安全物理留白（GAP_Y = 24px），彻底杜绝上下卡片重叠
 * - 原生 HTML 流式排版：内部采用 Flexbox 规范排版，彻底杜绝行间文字重叠
 * - 黄金比例跨度：大幅收窄过大的空洞距离，形成紧凑凝聚的现代投研节点网络
 * - 硬件端口设计（Anchor Ports）：中心节点与子节点两侧对齐高精度端口，科技质感拉满
 */
export function FactorGraphCanvas({
    graph,
    focus,
}: {
    graph: QuantGraph;
    focus: (id: string) => void;
}) {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    const center = graph.nodes.find((node) => node.id === `factor:${graph.focusId}`);
    if (!center) return null;

    const adjacent = new Set(
        graph.edges.flatMap((edge) =>
            edge.from === center.id ? [edge.to] : edge.to === center.id ? [edge.from] : []
        )
    );
    const neighbors = graph.nodes
        .filter(
            (node) =>
                !['report', 'source'].includes(node.kind) &&
                node.id !== center.id &&
                adjacent.has(node.id)
        )
        .slice(0, 8);

    const compact = neighbors.length <= 3;

    // 精算几何参数：杜绝重叠与空洞
    const W_CENTER = 232;
    const H_CENTER = 86;

    const W_NEIGHBOR = 224;
    const H_NEIGHBOR = 72;
    const GAP_Y = 24; // 卡片间绝对恒定的物理安全间隙
    const DELTA_Y = H_NEIGHBOR + GAP_Y; // 中心距 = 96px

    // 区分单侧流线 (<=3) 与双翼对称流线 (>3)
    const canvasWidth = compact ? 760 : 900;

    const leftNeighbors: QuantGraphNode[] = [];
    const rightNeighbors: QuantGraphNode[] = [];

    if (compact) {
        rightNeighbors.push(...neighbors);
    } else {
        const leftCount = Math.floor(neighbors.length / 2);
        leftNeighbors.push(...neighbors.slice(0, leftCount));
        rightNeighbors.push(...neighbors.slice(leftCount));
    }

    const maxSideCount = Math.max(leftNeighbors.length, rightNeighbors.length, 1);
    const sideOccupiedHeight = maxSideCount * H_NEIGHBOR + (maxSideCount - 1) * GAP_Y;
    const canvasHeight = Math.max(300, sideOccupiedHeight + 90);

    const centerX = compact ? 160 : canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // 确定每个邻居节点布局位置（精准垂直居中展开，绝不重叠）
    interface LayoutPoint {
        node: QuantGraphNode;
        x: number;
        y: number;
        side: 'left' | 'right';
        sideIndex: number;
        totalInSide: number;
        edge?: QuantGraphEdge;
    }

    const getEdge = (nodeId: string): QuantGraphEdge | undefined => {
        const links = graph.edges.filter(
            (e) =>
                (e.from === center.id && e.to === nodeId) ||
                (e.to === center.id && e.from === nodeId)
        );
        return (
            links.find((e) => e.kind === 'statistical_correlation') ||
            links.find((e) => e.kind === 'attribute_similar') ||
            links[0]
        );
    };

    const points: LayoutPoint[] = [];

    // 排布左翼节点
    if (leftNeighbors.length > 0) {
        const total = leftNeighbors.length;
        const totalHeight = total * H_NEIGHBOR + (total - 1) * GAP_Y;
        const startY = centerY - totalHeight / 2 + H_NEIGHBOR / 2;
        leftNeighbors.forEach((node, idx) => {
            points.push({
                node,
                x: 145,
                y: startY + idx * DELTA_Y,
                side: 'left',
                sideIndex: idx,
                totalInSide: total,
                edge: getEdge(node.id),
            });
        });
    }

    // 排布右翼节点
    if (rightNeighbors.length > 0) {
        const total = rightNeighbors.length;
        const totalHeight = total * H_NEIGHBOR + (total - 1) * GAP_Y;
        const startY = centerY - totalHeight / 2 + H_NEIGHBOR / 2;
        const targetX = compact ? 590 : 755;
        rightNeighbors.forEach((node, idx) => {
            points.push({
                node,
                x: targetX,
                y: startY + idx * DELTA_Y,
                side: 'right',
                sideIndex: idx,
                totalInSide: total,
                edge: getEdge(node.id),
            });
        });
    }

    const isConnectedHovered = (nodeId: string) => {
        if (!hoveredNodeId) return false;
        return hoveredNodeId === nodeId || hoveredNodeId === center.id;
    };

    // 中心节点解析数据
    const centerName = factorName(center.label, center.originalName);
    const centerIdentifier =
        centerName.identifier.length > 25
            ? `${centerName.identifier.slice(0, 24)}…`
            : centerName.identifier;
    const centerFamilyText = center.algorithmProfile?.family
        ? factorFamilies[center.algorithmProfile.family as QuantFactorFamily] ||
          center.algorithmProfile.family
        : '';

    return (
        <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 p-2 sm:p-4 shadow-2xs">
            {/* 顶部极简信息指示条 */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                    <span className="font-semibold text-slate-700">因子关联拓扑</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">算法机制与相似度网络</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                        高属性相似 (≥50%)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                        常规关联
                    </span>
                    <span className="hidden sm:inline text-slate-400">点击卡片聚焦</span>
                </div>
            </div>

            {/* 可横向滚动图谱画布容器 */}
            <div className="max-w-full overflow-x-auto scrollbar-hide py-3">
                <div
                    className="relative mx-auto select-none"
                    style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
                >
                    {/* 底层 SVG：微网格背景、三次贝塞尔连线与端口 */}
                    <svg
                        className="absolute inset-0 pointer-events-none"
                        width={canvasWidth}
                        height={canvasHeight}
                        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    >
                        <defs>
                            {/* 点阵底纹 */}
                            <pattern
                                id="factor-topo-dot-grid"
                                x="0"
                                y="0"
                                width="20"
                                height="20"
                                patternUnits="userSpaceOnUse"
                            >
                                <circle cx="2" cy="2" r="0.9" fill="#e2e8f0" />
                            </pattern>
                        </defs>

                        {/* 底纹背景 */}
                        <rect width={canvasWidth} height={canvasHeight} fill="url(#factor-topo-dot-grid)" rx={12} />

                        {/* 贝塞尔曲线 */}
                        {points.map((point) => {
                            const { node: item, x, y, side, sideIndex, totalInSide, edge } = point;
                            const isHovered = isConnectedHovered(item.id);
                            const anyHovered = !!hoveredNodeId;
                            const isHighSim = Number(edge?.similarity) >= 0.5;

                            // 起点多路自适应总线平滑微偏（不超过中心卡片端口高度）
                            const spreadOffset =
                                totalInSide > 1
                                    ? ((sideIndex - (totalInSide - 1) / 2) / Math.max(1, totalInSide - 1)) * 24
                                    : 0;

                            const startX = side === 'right' ? centerX + W_CENTER / 2 : centerX - W_CENTER / 2;
                            const startY = centerY + spreadOffset;
                            const endX = side === 'right' ? x - W_NEIGHBOR / 2 : x + W_NEIGHBOR / 2;
                            const endY = y;

                            const dx = endX - startX;
                            const c1x = startX + dx * 0.48;
                            const c1y = startY;
                            const c2x = startX + dx * 0.52;
                            const c2y = endY;
                            const pathD = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

                            const strokeColor = isHovered
                                ? '#ea580c'
                                : isHighSim
                                  ? '#f97316'
                                  : '#cbd5e1';

                            const strokeWidth = isHovered ? 2.2 : isHighSim ? 1.8 : 1.4;
                            const strokeOpacity = anyHovered ? (isHovered ? 1 : 0.25) : 0.85;

                            return (
                                <g key={`edge-line-${item.id}`}>
                                    <path
                                        d={pathD}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        strokeOpacity={strokeOpacity}
                                        strokeDasharray={edge?.kind === 'semantic_similar' ? '5 4' : undefined}
                                        className="transition-all duration-200"
                                    />
                                    {/* 连线端点微圆锚点 */}
                                    <circle
                                        cx={startX}
                                        cy={startY}
                                        r={2.5}
                                        fill="#ffffff"
                                        stroke={strokeColor}
                                        strokeWidth={1.4}
                                        opacity={strokeOpacity}
                                    />
                                    <circle
                                        cx={endX}
                                        cy={endY}
                                        r={2.5}
                                        fill="#ffffff"
                                        stroke={strokeColor}
                                        strokeWidth={1.4}
                                        opacity={strokeOpacity}
                                    />
                                </g>
                            );
                        })}
                    </svg>

                    {/* 连线中点关系微胶囊（绝不重复百分比数字，悬浮于开阔连线中央） */}
                    {points.map((point) => {
                        const { node: item, x, y, side, sideIndex, totalInSide, edge } = point;
                        if (!edge) return null;

                        const isHovered = isConnectedHovered(item.id);
                        const anyHovered = !!hoveredNodeId;

                        const spreadOffset =
                            totalInSide > 1
                                ? ((sideIndex - (totalInSide - 1) / 2) / Math.max(1, totalInSide - 1)) * 24
                                : 0;
                        const startX = side === 'right' ? centerX + W_CENTER / 2 : centerX - W_CENTER / 2;
                        const startY = centerY + spreadOffset;
                        const endX = side === 'right' ? x - W_NEIGHBOR / 2 : x + W_NEIGHBOR / 2;
                        const endY = y;
                        const midX = (startX + endX) / 2;
                        const midY = (startY + endY) / 2;

                        const label =
                            edge.kind === 'statistical_correlation'
                                ? '统计相关'
                                : edge.kind === 'attribute_similar'
                                  ? '属性对齐'
                                  : edge.kind === 'semantic_similar'
                                    ? '语义相近'
                                    : edge.label || '关联';

                        return (
                            <div
                                key={`edge-pill-${item.id}`}
                                style={{
                                    position: 'absolute',
                                    left: `${midX}px`,
                                    top: `${midY}px`,
                                    transform: 'translate(-50%, -50%)',
                                }}
                                className={`pointer-events-none z-10 transition-opacity duration-200 ${
                                    anyHovered ? (isHovered ? 'opacity-100' : 'opacity-25') : 'opacity-90'
                                }`}
                            >
                                <span
                                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium shadow-2xs transition-colors ${
                                        isHovered
                                            ? 'border border-orange-300 bg-orange-50 text-orange-700 font-semibold'
                                            : 'border border-slate-200/90 bg-white/95 text-slate-500'
                                    }`}
                                >
                                    {label}
                                </span>
                            </div>
                        );
                    })}

                    {/* 中心节点卡片（紧凑高精研究核心卡片，比例端庄，自然呼吸） */}
                    <div
                        style={{
                            position: 'absolute',
                            left: `${centerX}px`,
                            top: `${centerY}px`,
                            transform: 'translate(-50%, -50%)',
                            width: `${W_CENTER}px`,
                            height: `${H_CENTER}px`,
                        }}
                        className="z-20 flex flex-col justify-between items-center rounded-2xl border-2 border-orange-400 bg-white p-2.5 shadow-md shadow-orange-500/10 ring-4 ring-orange-500/5 transition-all select-none"
                    >
                        {/* 顶部指示胶囊 */}
                        <div className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                            </span>
                            <span>当前研究中心</span>
                        </div>

                        {/* 主标题 */}
                        <h3
                            className="w-full text-center font-bold text-slate-800 text-[13.5px] leading-snug truncate px-1"
                            title={centerName.title}
                        >
                            {centerName.title}
                        </h3>

                        {/* 底部代码与机制 */}
                        <div className="flex items-center gap-1.5 max-w-full px-1">
                            {centerIdentifier && (
                                <span className="max-w-[125px] truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.2 font-mono text-[10px] text-slate-600">
                                    {centerIdentifier}
                                </span>
                            )}
                            {centerFamilyText && (
                                <span className="truncate text-[10px] font-medium text-orange-600/90 shrink-0">
                                    ✦ {centerFamilyText}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* 关联邻居节点卡片（绝对防重叠、间距保证恒定 24px，精致利落三层排版） */}
                    {points.map((point) => {
                        const { node: item, x, y, edge } = point;
                        const name = factorName(item.label, item.originalName);
                        const identifier =
                            name.identifier.length > 22
                                ? `${name.identifier.slice(0, 21)}…`
                                : name.identifier;

                        const isHovered = hoveredNodeId === item.id;
                        const anyHovered = !!hoveredNodeId;
                        const isMuted = anyHovered && !isConnectedHovered(item.id);

                        const hasSimilarity = edge?.similarity !== null && edge?.similarity !== undefined;
                        const similarityPct = hasSimilarity ? (edge!.similarity! * 100).toFixed(1) : null;
                        const isHighSim = Number(similarityPct) >= 50;

                        const itemFamily = item.algorithmProfile?.family
                            ? factorFamilies[item.algorithmProfile.family as QuantFactorFamily] ||
                              item.algorithmProfile.family
                            : null;

                        return (
                            <div
                                key={item.id}
                                style={{
                                    position: 'absolute',
                                    left: `${x}px`,
                                    top: `${y}px`,
                                    transform: 'translate(-50%, -50%)',
                                    width: `${W_NEIGHBOR}px`,
                                    height: `${H_NEIGHBOR}px`,
                                }}
                                className={`z-20 flex flex-col justify-between rounded-xl border bg-white p-2.5 shadow-2xs transition-all duration-200 cursor-pointer ${
                                    isHovered
                                        ? 'border-orange-400 shadow-md ring-2 ring-orange-500/10 -translate-y-0.5'
                                        : isHighSim
                                          ? 'border-slate-200 hover:border-orange-300 hover:shadow-xs'
                                          : 'border-slate-200/90 hover:border-slate-300'
                                } ${isMuted ? 'opacity-35' : 'opacity-100'}`}
                                onMouseEnter={() => setHoveredNodeId(item.id)}
                                onMouseLeave={() => setHoveredNodeId(null)}
                                onClick={() => item.kind === 'factor' && focus(item.id.slice(7))}
                                role={item.kind === 'factor' ? 'button' : undefined}
                                tabIndex={item.kind === 'factor' ? 0 : undefined}
                                onKeyDown={(e) => {
                                    if (item.kind === 'factor' && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        focus(item.id.slice(7));
                                    }
                                }}
                                title={`${item.label} · 点击切换为当前研究中心`}
                            >
                                {/* 顶部行：左侧机制与类别，右侧相似度徽章 */}
                                <div className="flex items-center justify-between gap-1 leading-none">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                                isHighSim ? 'bg-orange-500' : 'bg-slate-400'
                                            }`}
                                        />
                                        <span className="truncate text-[10.5px] font-medium text-slate-500">
                                            {item.kind === 'factor'
                                                ? itemFamily
                                                    ? `因子 · ${itemFamily}`
                                                    : '关联算法'
                                                : '关联记录'}
                                        </span>
                                    </div>
                                    {similarityPct !== null && (
                                        <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono ${
                                                isHighSim
                                                    ? 'border border-orange-200 bg-orange-50 text-orange-700'
                                                    : 'border border-slate-200 bg-slate-50 text-slate-600'
                                            }`}
                                        >
                                            {similarityPct}%
                                        </span>
                                    )}
                                </div>

                                {/* 主标题 */}
                                <div
                                    className={`font-semibold text-[13px] leading-tight truncate transition-colors ${
                                        isHovered ? 'text-orange-600' : 'text-slate-800'
                                    }`}
                                    title={name.title}
                                >
                                    {name.title}
                                </div>

                                {/* 底部代码标识符与悬停引导 */}
                                <div className="flex items-center justify-between gap-1 leading-none">
                                    {identifier ? (
                                        <span className="max-w-[140px] truncate rounded border border-slate-100 bg-slate-50 px-1.5 py-0.2 font-mono text-[9.5px] text-slate-500">
                                            {identifier}
                                        </span>
                                    ) : (
                                        <span />
                                    )}
                                    <span
                                        className={`text-[9.5px] font-medium transition-colors shrink-0 ${
                                            isHovered ? 'text-orange-600' : 'text-slate-400'
                                        }`}
                                    >
                                        {isHovered ? '切换中心 →' : '点击聚焦'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
