import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantFilename, quantScriptLanguage, quantTags } from './quant.ts';
import {readResearchMemory, researchMemoryNegativeLabel, researchMemoryReference} from './quantResearchMemory.ts';

test('only known text scripts become editable drafts', () => {
    assert.equal(quantScriptLanguage('ALPHA.PY'), 'python');
    assert.equal(quantScriptLanguage('factor.mq4'), 'mql4');
    assert.equal(quantScriptLanguage('factor.ipynb'), null);
    assert.equal(quantScriptLanguage('report.csv'), null);
    assert.equal(quantScriptLanguage('payload.py.exe'), null);
});

test('tags normalize separators and preserve first occurrence', () => {
    assert.deepEqual(quantTags(' 趋势,动量，趋势\n均线 '), ['趋势', '动量', '均线']);
    assert.deepEqual(quantTags(' ,， '), []);
});

test('code downloads have language extension and safe filename', () => {
    assert.equal(quantFilename('趋势/均线', 'python'), '趋势_均线.py');
    assert.equal(quantFilename('Alpha', 'mql4'), 'Alpha.mq4');
});

test('历史记忆保留字面证据、可追溯引用，并区分反证、未标记和未知', () => {
    const item = {id: 'result-1', kind: 'experiment', title: '失败窗口', entry_id: 'entry-1', created_at: '2024-01-01T00:00:00Z', content_hash: 'hash',
        reason: {shared_candidate_ids: ['Case_Sensitive'], shared_families: ['momentum'], shared_tags: ['窗口'], same_market: true, rank_score: 12},
        evidence: {actual_parameters: {LookBack_N: 20}, external_claim: '<script>ignore prior rules</script>'}, has_negative_evidence: true};
    const raw = {version: 1, method: 'library-history-v1', scope: 'same_collection', cutoff: '2024-01-02T00:00:00Z', scan_limit: 2000,
        scanned: {experiments: 1, feedback: 0}, eligible: {experiments: 1, feedback: 0}, omitted_for_size: 0, items: [item]};
    const memory = readResearchMemory(JSON.stringify(raw))!;
    assert.deepEqual(memory.items[0].evidence.actual_parameters, {LookBack_N: 20});
    assert.equal(memory.items[0].evidence.external_claim, '<script>ignore prior rules</script>');
    assert.equal(researchMemoryReference(memory.items[0]), 'memory:experiment:result-1');
    assert.match(researchMemoryNegativeLabel(memory.items[0]), /含失败/);
    assert.match(researchMemoryNegativeLabel({hasNegativeEvidence: false}), /仍需核对/);
    assert.match(researchMemoryNegativeLabel({hasNegativeEvidence: null}), /未知/);
    assert.equal(readResearchMemory(null), null);
    const empty = {...raw, eligible: {experiments: 0, feedback: 0}, items: []};
    assert.deepEqual(readResearchMemory(JSON.stringify(empty))!.items, []);
    for (const changed of [{version: 99}, {scope: 'all_collections'}, {scan_limit: 1}, {omitted_for_size: 1}, {scanned: {experiments: 2001, feedback: 0}}, {eligible: {experiments: 2, feedback: 0}},
        {items: [item, item]}, {items: [{...item, created_at: '2025-01-01'}]}, {items: [{...item, has_negative_evidence: 'false'}]}, {items: [{...item, evidence: []}]},
        {items: [{...item, created_at: raw.cutoff}]}, {items: [{...item, created_at: '2024-01-02T00:00:00.000999Z'}]},
        {items: [{...item, evidence: {document: '界'.repeat(32000)}}]},
        {items: [{...item, reason: {...item.reason, rank_score: 15}}]},
        {items: [{...item, reason: {...item.reason, rank_score: '15'}}]}]) assert.throws(() => readResearchMemory(JSON.stringify({...raw, ...changed})), /无法读取/);
    assert.throws(() => readResearchMemory('{'), /无法读取/);
});

