import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildReadingTree, type ReadingTree} from './readingGraph.ts';
import type {ReadingGraph, ReadingNode} from '../types/bookAnalysis.ts';
import {orderedEvents, relationChartOption} from './readingChartOptions.ts';

const node = (id: string): ReadingNode => ({id, name: id, kind: 'concept', aliases: [], facts: [], ordinal: 1, timeLabel: '', timeOrder: ''});
const graph = (ids: string[], relations: [string, string, string][]): ReadingGraph => ({nodes: ids.map(node), edges: relations.map(([source, target, kind], index) => ({id: String(index), source, target, kind, label: kind, evidence: [], context: {}, origin: 'ai'})), total: ids.length, page: 1, limit: 200});
const flatten = (tree: ReadingTree): string[] => [...(tree.id ? [tree.id] : []), ...(tree.children || []).flatMap(flatten)];

test('mind map covers isolated concepts and cycle members exactly once', () => {
    const tree = buildReadingTree(graph(['a', 'b', 'c', 'd'], [['a', 'b', 'contains'], ['b', 'a', 'contains'], ['b', 'c', 'contains']]), '全书');
    assert.deepEqual(flatten(tree).sort(), ['a', 'b', 'c', 'd']);
});
test('dependencies point from prerequisite to learning topic in the tree', () => {
    const tree = buildReadingTree(graph(['基础', '进阶'], [['进阶', '基础', 'depends_on']]), '导读');
    assert.equal(tree.children?.[0].id, '基础');
    assert.equal(tree.children?.[0].children?.[0].id, '进阶');
});
test('dangling references and unrelated graph edges do not hide concepts', () => {
    assert.deepEqual(flatten(buildReadingTree(graph(['a', 'b'], [['missing', 'a', 'contains'], ['a', 'b', 'contrasts']]), '章节')), ['a', 'b']);
});
test('relation nodes are bounded circles without degenerate grid coordinates', () => {
    for (const count of [1, 2, 50, 200]) {
        const option = relationChartOption(graph(Array.from({length: count}, (_, i) => String(i)), []));
        const series = (option.series as {preserveAspect: string; nodeScaleRatio: number; data: {symbol: string; symbolSize: number; x?: number; y?: number}[]}[])[0];
        assert.equal(series.preserveAspect, 'contain');
        assert.equal(series.nodeScaleRatio, 0);
        series.data.forEach(n => {assert.equal(n.symbol, 'circle'); assert.ok(n.symbolSize <= 23); assert.equal(n.x, undefined); assert.equal(n.y, undefined);});
    }
});
test('event ordering retains unknown time and does not mutate the source graph', () => {
    const events = [{...node('unknown'), timeLabel: '某天夜里', ordinal: 3}, {...node('later'), timeOrder: '2000-02', ordinal: 1}, {...node('earlier'), timeOrder: '2000-01', ordinal: 2}];
    assert.deepEqual(orderedEvents(events, 'time').map(n => n.id), ['earlier', 'later', 'unknown']);
    assert.deepEqual(orderedEvents(events, 'narrative').map(n => n.id), ['later', 'earlier', 'unknown']);
    assert.equal(events[0].timeLabel, '某天夜里');
});
