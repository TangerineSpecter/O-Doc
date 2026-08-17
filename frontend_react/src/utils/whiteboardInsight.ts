import type {
    InsightFinding,
    InsightFindingType,
    InsightQuestion,
    WhiteboardEdge,
    WhiteboardInsights,
    WhiteboardNode,
} from '../types/whiteboard';

const displayLabel = (node: WhiteboardNode) => {
    if (node.type === 'article') return node.title?.trim() || '未命名文章';
    if (node.type === 'note') {
        const text = (node.content || '').replace(/\s+/g, ' ').trim();
        return text || '空白便签';
    }
    if (node.type === 'text') {
        return node.label?.trim() || node.title?.trim() || node.content?.trim() || '文本';
    }
    return node.label?.trim() || node.title?.trim() || (
        node.shapeType === 'circle' ? '圆形' : node.shapeType === 'diamond' ? '菱形' : '矩形'
    );
};

export const NOTE_BRIEF_LIMIT = 500;
export const ARTICLE_BRIEF_LIMIT = 800;
export const TEXT_BRIEF_LIMIT = 360;
export const BOARD_BRIEF_LIMIT = 12000;

const FINDING_TYPES: InsightFindingType[] = ['theme', 'tension', 'gap', 'clue'];
const CITE_TOKEN_RE = /\[n(\d+)\]|(?<![A-Za-z0-9])n(\d+)(?![A-Za-z0-9])/gi;

const stripMarkdown = (value: string) => value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (value: string, limit: number) => {
    const text = value.trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trim()}…`;
};

const nodeBody = (node: WhiteboardNode) => {
    if (node.type === 'article') {
        return clip(stripMarkdown(node.content || ''), ARTICLE_BRIEF_LIMIT);
    }
    if (node.type === 'note') {
        return clip((node.content || '').replace(/\s+/g, ' '), NOTE_BRIEF_LIMIT);
    }
    if (node.type === 'text') {
        return clip((node.label || node.title || node.content || '').replace(/\s+/g, ' '), TEXT_BRIEF_LIMIT);
    }
    return clip((node.label || node.title || '').replace(/\s+/g, ' '), TEXT_BRIEF_LIMIT);
};

export const nodeHasInsightText = (node: WhiteboardNode) => Boolean(nodeBody(node) || node.title?.trim());

export const hashInsightSnapshot = (title: string, nodes: WhiteboardNode[], edges: WhiteboardEdge[]) => {
    const payload = [
        title,
        ...nodes.map(node => [
            node.id,
            node.type,
            node.title || '',
            node.label || '',
            node.content || '',
            node.shapeType || '',
        ].join('\u0001')),
        ...edges.map(edge => [edge.id, edge.sourceId, edge.targetId, edge.label || ''].join('\u0001')),
    ].join('\u0002');

    let hash = 5381;
    for (let index = 0; index < payload.length; index += 1) {
        hash = ((hash << 5) + hash) ^ payload.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
};

export interface BoardBriefScope {
    title: string;
    nodes: WhiteboardNode[];
    edges: WhiteboardEdge[];
    selectedNodeIds?: string[];
    scope?: 'board' | 'selection';
}

export interface BoardBrief {
    title: string;
    brief: string;
    scope: 'board' | 'selection';
    scopedNodes: WhiteboardNode[];
    scopedEdges: WhiteboardEdge[];
    citeMap: Record<string, string>;
    reverseCiteMap: Record<string, string>;
    snapshotHash: string;
    canAnalyze: boolean;
}

export const resolveInsightScope = (
    nodes: WhiteboardNode[],
    edges: WhiteboardEdge[],
    scope: 'board' | 'selection',
    selectedNodeIds: string[] = [],
) => {
    if (scope === 'selection' && selectedNodeIds.length > 0) {
        const selected = new Set(selectedNodeIds);
        return {
            scopedNodes: nodes.filter(node => selected.has(node.id)),
            scopedEdges: edges.filter(edge => selected.has(edge.sourceId) && selected.has(edge.targetId)),
        };
    }
    return {scopedNodes: nodes, scopedEdges: edges};
};

export const buildBoardBrief = ({
    title,
    nodes,
    edges,
    selectedNodeIds = [],
    scope = 'board',
}: BoardBriefScope): BoardBrief => {
    const {scopedNodes, scopedEdges} = resolveInsightScope(nodes, edges, scope, selectedNodeIds);
    const citeMap: Record<string, string> = {};
    const reverseCiteMap: Record<string, string> = {};

    const nodeLines = scopedNodes.map((node, index) => {
        const citeId = `n${index + 1}`;
        citeMap[citeId] = node.id;
        reverseCiteMap[node.id] = citeId;
        const kind = node.type === 'article'
            ? '文章'
            : node.type === 'note'
                ? '便签'
                : node.type === 'text'
                    ? '文本'
                    : '图形';
        const label = displayLabel(node);
        const body = nodeBody(node);
        const extra = body && body !== label ? ` ${body}` : '';
        return `- [${citeId}] (${kind}) ${label}${extra}`;
    });

    const edgeLines = scopedEdges.map(edge => {
        const source = reverseCiteMap[edge.sourceId];
        const target = reverseCiteMap[edge.targetId];
        if (!source || !target) return '';
        const label = edge.label?.trim() ? `"${edge.label.trim()}"` : '连线';
        return `- [${source}] --${label}--> [${target}]`;
    }).filter(Boolean);

    let brief = `# 白板：${title.trim() || '未命名白板'}\n节点：\n${nodeLines.join('\n') || '- （无）'}`;
    if (edgeLines.length > 0) {
        brief += `\n连线：\n${edgeLines.join('\n')}`;
    }
    if (brief.length > BOARD_BRIEF_LIMIT) {
        brief = `${brief.slice(0, BOARD_BRIEF_LIMIT).trim()}…`;
    }

    return {
        title,
        brief,
        scope,
        scopedNodes,
        scopedEdges,
        citeMap,
        reverseCiteMap,
        snapshotHash: hashInsightSnapshot(title, scopedNodes, scopedEdges),
        canAnalyze: scopedNodes.some(nodeHasInsightText),
    };
};