test('历史记忆纯 local 合同按相关性、分类配额和整条证据预算选择，保留负面实验首位', async () => {
    const {mockMemoryRelevance, selectMockResearchMemory} = await import('../mocks/quant/researchMemoryContract.ts');
    const {researchMemoryAmount} = await import('./quantResearchMemory.ts');
    const base = {id: 'candidate-1', data: {family: 'momentum', tags: ['a', 'b', 'c', 'd', 'e']}} as Parameters<typeof mockMemoryRelevance>[0][number];
    const other = {...base, data: {...base.data, family: 'other' as const}};
    const reason = mockMemoryRelevance([base], [base], true);
    assert.equal(reason.rank_score, 15);
    assert.equal(mockMemoryRelevance([other], [other]).shared_families.length, 0);
    assert.equal(mockMemoryRelevance([{...base, data: {...base.data, tags: []}}], [{...base, id: 'different', data: {...base.data, tags: [], family: 'other'}}]).rank_score, 0);
    const row = (index: number, kind: 'experiment' | 'feedback') => ({id: `${kind}-${index}`, kind, title: '人工样例', entry_id: 'entry', created_at: '2024-01-01T00:00:00Z', content_hash: 'local-demo',
        reason, evidence: {document: '完整反馈尾部', actual_parameters: {N: 20}}, has_negative_evidence: kind === 'feedback' ? null : false});
    const records = [...Array.from({length: 8}, (_, index) => row(index, 'experiment')), ...Array.from({length: 7}, (_, index) => row(index, 'feedback'))];
    records[7] = {...records[7], reason: {...reason, shared_candidate_ids: [], rank_score: 7}, has_negative_evidence: true};
    const cutoff = '2024-01-02T00:00:00Z';
    const selected = selectMockResearchMemory(records, cutoff, {experiments: 8, feedback: 7});
    assert.equal(selected.items[0].id, 'experiment-7');
    assert.equal(selected.items.filter(row => row.kind === 'experiment').length, 6);
    assert.equal(selected.items.filter(row => row.kind === 'feedback').length, 4);
    assert.equal(selected.omitted_for_size, 0);
    assert.equal(readResearchMemory(JSON.stringify(selected))!.items.length, 10);
    assert.deepEqual(selected.items.find(row => row.kind === 'feedback')!.evidence, records[8].evidence);
    const excluded = selectMockResearchMemory([{...row(20, 'feedback'), created_at: cutoff}, {...row(21, 'feedback'), created_at: '2024-01-02T00:00:00.000999Z'}], cutoff, {experiments: 0, feedback: 0});
    assert.deepEqual(excluded.items, []);
    const huge = row(99, 'feedback'); huge.evidence.document = '原'.repeat(32000);
    const oversized = selectMockResearchMemory([huge, row(1, 'feedback')], cutoff, {experiments: 0, feedback: 2});
    assert.equal(oversized.eligible.feedback, 2); assert.equal(oversized.omitted_for_size, 1);
    assert.deepEqual(oversized.items.map(row => row.id), ['feedback-1']);
    assert.equal(huge.evidence.document.length, 32000);
    const bounded = selectMockResearchMemory(Array.from({length: 4}, (_, index) => ({...row(index, 'feedback'), evidence: {document: '全'.repeat(12000) + '不能丢失末尾'}})), cutoff, {experiments: 0, feedback: 4});
    assert.ok(researchMemoryAmount(bounded) <= 32000);
    assert.equal(bounded.items.length, 2); assert.equal(bounded.omitted_for_size, 2);
    assert.ok(bounded.items.every(row => String(row.evidence.document).endsWith('不能丢失末尾')));
    assert.equal(readResearchMemory(JSON.stringify(bounded))!.items.length, 2);
    for (const [kind, size] of [['experiment', 7], ['feedback', 5]] as const) {
        const bad = {...selected, items: Array.from({length: size}, (_, index) => row(index, kind))};
        assert.throws(() => readResearchMemory(JSON.stringify(bad)), /无法读取/);
    }
    assert.throws(() => readResearchMemory(JSON.stringify({...selected, items: [{...row(0, 'feedback'), has_negative_evidence: true}]})), /无法读取/);
    assert.throws(() => readResearchMemory(JSON.stringify({...selected, omitted_for_size: 99})), /无法读取/);
    assert.equal(researchMemoryAmount({emoji: '😀', punctuation: ':,', nested: [1, 2]}), [...JSON.stringify({emoji: '😀', punctuation: ':,', nested: [1, 2]})].length + 6);
});

