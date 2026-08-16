import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import type {WhiteboardDocument, WhiteboardEdge, WhiteboardNode} from '../types/whiteboard';
import {getDotBackgroundStyle, getWorldTransform, zoomAtPoint} from './whiteboardCamera';
import {getEdgeLabelPoint, getEdgePath} from './whiteboardUtils';
import {
    addNoteNode,
    addShapeNode,
    addTextNode,
    applyPointerConnection,
    connectNodes,
    deleteSelection,
    duplicateSelection,
    inferConnectionHandles,
    findSnapTarget,
    fitToContent,
    layoutByConnections,
    nodeAfterResize,
    nodesAfterDrag,
    moveNodes,
    nodeFitsInViewport,
    normalizeDocument,
    setEdgeLabel,
    setEdgeStyle,
    setNodeLabel,
    setNoteColor,
    toggleNodeSelection,
} from './whiteboardOps';

const oldBoard = (): WhiteboardDocument => ({
    id: 'wb-pre-redesign',
    title: '旧灵感白板',
    nodes: [
        {
            id: 'note-1',
            type: 'note',
            x: 40,
            y: 60,
            width: 180,
            height: 140,
            zIndex: 1,
            content: '旧便签',
            color: '#fef3c7',
        },
        {
            id: 'article-1',
            type: 'article',
            x: 320,
            y: 40,
            width: 260,
            height: 200,
            zIndex: 2,
            title: '旧文章',
            content: '# hello',
            articleId: 'art-9',
        },
        {
            id: 'shape-1',
            type: 'shape',
            x: 80,
            y: 280,
            width: 120,
            height: 120,
            zIndex: 3,
            shapeType: 'circle',
        },
    ],
    edges: [
        {
            id: 'edge-1',
            sourceId: 'note-1',
            targetId: 'article-1',
            sourceHandle: 'right',
            targetHandle: 'left',
        },
    ],
    viewOffset: {x: 12, y: 24},
    scale: 0.9,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
});

test('loads a pre-redesign article/note/shape document without inventing required new fields', () => {
    const document = normalizeDocument(oldBoard());

    assert.equal(document.id, 'wb-pre-redesign');
    assert.equal(document.nodes.length, 3);
    assert.deepEqual(document.nodes.map(node => node.type), ['note', 'article', 'shape']);
    assert.equal(document.nodes[0].content, '旧便签');
    assert.equal(document.nodes[0].color, '#fef3c7');
    assert.equal(document.nodes[1].articleId, 'art-9');
    assert.equal(document.nodes[2].shapeType, 'circle');
    assert.equal(document.edges.length, 1);
    assert.equal(document.edges[0].sourceId, 'note-1');
    assert.equal(document.edges[0].style, undefined);
    assert.equal(document.edges[0].label, undefined);
    assert.equal(document.viewOffset.x, 12);
    assert.equal(document.scale, 0.9);
});

test('adds note, text, and shape nodes onto a migrated old board', () => {
    let nodes: WhiteboardNode[] = normalizeDocument(oldBoard()).nodes;

    nodes = addNoteNode(nodes, {id: 'note-new', x: 500, y: 300, zIndex: 4, content: '新想法'});
    nodes = addTextNode(nodes, {id: 'text-new', x: 700, y: 120, zIndex: 5, title: '标题卡'});
    nodes = addShapeNode(nodes, {id: 'shape-new', x: 520, y: 480, zIndex: 6, shapeType: 'diamond'});

    const note = nodes.find(node => node.id === 'note-new');
    const text = nodes.find(node => node.id === 'text-new');
    const shape = nodes.find(node => node.id === 'shape-new');

    assert.ok(note && text && shape);
    assert.equal(note.type, 'note');
    assert.equal(note.content, '新想法');
    assert.ok(note.color);
    assert.equal(text.type, 'text');
    assert.equal(text.title, '标题卡');
    assert.equal(shape.type, 'shape');
    assert.equal(shape.shapeType, 'diamond');
    assert.equal(nodes.filter(node => node.type === 'article').length, 1);
});

test('sets a note color and editable labels on text/shape nodes', () => {
    let nodes: WhiteboardNode[] = normalizeDocument(oldBoard()).nodes;
    nodes = addTextNode(nodes, {id: 'text-1', x: 10, y: 10, zIndex: 8, title: ''});

    nodes = setNoteColor(nodes, ['note-1'], '#bae6fd');
    nodes = setNodeLabel(nodes, 'text-1', '灵感标题');
    nodes = setNodeLabel(nodes, 'shape-1', '决策点');

    const note = nodes.find(node => node.id === 'note-1');
    const text = nodes.find(node => node.id === 'text-1');
    const shape = nodes.find(node => node.id === 'shape-1');

    assert.equal(note?.color, '#bae6fd');
    assert.equal(text?.label, '灵感标题');
    assert.equal(text?.title, '灵感标题');
    assert.equal(shape?.label, '决策点');
    assert.equal(shape?.title, '决策点');
    assert.equal(nodes.find(node => node.id === 'article-1')?.title, '旧文章');
});

