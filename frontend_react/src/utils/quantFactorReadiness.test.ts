import assert from 'node:assert/strict';
import test from 'node:test';
import type {QuantSource, QuantFactorCandidate} from '../types/api/quant';
import type {QuantGraph, QuantGraphEdge} from '../types/api/quantGraph';
import {mockFactors} from '../mocks/quant/factors';
import {mockQualification} from '../mocks/quant/qualification';
import {factorReadiness, factorListStatus} from './quantFactorReadiness';
import {graphRelations, graphLabelLines} from './quantGraphView';

function fixture(code = 'LOCAL_INTERNAL_STATE_FACTORS') {
    const data = mockFactors({payload: {code}} as QuantSource)[0];
    return {data, qualification: mockQualification({data, contentHash: 'artificial-readiness'} as QuantFactorCandidate)};
}

test('missing expression and internal inputs produce distinct actionable gaps without inventing dependencies', () => {
    const {data, qualification} = fixture();
    const result = factorReadiness(qualification);
    assert.equal(result.title, '定义尚不能用于自动实验');
    assert.deepEqual(result.steps.map(row => row.title), ['补齐可计算公式', '明确输入来源', '补齐运行参数']);
    assert.match(result.steps[1].detail, /isAnomaly、testStatistic/);
    assert.equal(factorListStatus(data, '候选'), '缺少可计算定义');
    assert.equal(qualification.nodes.length, 0);
});

test('structure, configuration and mapping have separate readiness boundaries', () => {
    const {qualification} = fixture('artificial OHLCV');
    assert.equal(factorReadiness(qualification).title, '定义已具备自动实验条件');
    const mapped = structuredClone(qualification);
    mapped.inputs_requiring_mapping = ['state']; mapped.automatic_experiment_ready = false;
    assert.equal(factorReadiness(mapped).title, '定义结构完整，运行条件待确认');
    assert.deepEqual(factorReadiness(mapped).steps.map(row => row.title), ['明确输入来源']);
    mapped.configuration = {status: 'needs_values', missing: ['lookback']};
    assert.match(factorReadiness(mapped).steps[1].detail, /lookback/);
    mapped.configuration = {status: 'invalid_declared_defaults', missing: []};
    assert.equal(factorReadiness(mapped).steps[1].title, '修正默认参数');
    mapped.checks.push({code: 'types', status: 'blocked', message: '输出类型不一致'});
    mapped.blockers = ['types'];
    assert.equal(factorReadiness(mapped).steps[0].detail, '输出类型不一致');
});

test('algorithm graph keeps incoming lineage and omits AI claims', () => {
    const kinds: QuantGraphEdge['kind'][] = ['derived_from', 'direct_observation', 'semantic_similar', 'scenario_hypothesis', 'reported_counterexample'];
    const graph = {focusId: 'current', edges: kinds.map((kind, index) => ({id: String(index), kind,
        from: index === 0 ? 'factor:child' : 'factor:current', to: index === 0 ? 'factor:current' : `other:${index}`}))} as QuantGraph;
    graph.edges.push({id: 'unrelated', kind: 'same_source', from: 'other:1', to: 'other:2'} as QuantGraphEdge);
    assert.deepEqual(graphRelations(graph, 'records').map(row => row.kind), ['derived_from', 'direct_observation']);
    assert.equal(graphRelations(graph, 'algorithms').length, 0);
    assert.equal(graphRelations(graph, 'all').length, 2);
    assert.deepEqual(graphRelations(undefined, 'all'), []);
    assert.equal(graphLabelLines('major_unusual_move_signal').join(''), 'major_unusual_move_signal');
    assert.equal(graphLabelLines('a'.repeat(100)).length, 3);
    assert.ok(graphLabelLines('来源用途与条件（人工假设示例）').every(line => [...line].length <= 12));
});
