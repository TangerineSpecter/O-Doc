import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantEntryDetail, QuantReport, QuantSource} from '../types/api/quant.ts';
import type {QuantSourceImpactPreview} from '../types/api/quantSourceImpact.ts';
import {readSourceImpact, selectedAnalysisSource, sourceAnalysisRuns, sourceImpactLabels, sourceQuoteLabels, staticSourceReports} from './quantSourceImpact.ts';

function fixture(): QuantSourceImpactPreview {
    return {version: 1, baseline: {report_id: 'report-old', report_hash: 'hash-report', source_id: 'source-old', source_hash: 'hash-old', material_id: 'material-a', language: 'python', created_at: '2026-01-01T00:00:00Z'},
        target: {source_id: 'source-new', source_hash: 'hash-new', material_id: 'material-a', language: 'python', created_at: '2026-01-02T00:00:00Z'}, relationship: 'same_material',
        impact: {version: 1, method: 'conservative-source-impact-v1', status: 'changed', changed_fields: ['code'], source_context_changed: true,
            code: {old_line_count: 2, new_line_count: 3, status: 'exact', total_hunks: 1, omitted_hunks: 0,
                hunks: [{kind: 'replace', old_start: 2, old_end: 2, new_start: 2, new_end: 3, old_text: 'N = 20\n', new_text: 'N = 25\nprint(N)\n', old_truncated: false, new_truncated: false}], limitations: []},
            structure: {old_status: 'parsed', new_status: 'parsed', old_parser: 'python-ast', new_parser: 'python-ast', total_nodes: 2, omitted_nodes: 0,
                counts: {added: 0, removed: 0, changed: 1, moved: 0, identical: 1, direct: 1, potential: 0, unknown: 0},
                nodes: [{id: 'N', name: 'N', kind: 'assignment', change: 'changed', impact: 'direct', old_range: {start_line: 2, end_line: 2}, new_range: {start_line: 2, end_line: 2}, reasons: ['原文字节变化']},
                    {id: 'f', name: 'f', kind: 'function', change: 'identical', impact: 'not_observed', old_range: {start_line: 1, end_line: 1}, new_range: {start_line: 1, end_line: 1}, reasons: []}], limitations: []},
            parameters: [{index: 0, name: 'N', status: 'direct', quotes: [{field: 'code', quote: 'N = 20', status: 'missing', old_lines: [{start_line: 2, end_line: 2}], new_lines: [], old_occurrences: 1, new_occurrences: 0, truncated: false}], node_ids: ['N'], limitations: []}],
            factors: [{index: 0, name: 'f', status: 'quote_present', quotes: [{field: 'code', quote: '<untrusted source>', status: 'present', old_lines: [{start_line: 1, end_line: 1}], new_lines: [{start_line: 1, end_line: 1}], old_occurrences: 1, new_occurrences: 1, truncated: false}], node_ids: ['f'], limitations: []}],
            omitted: {parameters: 0, factors: 0}, recommendation: {action: 'full_reanalysis', start_stage: 'normalize', can_reuse_stages: false, reasons: ['从目标完整分析']}, limitations: []}};
}
const expected = {sourceId: 'source-new', reportId: 'report-old', baselineSourceId: 'source-old'};

test('源码影响读取固定身份和原始字段，保留未知、原引文与受限状态', () => {
    const original = fixture(), json = JSON.stringify(original);
    assert.deepEqual(readSourceImpact(json, expected), original);
    assert.equal(readSourceImpact(json).impact.factors[0].quotes[0].quote, '<untrusted source>');
    assert.equal(sourceImpactLabels.quote_present, '原引文仍在');
    assert.equal(sourceImpactLabels.not_observed, '未观测到影响线索');
    assert.match(sourceImpactLabels.unknown, /未知/);
    assert.match(sourceQuoteLabels.ambiguous, /不明确/);
    const limited = fixture(); limited.local_demo = true; limited.impact.status = 'limited';
    limited.impact.structure.old_status = 'limited'; limited.impact.structure.old_parser = 'none'; limited.impact.structure.limitations = ['结构预算受限'];
    assert.equal(readSourceImpact(JSON.stringify(limited), expected).local_demo, true);
    assert.equal(readSourceImpact(JSON.stringify(limited), expected).impact.status, 'limited');
    assert.equal(JSON.stringify(original), json, '读取不能修改来源或报告证据');
});