test('connects two nodes and then styles/labels the new edge', () => {
    const document = normalizeDocument(oldBoard());
    let edges: WhiteboardEdge[] = document.edges;

    edges = connectNodes(edges, document.nodes, 'note-1', 'shape-1', {id: 'edge-2'});
    const created = edges.find(edge => edge.id === 'edge-2');
    assert.ok(created);
    assert.equal(created.sourceId, 'note-1');
    assert.equal(created.targetId, 'shape-1');
    assert.ok(created.sourceHandle);
    assert.ok(created.targetHandle);

    edges = setEdgeStyle(edges, 'edge-2', 'dashed');
    edges = setEdgeLabel(edges, 'edge-2', '推导');

    const styled = edges.find(edge => edge.id === 'edge-2');
    assert.equal(styled?.style, 'dashed');
    assert.equal(styled?.label, '推导');
    assert.equal(edges.find(edge => edge.id === 'edge-1')?.style, undefined);
});

test('does not create a duplicate connection between the same handles', () => {
    const document = normalizeDocument(oldBoard());
    const once = connectNodes(document.edges, document.nodes, 'note-1', 'article-1', {
        sourceHandle: 'right',
        targetHandle: 'left',
    });
    assert.equal(once.length, document.edges.length);
});

test('multi-select can move and duplicate a group, including inner edges', () => {
    const document = normalizeDocument(oldBoard());
    const selected = toggleNodeSelection(
        toggleNodeSelection([], 'note-1'),
        'article-1',
        true
    );
    assert.deepEqual(selected, ['note-1', 'article-1']);

    const moved = moveNodes(document.nodes, selected, 30, -15);
    const note = moved.find(node => node.id === 'note-1');
    const article = moved.find(node => node.id === 'article-1');
    const shape = moved.find(node => node.id === 'shape-1');
    assert.equal(note?.x, 70);
    assert.equal(note?.y, 45);
    assert.equal(article?.x, 350);
    assert.equal(shape?.x, 80);

    let nextId = 0;
    const duplicated = duplicateSelection(moved, document.edges, selected, {
        offsetX: 40,
        offsetY: 40,
        idFactory: () => `dup-${++nextId}`,
    });

    assert.equal(duplicated.newIds.length, 2);
    assert.equal(duplicated.nodes.length, moved.length + 2);
    assert.equal(duplicated.edges.length, document.edges.length + 1);

    const copiedEdge = duplicated.edges.find(edge => edge.id === 'dup-3' || !document.edges.some(old => old.id === edge.id));
    assert.ok(copiedEdge);
    assert.ok(duplicated.newIds.includes(copiedEdge.sourceId));
    assert.ok(duplicated.newIds.includes(copiedEdge.targetId));
});

test('fit-to-content places every node inside the viewport math', () => {
    const nodes: WhiteboardNode[] = [
        {id: 'a', type: 'note', x: -400, y: -120, width: 160, height: 120, zIndex: 1},
        {id: 'b', type: 'shape', x: 680, y: 520, width: 180, height: 160, zIndex: 2, shapeType: 'rectangle'},
        {id: 'c', type: 'text', x: 80, y: 900, width: 200, height: 100, zIndex: 3},
    ];
    const viewport = {width: 960, height: 640};
    const transform = fitToContent(nodes, viewport, 80);

    assert.ok(transform.scale > 0);
    assert.ok(transform.scale <= 1.5);
    for (const node of nodes) {
        assert.equal(
            nodeFitsInViewport(node, transform, viewport),
            true,
            `${node.id} should sit in the viewport after fit-to-content`
        );
    }
});

