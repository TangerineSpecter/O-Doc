import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readResearchMemory, researchMemoryReference} from './quantResearchMemory.ts';
import {selectMockResearchMemory, type MockMemoryItem} from '../mocks/quant/researchMemoryContract.ts';

const item = (index: number, negative = false): MockMemoryItem => ({id: `comparison-${index}`, kind: 'comparison', title: '直接对照', entry_id: 'left-entry',
    created_at: '2024-01-01T00:00:00Z', content_hash: 'frozen-evidence', has_negative_evidence: negative,
    reason: {shared_candidate_ids: ['Case_N'], shared_families: [], shared_tags: [], same_market: false, rank_score: 8},
    evidence: {sides: {left: {parameters: {Case_N: 20}}, right: {parameters: {Length: 8}}}, result: {status: negative ? 'fail' : 'pass'}, logical_merges: {items: []}}});

test('v2历史对照保留字面实际参数，失败优先且不把同机制当作直接相关', () => {
    const rows = Array.from({length: 7}, (_, i) => item(i, i === 6));
    const memory = selectMockResearchMemory(rows, '2024-01-02T00:00:00Z', {experiments: 0, feedback: 0, comparisons: 7}, 2);
    assert.equal(memory.items.length, 4); assert.equal(memory.items[0].id, 'comparison-6');
    const read = readResearchMemory(JSON.stringify(memory))!;
    assert.equal(read.version, 2); assert.equal(read.method, 'library-history-v2');
    assert.equal(read.scanned.comparisons, 7); assert.equal(read.eligible.comparisons, 7);
    assert.equal(researchMemoryReference(read.items[0]), 'memory:comparison:comparison-6');
    assert.deepEqual(read.items[0].evidence.sides, rows[6].evidence.sides);
    const similar = {...item(9), reason: {shared_candidate_ids: [], shared_families: ['momentum'], shared_tags: [], same_market: false, rank_score: 2}};
    assert.equal(selectMockResearchMemory([similar], memory.cutoff, {experiments: 0, feedback: 0, comparisons: 1}, 2).items.length, 0);
});

test('v2对照统计与版本严格匹配，旧v1不升级或接收对照证据', () => {
    const memory = selectMockResearchMemory([item(0)], '2024-01-02T00:00:00Z', {experiments: 0, feedback: 0, comparisons: 1}, 2);
    const invalid: unknown[] = [{...memory, version: 1}, {...memory, method: 'library-history-v1'},
        {...memory, scanned: {experiments: 0, feedback: 0}}, {...memory, eligible: {...memory.eligible, comparisons: 2}},
        {...memory, items: [{...item(0), has_negative_evidence: null}]}, {...memory, items: [item(0), item(0)]},
        {...memory, scanned: {...memory.scanned, comparisons: 6}, eligible: {...memory.eligible, comparisons: 6}, items: Array.from({length: 5}, (_, i) => item(i))}];
    for (const value of invalid) assert.throws(() => readResearchMemory(JSON.stringify(value)), /无法读取/);
    const legacy = selectMockResearchMemory([item(0)], memory.cutoff, {experiments: 0, feedback: 0});
    assert.equal(legacy.version, 1); assert.equal(legacy.items.length, 0); assert.ok(!('comparisons' in legacy.scanned));
    assert.equal(readResearchMemory(JSON.stringify(legacy))!.version, 1);
});

test('对照证据预算按整份省略，不裁掉参数或撤销状态', () => {
    const large = {...item(0, true), evidence: {source: '全'.repeat(33000), withdrawal: '负面撤销原因'}};
    const memory = selectMockResearchMemory([large, item(1)], '2024-01-02T00:00:00Z', {experiments: 0, feedback: 0, comparisons: 2}, 2);
    assert.equal(memory.omitted_for_size, 1); assert.equal(memory.items.length, 1);
    assert.equal(readResearchMemory(JSON.stringify(memory))!.items[0].id, 'comparison-1');
    assert.equal(large.evidence.withdrawal, '负面撤销原因');
});
