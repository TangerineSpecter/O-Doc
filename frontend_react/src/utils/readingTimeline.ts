import type {ReadingEdge, ReadingNode, SourceEvidence} from '../types/bookAnalysis';
import {orderedEvents} from './readingChartOptions';

export interface TimelineGroup {
    id: string;
    title: string;
    subtitle?: string;
    nodes: ReadingNode[];
}

export interface ThreadTheme {
    border: string;
    bg: string;
    text: string;
    dot: string;
    tagBg: string;
}

const THREAD_THEMES: Record<string, ThreadTheme> = {
    blue: {
        border: 'border-blue-200',
        bg: 'bg-blue-50/60',
        text: 'text-blue-700',
        dot: '#3b82f6',
        tagBg: 'bg-blue-100/70',
    },
    amber: {
        border: 'border-amber-200',
        bg: 'bg-amber-50/60',
        text: 'text-amber-700',
        dot: '#f59e0b',
        tagBg: 'bg-amber-100/70',
    },
    purple: {
        border: 'border-purple-200',
        bg: 'bg-purple-50/60',
        text: 'text-purple-700',
        dot: '#a855f7',
        tagBg: 'bg-purple-100/70',
    },
    emerald: {
        border: 'border-emerald-200',
        bg: 'bg-emerald-50/60',
        text: 'text-emerald-700',
        dot: '#10b981',
        tagBg: 'bg-emerald-100/70',
    },
    rose: {
        border: 'border-rose-200',
        bg: 'bg-rose-50/60',
        text: 'text-rose-700',
        dot: '#f43f5e',
        tagBg: 'bg-rose-100/70',
    },
    orange: {
        border: 'border-orange-200',
        bg: 'bg-orange-50/60',
        text: 'text-orange-700',
        dot: '#f97316',
        tagBg: 'bg-orange-100/70',
    },
};

const THEME_KEYS = Object.keys(THREAD_THEMES);

