import assert from 'node:assert/strict';
import test from 'node:test';
import type {WhiteboardEdge, WhiteboardNode} from '../types/whiteboard';
import {
    buildBoardBrief,
    hashInsightSnapshot,
    insightIsStale,
    mapCitedNodeIds,
    normalizeInsightResponse,
    normalizeStoredInsights,
    collectCiteIds,
    markQuotedPhrases,
    rewriteCitesForDisplay,
} from './whiteboardInsight';

const note = (id: string, content: string, extras: Partial<WhiteboardNode> = {}): WhiteboardNode => ({
    id,
    type: 'note',
    x: 0,
    y: 0,
    width: 200,
    height: 160,
    zIndex: 1,
    content,
    ...extras,
});

const edge = (sourceId: string, targetId: string, label?: string): WhiteboardEdge => ({
    id: `${sourceId}-${targetId}`,
    sourceId,
    targetId,
    sourceHandle: 'right',
    targetHandle: 'left',
    label,
});

test('buildBoardBrief assigns cite ids and keeps edge labels', () => {
    const brief = buildBoardBrief({
        title: '睡眠与创作',
        nodes: [note('node-a', '睡眠债在累积'), note('node-b', '晚上还在写稿')],
        edges: [edge('node-a', 'node-b', '因果')],
    });

    assert.match(brief.brief, /\[n1].*睡眠债/);
    assert.match(brief.brief, /\[n1] --"因果"--> \[n2]/);
    assert.equal(brief.citeMap.n1, 'node-a');
    assert.equal(brief.canAnalyze, true);
});

test('selection scope only includes selected subgraph', () => {
    const brief = buildBoardBrief({
        title: '选题',
        nodes: [note('a', 'A'), note('b', 'B'), note('c', 'C')],
        edges: [edge('a', 'b'), edge('b', 'c')],
        scope: 'selection',
        selectedNodeIds: ['a', 'b'],
    });

    assert.deepEqual(brief.scopedNodes.map(node => node.id), ['a', 'b']);
    assert.equal(brief.scopedEdges.length, 1);
    assert.doesNotMatch(brief.brief, /\[n3]/);
});

test('empty shapes are not analyzable', () => {
    const brief = buildBoardBrief({
        title: '空',
        nodes: [{
            id: 'shape-1',
            type: 'shape',
            x: 0,
            y: 0,
            width: 120,
            height: 120,
            zIndex: 1,
            shapeType: 'rectangle',
        }],
        edges: [],
    });
    assert.equal(brief.canAnalyze, false);
});

test('normalizeInsightResponse maps cite ids back to node ids', () => {
    const normalized = normalizeInsightResponse({
        findings: [{type: 'tension', title: '打架', detail: '两边说法不同', nodeIds: ['n1', '[n2]']}],
        questions: [{text: '如果前提反了呢？', why: '材料互相打架', nodeIds: ['n1']}],
    }, {n1: 'node-a', n2: 'node-b'}, new Set(['node-a', 'node-b']));

    assert.deepEqual(normalized.findings[0].nodeIds, ['node-a', 'node-b']);
    assert.equal(normalized.questions[0].text, '如果前提反了呢？');
});

test('hash changes when node content changes', () => {
    const first = hashInsightSnapshot('板', [note('a', '旧')], []);
    const second = hashInsightSnapshot('板', [note('a', '新')], []);
    assert.notEqual(first, second);
});

test('insightIsStale detects scope and content drift', () => {
    const current = buildBoardBrief({
        title: '板',
        nodes: [note('a', '新内容')],
        edges: [],
    });
    const stored = normalizeStoredInsights({
        generatedAt: 1,
        scope: 'board',
        snapshotHash: 'old',
        citeMap: {n1: 'a'},
        findings: [{type: 'clue', title: '旧', detail: '', nodeIds: ['a']}],
        questions: [],
        messages: [],
    });
    assert.equal(insightIsStale(stored, current), true);
});

test('mapCitedNodeIds accepts raw node ids', () => {
    assert.deepEqual(
        mapCitedNodeIds(['node-a', 'ghost'], {n1: 'node-a'}, new Set(['node-a'])),
        ['node-a']
    );
});

test('rewriteCitesForDisplay turns bare n1 into the card title', () => {
    const rewritten = rewriteCitesForDisplay(
        'n2和n3可能是同一系统的不同阶段文档',
        {n2: 'node-b', n3: 'node-c'},
        [
            note('node-b', '', {title: 'Spring AI 指南', type: 'article', content: '旧版'}),
            note('node-c', '', {title: '集成设计', type: 'article', content: '新版'}),
        ],
    );
    assert.match(rewritten, /\[Spring AI 指南]\(#cite-n2\)/);
    assert.match(rewritten, /\[集成设计]\(#cite-n3\)/);
    assert.equal(rewritten.includes('n2和'), false);
});

test('rewriteCitesForDisplay strips pipes so markdown tables stay intact', () => {
    const rewritten = rewriteCitesForDisplay(
        '| 卡片 | 阶段 |\n| --- | --- |\n| [n1] | 场景 |',
        {n1: 'node-hot'},
        [note('node-hot', '', {title: '每日科技热点|2026年6月13日', type: 'article', content: '热点'})],
    );
    assert.match(rewritten, /\| \[每日科技热点 2026年6月13日\]\(#cite-n1\) \| 场景 \|/);
    assert.doesNotMatch(rewritten, /热点\|2026/);
});

test('collectCiteIds finds both bracketed and bare tokens', () => {
    assert.deepEqual(collectCiteIds('见 [n1] 与 n3，以及n2。'), ['n1', 'n3', 'n2']);
});

test('markQuotedPhrases uses highlight and wave marks without touching links', () => {
    const marked = markQuotedPhrases('他说「手动动态创建」，以及 "OpenAiChatModel"，还有 [指南](#cite-n2)。');
    assert.match(marked, /==「手动动态创建」==/);
    assert.match(marked, /=="OpenAiChatModel"==/);
    assert.match(marked, /\[指南]\(#cite-n2\)/);
    assert.equal(markQuotedPhrases("don't break").includes("^^"), false);
});
