import type {ReadingEdge, ReadingNode} from '../types/bookAnalysis';
import {orderedEvents} from './readingChartOptions';

export interface ChapterFlowGroup {
    id: string;
    ordinal: number;
    title: string;
    subtitle?: string;
    nodes: ReadingNode[];
    threads: string[];
    leadingCausality?: {sourceName: string; targetName: string; targetChapterTitle: string};
}

/**
 * 将有序的事件节点按照原著章节进行智能分组归纳
 */
export function clusterNodesByChapter(nodes: ReadingNode[], order: 'narrative' | 'time'): ChapterFlowGroup[] {
    const sorted = orderedEvents(nodes, order);
    if (!sorted.length) return [];

    const map = new Map<string, ChapterFlowGroup>();
    const orderList: ChapterFlowGroup[] = [];

    sorted.forEach(node => {
        const evidence = node.facts.find(f => f.evidence)?.evidence;
        const ordinal = evidence?.ordinal ?? 0;
        const title = evidence?.chapterTitle || (ordinal ? `第 ${ordinal} 章` : '故事背景与前置情节');
        const key = evidence?.chapterId ? `ch-${evidence.chapterId}` : `ch-ord-${ordinal}`;

        let group = map.get(key);
        if (!group) {
            group = {
                id: key,
                ordinal,
                title,
                nodes: [],
                threads: [],
            };
            map.set(key, group);
            orderList.push(group);
        }

        group.nodes.push(node);
        if (node.thread && !group.threads.includes(node.thread)) {
            group.threads.push(node.thread);
        }
    });

    // 为每个章节提炼核心转折和副标题
    orderList.forEach(group => {
        if (group.nodes.length > 0) {
            const firstEvent = group.nodes[0].name;
            const lastEvent = group.nodes[group.nodes.length - 1].name;
            if (firstEvent === lastEvent) {
                group.subtitle = `核心情节：${firstEvent}`;
            } else {
                group.subtitle = `从「${firstEvent}」至「${lastEvent}」`;
            }
        }
    });

    return orderList;
}

export interface CausalityTraceResult {
    relatedNodeIds: Set<string>;
    upstreamCauses: Set<string>;
    downstreamEffects: Set<string>;
    activeNodeId: string;
}

/**
 * 计算选中事件节点的因果链条（向上追踪前因，向下追踪后果）
 */
export function traceCausalityNetwork(
    targetNodeId: string,
    edges: ReadingEdge[],
    maxDepth = 5
): CausalityTraceResult {
    const relatedNodeIds = new Set<string>([targetNodeId]);
    const upstreamCauses = new Set<string>();
    const downstreamEffects = new Set<string>();

    if (!targetNodeId) {
        return {relatedNodeIds: new Set(), upstreamCauses, downstreamEffects, activeNodeId: ''};
    }

    // 向上追溯前因 (edge.target === current)
    let currentUp = [targetNodeId];
    let depth = 0;
    while (currentUp.length > 0 && depth < maxDepth) {
        const nextUp: string[] = [];
        currentUp.forEach(id => {
            edges.forEach(edge => {
                if (edge.kind === 'causes' && edge.target === id && !upstreamCauses.has(edge.source)) {
                    upstreamCauses.add(edge.source);
                    relatedNodeIds.add(edge.source);
                    nextUp.push(edge.source);
                }
            });
        });
        currentUp = nextUp;
        depth++;
    }

    // 向下追踪后果 (edge.source === current)
    let currentDown = [targetNodeId];
    depth = 0;
    while (currentDown.length > 0 && depth < maxDepth) {
        const nextDown: string[] = [];
        currentDown.forEach(id => {
            edges.forEach(edge => {
                if (edge.kind === 'causes' && edge.source === id && !downstreamEffects.has(edge.target)) {
                    downstreamEffects.add(edge.target);
                    relatedNodeIds.add(edge.target);
                    nextDown.push(edge.target);
                }
            });
        });
        currentDown = nextDown;
        depth++;
    }

    return {
        relatedNodeIds,
        upstreamCauses,
        downstreamEffects,
        activeNodeId: targetNodeId,
    };
}