test('源码影响拒绝错配身份、非法差异范围、坏计数和伪造安全复用', () => {
    const malformed: ((value: any) => void)[] = [value => {value.version = 2;}, value => {value.local_demo = 'true';}, value => {value.target.created_at = 'invalid';},
        value => {value.relationship = 'same_source';}, value => {value.target.source_id = 'source-old';}, value => {value.target.material_id = 'material-b';},
        value => {value.impact.code.hunks[0].new_start = null;}, value => {value.impact.code.hunks[0].old_end = 10;}, value => {value.impact.code.hunks[0].kind = 'insert';},
        value => {value.impact.code.total_hunks = 5;}, value => {value.impact.structure.counts.changed = 4;}, value => {value.impact.structure.nodes[0].impact = 'safe';},
        value => {value.impact.parameters[0].quotes[0].old_occurrences = -1;}, value => {value.impact.factors[0].status = 'unaffected';},
        value => {value.impact.recommendation.can_reuse_stages = true;}, value => {value.impact.recommendation.start_stage = 'report';}];
    for (const change of malformed) {const value = fixture(); change(value); assert.throws(() => readSourceImpact(JSON.stringify(value)), /无法读取/);}
    for (const wrong of [{...expected, sourceId: 'another-target'}, {...expected, reportId: 'another-report'}, {...expected, baselineSourceId: 'another-source'}]) assert.throws(() => readSourceImpact(JSON.stringify(fixture()), wrong), /无法读取/);
    assert.throws(() => readSourceImpact('{'), /无法读取/);
});

test('分析默认仅跟随基准报告材料的权威当前指针，legacy缺指针不猜时间', () => {
    const source = (id: string, materialId: string, current: string | null, createdAt: string): QuantSource => ({id, materialId, materialCurrentSourceId: current, contentHash: `hash-${id}`, createdAt, payload: {code: id, language: 'python'}} as QuantSource);
    const old = source('old', 'impl-a', 'current', '2026-01-01'), current = source('current', 'impl-a', 'current', '2026-01-02'), unrelated = source('unrelated', 'impl-b', 'unrelated', '2026-02-01');
    const report = {id: 'report', sourceId: old.id, schemaVersion: 3} as QuantReport;
    const entry = {sources: [unrelated, current, old], reports: [report], runs: []} as unknown as QuantEntryDetail;
    const before = JSON.stringify(entry);
    assert.equal(selectedAnalysisSource(entry, report)?.id, 'current');
    assert.equal(selectedAnalysisSource(entry, report, 'old')?.id, 'old', '明确选择优先');
    assert.equal(selectedAnalysisSource(entry, report, 'unrelated')?.id, 'unrelated');
    assert.equal(JSON.stringify(entry), before);
    for (const pointer of [undefined, null, 'missing', 'unrelated']) {
        const copied = {...entry, sources: entry.sources!.map(row => row.id === 'old' ? {...row, materialCurrentSourceId: pointer} : row)};
        assert.equal(selectedAnalysisSource(copied, report)?.id, 'old');
    }
    assert.equal(selectedAnalysisSource(entry, {...report, schemaVersion: 1})?.id, 'current', 'legacy静态报告有明确材料时可跟随指针');
    assert.equal(selectedAnalysisSource(entry, {...report, schemaVersion: 4})?.id, 'old', '实验报告不推断源码后继');
});

test('明确基准包含legacy静态报告而不接收实验反馈，进度匹配提交或获取快照', () => {
    const reports = [1, 2, 3, 4, 5].map(schemaVersion => ({id: `r${schemaVersion}`, schemaVersion, sourceId: 'submitted'})) as QuantReport[];
    const entry = {sources: [{id: 'submitted', payload: {}}, {id: 'feedback', payload: {provenance: 'external_feedback'}}], reports: [...reports, {id: 'missing', schemaVersion: 3, sourceId: 'missing'}, {id: 'feedback', schemaVersion: 3, sourceId: 'feedback'}],
        runs: [{id: 'original', kind: 'analyze', sourceId: 'submitted', resolvedSourceId: 'fetched'}, {id: 'snapshot', kind: 'analyze', sourceId: 'fetched'},
            {id: 'other', kind: 'analyze', sourceId: 'other'}, {id: 'experiment', kind: 'explain', sourceId: 'fetched'}]} as unknown as QuantEntryDetail;
    assert.deepEqual(staticSourceReports(entry).map(row => row.id), ['r1', 'r2', 'r3']);
    assert.deepEqual(sourceAnalysisRuns(entry, 'fetched').map(row => row.id), ['original', 'snapshot']);
    assert.deepEqual(sourceAnalysisRuns(entry, 'submitted').map(row => row.id), ['original']);
    assert.deepEqual(sourceAnalysisRuns(entry, 'new-unanalysed'), []);
    assert.deepEqual(sourceAnalysisRuns(entry), []);
});