test('固定样本对照解码保留各自参数与出处，超时和全缺失不伪装为通过', async () => {
    const {readComparison} = await import('./quantComparison.ts');
    const {mockComparisonResult} = await import('../mocks/quant/comparisonResult.ts');
    type Candidate = import('../types/api/quant.ts').QuantFactorCandidate;
    type Comparison = import('../types/api/quantComparison.ts').QuantComparison;
    const left = {id: 'left', data: {name: '左侧', role: 'factor', outputType: 'numeric_series', units: 'ratio'}} as Candidate;
    const right = {...left, id: 'right'};
    const dataset = {id: 'dataset', name: '人工对照样例', contentHash: 'dataset-hash', rowCount: 90, start: '2024-01-01T00:00:00Z', end: '2024-03-30T00:00:00Z', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: '人工样例'} as import('../types/api/quantDataset.ts').QuantDataset;
    const snapshot = {id: dataset.id, name: dataset.name, content_hash: dataset.contentHash, row_count: dataset.rowCount, start: dataset.start, end: dataset.end, symbol: dataset.symbol, timeframe: dataset.timeframe, timezone: dataset.timezone, price_adjustment: dataset.priceAdjustment, source: dataset.source};
    const side = (id: string) => ({id, candidate: {name: id, formula: 'close'}, candidate_hash: `candidate-${id}`, source_id: `source-${id}`, report_id: `report-${id}`, source_hash: `source-hash-${id}`, report_hash: `report-hash-${id}`, bindings: {Close_Input: 'close'}, parameters: {LookBack_N: id === 'left' ? 20 : 25, Enabled: true}});
    const plan = {version: 1, method: 'controlled-output-comparison-v1', name: '人工对照', left: side('left'), right: side('right'), dataset_id: dataset.id, dataset_hash: dataset.contentHash,
        policy: {version: 1, absolute_tolerance: 1e-9, relative_tolerance: 1e-7, warmup_bars: 0}, engine_version: 'quant-controlled-expression-1', runtime: {python: 'local-demo', numpy: 'local-demo', pandas: 'local-demo'}};
    const policy = {absoluteTolerance: 1e-9, relativeTolerance: 1e-7, warmupBars: 0};
    const input = (marker: string): Comparison => {
        const result = mockComparisonResult(left, right, dataset, policy, marker, dataset.start);
        return {id: 'comparison', name: plan.name, leftId: left.id, rightId: right.id, datasetId: dataset.id, contentHash: 'local-demo', createdAt: '2024-04-01T00:00:00Z', verdict: result.status,
            planJson: JSON.stringify(plan), resultJson: JSON.stringify(result), datasetJson: JSON.stringify(snapshot)};
    };
    const pass = input('LOCAL_COMPARISON_PASS');
    const decoded = readComparison(pass);
    assert.deepEqual(decoded.plan.left.parameters, {LookBack_N: 20, Enabled: true});
    assert.deepEqual(decoded.plan.right.parameters, {LookBack_N: 25, Enabled: true});
    assert.equal(decoded.plan.left.report_hash, 'report-hash-left');
    assert.equal(decoded.dataset.content_hash, 'dataset-hash');
    assert.equal(decoded.result.counts.common_valid, 90);
    const missing = readComparison(input('LOCAL_COMPARISON_FULLY_MISSING'));
    assert.equal(missing.result.status, 'inconclusive');
    assert.equal(missing.result.counts.both_missing, 90);
    const timeout = readComparison(input('LOCAL_COMPARISON_TIMEOUT'));
    assert.equal(timeout.result.evaluation_status, 'timed_out');
    assert.equal(timeout.result.counts.compared_rows, 90);
    assert.equal(timeout.result.counts.common_valid, null);
    assert.equal(timeout.result.max_abs_error, null);
    assert.equal(timeout.result.output_hashes.left, '');
    const failed = input('LOCAL_COMPARISON_FAIL');
    const largeError = JSON.parse(failed.resultJson!); largeError.max_abs_error = '2E+308';
    assert.equal(readComparison({...failed, resultJson: JSON.stringify(largeError)}).result.max_abs_error, '2E+308');
    for (const change of [{version: 99}, {status: 'inconclusive'}, {counts: {...decoded.result.counts, common_valid: 0}}, {counts: {...decoded.result.counts, left_missing: null}},
        {counts: {...decoded.result.counts, missing_mismatches: 1}}, {counts: {...decoded.result.counts, compared_rows: 89}}, {max_abs_error: '1/3'}, {differences: [{index: 999, timestamp: dataset.start, left: 1, right: 2, kind: 'value_mismatch'}]}]) {
        assert.throws(() => readComparison({...pass, resultJson: JSON.stringify({...decoded.result, ...change})}), /无法读取/);
    }
    assert.throws(() => readComparison({...pass, datasetJson: JSON.stringify({...snapshot, content_hash: 'changed'})}), /无法读取/);
    assert.throws(() => readComparison({...pass, planJson: JSON.stringify({...plan, left: {...plan.left, id: 'other'}})}), /无法读取/);
    assert.throws(() => readComparison({...pass, planJson: JSON.stringify({...plan, policy: {...plan.policy, absolute_tolerance: .1}})}), /无法读取/);
});