export const mapCitedNodeIds = (
    rawIds: unknown,
    citeMap: Record<string, string>,
    validNodeIds: Set<string>,
) => {
    if (!Array.isArray(rawIds)) return [];
    return Array.from(new Set(
        rawIds
            .map(item => String(item || '').trim().replace(/[\[\]]/g, ''))
            .map(item => citeMap[item] || (validNodeIds.has(item) ? item : ''))
            .filter(Boolean)
    ));
};

const asFindingType = (value: unknown): InsightFindingType | null => {
    const type = String(value || '').trim().toLowerCase();
    return FINDING_TYPES.includes(type as InsightFindingType) ? type as InsightFindingType : null;
};

export const normalizeInsightResponse = (
    payload: Partial<WhiteboardInsights> | {findings?: unknown; questions?: unknown},
    citeMap: Record<string, string>,
    validNodeIds: Set<string>,
) => {
    const findings: InsightFinding[] = [];
    for (const item of Array.isArray(payload.findings) ? payload.findings : []) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Partial<InsightFinding>;
        const type = asFindingType(raw.type);
        const title = String(raw.title || '').trim();
        const detail = String(raw.detail || '').trim();
        if (!type || (!title && !detail)) continue;
        const nodeIds = mapCitedNodeIds([
            ...(Array.isArray(raw.nodeIds) ? raw.nodeIds : []),
            ...collectCiteIds(`${title} ${detail}`),
        ], citeMap, validNodeIds);
        findings.push({
            type,
            title: title || detail.slice(0, 24),
            detail,
            nodeIds,
        });
        if (findings.length >= 6) break;
    }

    const questions: InsightQuestion[] = [];
    for (const item of Array.isArray(payload.questions) ? payload.questions : []) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Partial<InsightQuestion> & {question?: string};
        const text = String(raw.text || raw.question || '').trim();
        if (!text) continue;
        const why = String(raw.why || '').trim();
        questions.push({
            text,
            why,
            nodeIds: mapCitedNodeIds([
                ...(Array.isArray(raw.nodeIds) ? raw.nodeIds : []),
                ...collectCiteIds(`${text} ${why}`),
            ], citeMap, validNodeIds),
        });
        if (questions.length >= 6) break;
    }

    return {findings, questions};
};

