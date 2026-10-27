import assert from 'node:assert/strict';
import test from 'node:test';
import type {MockExperiment} from '../mocks/quant/experiments';
import {mockCombination} from '../mocks/quant/combination';
import {readCombinationAnalysis} from './quantCombination';

function fixture() {
    const metric = (profit: number) => ({total_return: profit, max_drawdown: .02, turnover: 2, entries: 2, missing_signals: 0, start: '2024-01-01', end: '2024-02-01', bars: 31});
    const attempts = [.1, .08, .09].map((profit, i) => ({id: `attempt-${i + 1}`, parents: i < 2 ? ['seed'] : ['attempt-1', 'attempt-2'],
        operation: i < 2 ? 'source_candidate' : 'mean', status: 'evaluated', reason: '', metrics: {train: metric(profit), validation: metric(profit)}}));
    const record = {input: {config: {}}, data: {attemptsJson: JSON.stringify(attempts)}} as unknown as MockExperiment;
    return {record, attempts};
}
test('mock arithmetic preserves negative marginal value and parent order', () => {
    const {record} = fixture();
    const result = readCombinationAnalysis(mockCombination(record))!;
    const values = result.groups[0].windows[0].parts.validation;
    assert.ok(Math.abs(values.deltas!.return_over_best_parent + .01) < 1e-12);
    assert.equal(values.values[0]!.total_return, .1);
    assert.equal(values.values[2]!.total_return, .09);
});
test('missing and failed combination remains present and unknown', () => {
    const {record, attempts} = fixture();
    attempts[2].status = 'rejected'; attempts[2].reason = 'artificial rejection';
    record.data.attemptsJson = JSON.stringify(attempts.map((row, i) => i === 2 ? {...row, metrics: {}} : row));
    const group = readCombinationAnalysis(mockCombination(record))!.groups[0];
    assert.equal(group.status, 'rejected');
    assert.equal(group.windows[0].parts.validation.deltas, null);
    assert.equal(group.windows[0].parts.validation.values[2], null);
});
test('decoder rejects fabricated comparability and malformed or future records', () => {
    const {record} = fixture();
    const value = JSON.parse(mockCombination(record));
    value.groups[0].windows[0].parts.train.ranges[0].start = '2024-01-02';
    assert.throws(() => readCombinationAnalysis(JSON.stringify(value)));
    assert.throws(() => readCombinationAnalysis('{'));
    assert.throws(() => readCombinationAnalysis('{"version":2}'));
    assert.equal(readCombinationAnalysis(), null);
});
test('nested fixture retains all planned windows, including never-started windows', () => {
    const {record} = fixture();
    record.input.config.walkForward = {version: 2, innerFolds: 3, mode: 'expanding', folds: 2, trainBars: 40, validationBars: 10, testBars: 10, warmupBars: 0};
    const result = readCombinationAnalysis(mockCombination(record))!;
    assert.equal(result.groups[0].windows.length, 3);
    assert.ok(result.groups[0].windows.every(row => row.parts.validation.deltas === null));
});
test('missing parent retains available values while refusing the comparison', () => {
    const {record, attempts} = fixture();
    record.data.attemptsJson = JSON.stringify(attempts.slice(1));
    const group = readCombinationAnalysis(mockCombination(record))!.groups[0];
    assert.equal(group.parent_scope_valid, false);
    assert.equal(group.windows[0].parts.train.deltas, null);
    assert.equal(group.windows[0].parts.train.values[2]!.total_return, .09);
});
