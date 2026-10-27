import assert from 'node:assert/strict';
import test from 'node:test';
import {extractStreakComparisons, groupMT4Metrics} from './mt4Report';

test('matrix recognizes saved rows with either colon without confusing averages', () => {
    const metrics = [
        ['最大:', '连续获利金额', '8 (30.17)', '连续亏损金额', '3 (-52.20)'],
        ['平均：', '连续获利', '3', '连续亏损', '1'],
        ['最多:', '连续获利次数', '67.13 (1)', '连续亏损次数', '-52.20 (3)'],
        ['最大:', '获利交易', '67.13', '亏损交易', '-25.23'],
        ['平均', '获利交易', '6.81', '亏损交易', '-8.35'],
    ];
    const rows = extractStreakComparisons(groupMT4Metrics({metrics}));
    assert.deepEqual(rows.map(({profitVal, lossVal}) => [profitVal, lossVal]), [
        ['67.13', '-25.23'], ['6.81', '-8.35'], ['8 (30.17)', '3 (-52.20)'],
        ['67.13 (1)', '-52.20 (3)'], ['3', '1'],
    ]);
    assert.equal(metrics[0][0], '最大:');
});
