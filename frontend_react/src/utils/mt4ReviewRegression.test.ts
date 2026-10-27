import assert from 'node:assert/strict';
import test from 'node:test';
import type {MT4Event} from '../types/api/mt4Archive';
import {extractMT4Kpis, groupMT4Metrics} from './mt4Report';
import {sampleLotEvents} from '../components/MT4Archive/chartSampling';

const event = (profit: string, balance: string): MT4Event => ({sequence: '1', type: 'close', profit, balance,
    time: '', order: '', lots: '', price: '', stopLoss: '', takeProfit: ''});

test('unknown profits stay unknown, but a real zero stays zero', () => {
    const unknown = extractMT4Kpis({}, [event('', '100')]);
    assert.equal(unknown.totalNetProfit, '—');
    assert.equal(unknown.initialDeposit, '—');
    assert.equal(unknown.roiPercent, '');
    assert.equal(unknown.winRate, '—');
    const zero = extractMT4Kpis({}, [event('0', '100')]);
    assert.equal(zero.totalNetProfit, '0.00');
    assert.equal(zero.roiPercent, '+0.00%');
    const partial = extractMT4Kpis({}, [event('5', '105'), event('', '110')]);
    assert.equal(partial.totalNetProfit, '—');
    assert.equal(partial.winRate, '—');
});

test('metric groups retain empty value positions in normal and prefixed rows', () => {
    const groups = groupMT4Metrics({metrics: [
        ['起始资金', '', '总净盈利', '500'],
        ['最大:', '获利交易', '', '亏损交易', '-25'],
        ['——', '盈利交易', '', '亏损交易', '2'],
    ]});
    const items = groups.flatMap(group => group.items);
    assert.ok(items.some(item => item.label === '起始资金' && item.value === '—'));
    assert.ok(items.some(item => item.label === '总净盈利' && item.value === '500'));
    assert.ok(items.some(item => item.label === '最大 获利交易' && item.value === '—'));
    assert.ok(items.some(item => item.label === '最大 亏损交易' && item.value === '-25'));
    assert.ok(items.some(item => item.label === '亏损交易' && item.value === '2'));
});

test('lot chart sampling stays bounded and retains extrema', () => {
    const rows = Array.from({length: 200000}, (_, i) => ({...event('', ''), lots: i === 100123 ? '100' : i === 100124 ? '0.001' : '1'}));
    const sample = sampleLotEvents(rows);
    assert.ok(sample.length <= 1000);
    assert.ok(sample.some(item => item.index === 100123));
    assert.ok(sample.some(item => item.index === 100124));
    assert.equal(sampleLotEvents(rows.slice(0, 3)).length, 3);
});