test('shipped manage page and canvas chrome use slate paper, new tools, and outline/preview', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const page = readFileSync(join(srcDir, 'views/WhiteboardPage.tsx'), 'utf8');
    const manage = readFileSync(join(srcDir, 'views/WhiteboardManagePage.tsx'), 'utf8');
    const sidebar = readFileSync(join(srcDir, 'components/Whiteboard/WhiteboardSidebar.tsx'), 'utf8');
    const inspector = readFileSync(join(srcDir, 'components/Whiteboard/WhiteboardInspector.tsx'), 'utf8');
    const outline = readFileSync(join(srcDir, 'components/Whiteboard/WhiteboardOutline.tsx'), 'utf8');

    assert.match(page, /#f0f2f5/);
    assert.match(page, /getDotBackgroundStyle/);
    assert.match(page, /getWorldTransform/);
    assert.match(page, /layoutByConnections/);
    assert.match(manage, /BoardPreview/);
    assert.doesNotMatch(page, /#f6efe3/);
    assert.doesNotMatch(manage, /#f6efe3/);
    assert.match(sidebar, /label: '选择'/);
    assert.match(sidebar, /label: '平移'/);
    assert.match(sidebar, /label: '便签'/);
    assert.match(sidebar, /label: '文本'/);
    assert.match(sidebar, /label: '图形'/);
    assert.match(sidebar, /label: '连线'/);
    assert.match(sidebar, /插入文章/);
    assert.doesNotMatch(sidebar, /'hand'/);
    assert.doesNotMatch(page, /useState<'select' \| 'hand'>/);
    assert.match(inspector, /便签颜色/);
    assert.match(outline, /大纲/);
});

test('delete selection removes chosen nodes, their edges, and a selected lone edge', () => {
    const document = normalizeDocument(oldBoard());
    const afterNodes = deleteSelection(document.nodes, document.edges, ['note-1']);
    assert.equal(afterNodes.nodes.some(node => node.id === 'note-1'), false);
    assert.equal(afterNodes.nodes.some(node => node.id === 'article-1'), true);
    assert.equal(afterNodes.edges.length, 0);

    const afterEdge = deleteSelection(document.nodes, document.edges, [], ['edge-1']);
    assert.equal(afterEdge.nodes.length, 3);
    assert.equal(afterEdge.edges.length, 0);
});

test('a connect-tool pointer down+up adds at most one edge when snap handles differ from inferred', () => {
    const document = normalizeDocument(oldBoard());
    const source = document.nodes.find(node => node.id === 'note-1');
    const target = document.nodes.find(node => node.id === 'shape-1');
    assert.ok(source && target);

    const inferred = inferConnectionHandles(source, target);
    const pointerInput = {
        sourceId: 'note-1',
        sourceHandle: 'top' as const,
        snappedTarget: {nodeId: 'shape-1', handle: 'left' as const},
        clickedTargetId: 'shape-1',
    };
    assert.notEqual(pointerInput.sourceHandle, inferred.sourceHandle);

    const once = applyPointerConnection([], document.nodes, pointerInput);
    const twice = applyPointerConnection(once, document.nodes, pointerInput);
    assert.equal(once.length, 1);
    assert.equal(twice.length, 1);
    assert.equal(once[0].sourceId, 'note-1');
    assert.equal(once[0].targetId, 'shape-1');
    assert.equal(once[0].sourceHandle, 'top');
    assert.equal(once[0].targetHandle, 'left');
});

test('WhiteboardPage completes a connection only on pointer up, not also on node mousedown', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const page = readFileSync(join(srcDir, 'views/WhiteboardPage.tsx'), 'utf8');
    const downAt = page.indexOf('const handleNodeMouseDown');
    const dragAt = page.indexOf('const handleDragStart');
    const commitAt = page.indexOf('const commitPointerGesture');
    assert.ok(downAt >= 0 && dragAt > downAt && commitAt >= 0);
    const downFn = page.slice(downAt, dragAt);
    assert.doesNotMatch(downFn, /applyPointerConnection|connectNodes/);
    assert.match(downFn, /pendingConnectTargetRef/);
    assert.match(page.slice(commitAt, commitAt + 1600), /applyPointerConnection/);
});

test('edge path is a straight line and label sits on the midpoint', () => {
    const start = {x: 10, y: 20};
    const end = {x: 110, y: 80};
    assert.equal(getEdgePath(start, end, 'right', 'left'), 'M 10 20 L 110 80');
    assert.doesNotMatch(getEdgePath(start, end, 'right', 'left'), / C /);
    assert.deepEqual(getEdgeLabelPoint(start, end), {x: 60, y: 50});
});

test('dot background stays viewport-sized and tracks camera scale/offset', () => {
    const style = getDotBackgroundStyle(2, {x: 40, y: -16});
    assert.equal(style.backgroundSize, '48px 48px');
    assert.equal(style.backgroundPosition, '40px -16px');
    assert.equal(getWorldTransform({x: 12, y: 8}, 1.5), 'translate3d(12px, 8px, 0) scale(1.5)');

    const zoomed = zoomAtPoint(1, {x: 0, y: 0}, 2, {x: 100, y: 80});
    assert.equal(zoomed.scale, 2);
    assert.equal(100 * zoomed.scale + zoomed.viewOffset.x, 100);
    assert.equal(80 * zoomed.scale + zoomed.viewOffset.y, 80);
});

test('layout follows connection direction left-to-right and rewrites handles', () => {
    const nodes: WhiteboardNode[] = [
        {id: 'a', type: 'note', x: 400, y: 10, width: 120, height: 80, zIndex: 1},
        {id: 'b', type: 'note', x: 10, y: 300, width: 120, height: 80, zIndex: 2},
        {id: 'c', type: 'note', x: 200, y: 8, width: 120, height: 80, zIndex: 3},
    ];
    const edges: WhiteboardEdge[] = [
        {id: 'e1', sourceId: 'a', targetId: 'b', sourceHandle: 'top', targetHandle: 'bottom'},
        {id: 'e2', sourceId: 'b', targetId: 'c', sourceHandle: 'top', targetHandle: 'bottom'},
    ];
    const laid = layoutByConnections(nodes, edges);
    const a = laid.nodes.find(node => node.id === 'a');
    const b = laid.nodes.find(node => node.id === 'b');
    const c = laid.nodes.find(node => node.id === 'c');
    assert.ok(a && b && c);
    assert.ok(a.x < b.x);
    assert.ok(b.x < c.x);
    const ab = laid.edges.find(edge => edge.id === 'e1');
    assert.equal(ab?.sourceHandle, 'right');
    assert.equal(ab?.targetHandle, 'left');
});

test('snap target and drag/resize math stay on the shipped helpers', () => {
    const document = normalizeDocument(oldBoard());
    const nearRight = {x: 220, y: 130};
    const snapped = findSnapTarget(nearRight, document.nodes, 'shape-1', 110, 48);
    assert.ok(snapped);
    assert.equal(snapped.nodeId, 'note-1');
    assert.equal(snapped.handle, 'right');
    assert.equal(snapped.isSnapped, true);

    const far = findSnapTarget({x: 2000, y: 2000}, document.nodes, 'note-1', 110, 48);
    assert.equal(far, null);

    const dragged = nodesAfterDrag(document.nodes, {['note-1']: {x: 40, y: 60}}, 15, -8);
    assert.equal(dragged.find(node => node.id === 'note-1')?.x, 55);
    assert.equal(dragged.find(node => node.id === 'note-1')?.y, 52);
    assert.equal(dragged.find(node => node.id === 'shape-1')?.x, 80);

    const resized = nodeAfterResize(document.nodes[0], {x: 80, y: 90});
    assert.equal(resized.width, 180);
    assert.equal(resized.height, 120);
});

test('WhiteboardPage does not write node state while the pointer is moving', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const page = readFileSync(join(srcDir, 'views/WhiteboardPage.tsx'), 'utf8');
    const frameAt = page.indexOf('const applyPointerFrame =');
    const frameEnd = page.indexOf('applyPointerFrameRef.current = applyPointerFrame');
    const commitAt = page.indexOf('const commitPointerGesture');
    assert.ok(frameAt >= 0 && frameEnd > frameAt && commitAt > frameEnd);
    const frameFn = page.slice(frameAt, frameEnd);
    assert.doesNotMatch(frameFn, /setNodes|updateNodes|updateWhiteboardState/);
    assert.match(frameFn, /style\.left/);
    assert.match(frameFn, /paintEdgesForNodes/);
    assert.match(page, /data-edge-line/);
    assert.match(page.slice(commitAt), /nodesAfterDrag/);
});