export function getThreadTheme(thread?: string): ThreadTheme {
    if (!thread) {
        return {
            border: 'border-slate-200',
            bg: 'bg-slate-50',
            text: 'text-slate-600',
            dot: '#94a3b8',
            tagBg: 'bg-slate-100',
        };
    }
    // 关键词优先匹配
    if (/调查|警察|案发|报案|现场|侦破/.test(thread)) return THREAD_THEMES.blue;
    if (/死者|受害|动向|行踪|失踪|被害/.test(thread)) return THREAD_THEMES.amber;
    if (/当铺|秘密|暗线|计划|疑点|交易/.test(thread)) return THREAD_THEMES.purple;
    if (/学校|同学|证人|家庭|亲属/.test(thread)) return THREAD_THEMES.emerald;

    // 字符串哈希分配
    let hash = 0;
    for (let i = 0; i < thread.length; i++) {
        hash = (hash << 5) - hash + thread.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % THEME_KEYS.length;
    return THREAD_THEMES[THEME_KEYS[index]];
}

/**
 * 提取时间文本中的归类前缀（用于聚类阶段）
 */
function extractDateBucket(node: ReadingNode, order: 'narrative' | 'time'): {key: string; title: string; subtitle?: string} {
    const rawOrder = (node.timeOrder || '').trim();
    const rawLabel = (node.timeLabel || '').trim();
    const evidence = node.facts.find(f => f.evidence)?.evidence;
    const chapterTitle = evidence?.chapterTitle ? `第 ${evidence.ordinal} 章 · ${evidence.chapterTitle}` : '';

    if (order === 'narrative') {
        // 叙述顺序优先按章节聚类
        if (chapterTitle) {
            return {
                key: `ch-${evidence?.chapterId || evidence?.ordinal || chapterTitle}`,
                title: chapterTitle,
                subtitle: rawLabel || '按原文章节叙述推进',
            };
        }
    }

    // 1. 尝试从 timeOrder 提取 ISO 日期 (YYYY-MM-DD 或 YYYY年MM月DD日)
    if (rawOrder) {
        const dateMatch = rawOrder.match(/^(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/);
        if (dateMatch) {
            const dateStr = dateMatch[1].replace(/[-/]/g, '.');
            return {
                key: `date-${dateStr}`,
                title: dateStr,
                subtitle: rawLabel || '明确日期记录',
            };
        }
        const yearMatch = rawOrder.match(/^(\d{4})/);
        if (yearMatch) {
            return {
                key: `year-${yearMatch[1]}`,
                title: `${yearMatch[1]} 年`,
                subtitle: rawLabel || '故事发生年度',
            };
        }
    }

    if (order === 'time') {
        return {
            key: 'undated',
            title: '发生日期未明确',
            subtitle: '仅按原文出现顺序列出，无法确定这些事件的先后',
        };
    }

    // 2. 尝试从 timeLabel 提取日期或星期
    const weekMatch = rawLabel.match(/(星期[一二三四五六日天]|周[一二三四五六日天])/);
    if (weekMatch) {
        return {
            key: `week-${weekMatch[1]}`,
            title: weekMatch[1],
            subtitle: rawLabel.replace(weekMatch[1], '').trim() || '集中事件记录',
        };
    }

    const stageMatch = rawLabel.match(/(案发当天|案发当日|案发前夕|初查时期|多年后|某天夜里|童年时期|学生时期|数月后|次日|几天后)/);
    if (stageMatch) {
        return {
            key: `stage-${stageMatch[1]}`,
            title: stageMatch[1],
            subtitle: rawLabel || '阶段事件',
        };
    }

    if (chapterTitle) {
        return {
            key: `ch-${evidence?.ordinal || chapterTitle}`,
            title: chapterTitle,
            subtitle: rawLabel || '原文叙述顺序推进',
        };
    }

    if (rawLabel) {
        return {
            key: `label-${rawLabel.slice(0, 10)}`,
            title: rawLabel,
            subtitle: '故事阶段事件',
        };
    }

    return {
        key: 'unspecified',
        title: '时间待考 / 背景情节',
        subtitle: '时间未在原文中明确标出',
    };
}

/**
 * 将有序的事件列表进行平滑连续聚类分组
 */
export function clusterTimelineEvents(nodes: ReadingNode[], order: 'narrative' | 'time'): TimelineGroup[] {
    const sorted = orderedEvents(nodes, order);
    if (!sorted.length) return [];

    const groups: TimelineGroup[] = [];
    let currentGroup: TimelineGroup | null = null;

    sorted.forEach((node) => {
        const bucket = extractDateBucket(node, order);
        if (!currentGroup || currentGroup.id !== bucket.key) {
            currentGroup = {
                id: bucket.key,
                title: bucket.title,
                subtitle: bucket.subtitle,
                nodes: [node],
            };
            groups.push(currentGroup);
        } else {
            currentGroup.nodes.push(node);
        }
    });

    return groups;
}

export interface NodeCausality {
    causes?: {id: string; name: string};
    causedBy?: {id: string; name: string};
}

/**
 * 提取事件的前后因果关系
 */
export function getEventCausality(nodeId: string, edges: ReadingEdge[], nodesMap: Map<string, ReadingNode>): NodeCausality {
    let causes: {id: string; name: string} | undefined;
    let causedBy: {id: string; name: string} | undefined;

    for (const edge of edges) {
        if (edge.kind === 'causes') {
            if (edge.source === nodeId) {
                const target = nodesMap.get(edge.target);
                if (target && !causes) {
                    causes = {id: target.id, name: target.name};
                }
            } else if (edge.target === nodeId) {
                const source = nodesMap.get(edge.source);
                if (source && !causedBy) {
                    causedBy = {id: source.id, name: source.name};
                }
            }
        }
        if (causes && causedBy) break;
    }

    return {causes, causedBy};
}

/**
 * 识别在“叙述顺序”下是否属于倒叙/回忆事件
 */
export function detectFlashback(nodeIndex: number, sortedNodes: ReadingNode[], order: 'narrative' | 'time'): boolean {
    if (order !== 'narrative' || nodeIndex === 0) return false;
    const current = sortedNodes[nodeIndex];
    if (!current.timeOrder) return false;

    // 查看之前是否已经出现过明显晚于当前事件的发生时间
    for (let i = 0; i < nodeIndex; i++) {
        const prev = sortedNodes[i];
        if (prev.timeOrder && prev.timeOrder.localeCompare(current.timeOrder) > 0) {
            return true;
        }
    }
    return false;
}

/**
 * 获取事件中的第一条有效原文证据
 */
export function getPrimaryEvidence(node: ReadingNode): SourceEvidence | undefined {
    return node.facts.find(f => f.evidence)?.evidence || undefined;
}