export const normalizeStoredInsights = (raw: unknown): WhiteboardInsights | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const value = raw as Partial<WhiteboardInsights>;
    if (!Array.isArray(value.findings) && !Array.isArray(value.questions)) return undefined;
    return {
        generatedAt: Number.isFinite(value.generatedAt) ? Number(value.generatedAt) : Date.now(),
        scope: value.scope === 'selection' ? 'selection' : 'board',
        scopeNodeIds: Array.isArray(value.scopeNodeIds) ? value.scopeNodeIds.map(String) : undefined,
        snapshotHash: String(value.snapshotHash || ''),
        citeMap: value.citeMap && typeof value.citeMap === 'object' ? value.citeMap : {},
        findings: Array.isArray(value.findings) ? value.findings.filter(item => item && item.title) : [],
        questions: Array.isArray(value.questions) ? value.questions.filter(item => item && item.text) : [],
        messages: Array.isArray(value.messages)
            ? value.messages.filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
            : [],
    };
};

export const collectCiteIds = (content: string) => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const pattern = new RegExp(CITE_TOKEN_RE.source, CITE_TOKEN_RE.flags);
    for (const match of content.matchAll(pattern)) {
        const citeId = `n${match[1] || match[2]}`;
        if (seen.has(citeId)) continue;
        seen.add(citeId);
        ids.push(citeId);
    }
    return ids;
};

export const shortNodeLabel = (node: WhiteboardNode, limit = 18) => {
    const label = displayLabel(node)
        .replace(/[|[\]]/g, ' ')
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (label.length <= limit) return label;
    return `${label.slice(0, limit).trim()}…`;
};

export const rewriteCitesForDisplay = (
    content: string,
    citeMap: Record<string, string>,
    nodes: WhiteboardNode[],
) => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const pattern = new RegExp(CITE_TOKEN_RE.source, CITE_TOKEN_RE.flags);
    return content.replace(pattern, (_full, bracketId: string, bareId: string) => {
        const citeId = `n${bracketId || bareId}`;
        const node = byId.get(citeMap[citeId] || '');
        if (!node) return '这块卡片';
        return `[${shortNodeLabel(node)}](#cite-${citeId})`;
    });
};

const HOLE_RE = /\uE000(\d+)\uE001/g;

export const markQuotedPhrases = (content: string) => {
    const holes: string[] = [];
    const stash = (value: string) => {
        holes.push(value);
        return `\uE000${holes.length - 1}\uE001`;
    };

    let next = content
        .replace(/```[\s\S]*?```/g, stash)
        .replace(/`[^`\n]+`/g, stash)
        .replace(/\[[^\]]+]\([^)]+\)/g, stash)
        .replace(/\+\+[\s\S]+?\+\+/g, stash)
        .replace(/\^\^[\s\S]+?\^\^/g, stash)
        .replace(/==[\s\S]+?==/g, stash);

    next = next
        .replace(/「([^」\n]{1,100})」/g, '==「$1」==')
        .replace(/“([^”\n]{1,100})”/g, '==“$1”==')
        .replace(/"([^"\n]{2,100})"/g, '=="$1"==')
        .replace(/『([^』\n]{1,100})』/g, '^^『$1』^^')
        .replace(/‘([^’\n]{1,100})’/g, "^^‘$1’^^")
        .replace(/(?<![A-Za-z0-9])'([^'\n]{2,80})'(?![A-Za-z0-9])/g, "^^'$1'^^");

    return next.replace(HOLE_RE, (_match, index) => holes[Number(index)] ?? '');
};

export const prepareInsightMarkdown = (
    content: string,
    citeMap: Record<string, string>,
    nodes: WhiteboardNode[],
) => markQuotedPhrases(rewriteCitesForDisplay(content, citeMap, nodes));

export const insightIsStale = (
    insights: WhiteboardInsights | null | undefined,
    brief: BoardBrief,
) => {
    if (!insights) return false;
    if (insights.scope !== brief.scope) return true;
    if (insights.scope === 'selection') {
        const previous = new Set(insights.scopeNodeIds || []);
        const current = new Set(brief.scopedNodes.map(node => node.id));
        if (previous.size !== current.size) return true;
        for (const id of current) {
            if (!previous.has(id)) return true;
        }
    }
    return insights.snapshotHash !== brief.snapshotHash;
};