test('WhiteboardPage persists the z-index raised when a drag starts', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const page = readFileSync(join(srcDir, 'views/WhiteboardPage.tsx'), 'utf8');
    const dragStartAt = page.indexOf('const handleDragStart');
    const connectStartAt = page.indexOf('const handleConnectStart');
    assert.ok(dragStartAt >= 0 && connectStartAt > dragStartAt);
    const dragStart = page.slice(dragStartAt, connectStartAt);

    assert.match(dragStart, /const raisedZIndex = nextZIndex\(\)/);
    assert.match(dragStart, /setNodes\(prev => prev\.map\(item => item\.id === id \? \{\.\.\.item, zIndex: raisedZIndex\} : item\)\)/);
    assert.match(dragStart, /el\.style\.zIndex = String\(raisedZIndex\)/);
});

test('duplicating the same source twice yields distinct node ids', () => {
    const document = normalizeDocument(oldBoard());
    const first = duplicateSelection(document.nodes, document.edges, ['note-1']);
    const second = duplicateSelection(first.nodes, first.edges, ['note-1']);

    assert.equal(first.newIds.length, 1);
    assert.equal(second.newIds.length, 1);
    assert.notEqual(first.newIds[0], second.newIds[0]);
    assert.notEqual(first.newIds[0], 'note-1');
    assert.equal(second.nodes.filter(node => node.id === first.newIds[0]).length, 1);
    assert.equal(second.nodes.filter(node => node.id === second.newIds[0]).length, 1);
    assert.equal(second.nodes.filter(node => node.id === 'note-1').length, 1);
});
