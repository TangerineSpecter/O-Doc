import assert from 'node:assert/strict';
import test from 'node:test';
import { extractMT4Kpis, groupMT4Metrics, parsePeriodInfo, parseModelInfo } from './mt4Report';
import type { MT4Report } from '../types/api/mt4Archive';

// 用户真实截图中的中文 MT4 报告矩阵（包含前导占位符和极值行）
const userRealReport: MT4Report = {
    metrics: [
        ['经测试过的柱数', '74710', '用于复盘的即时价数量', '27393285', '复盘模型的质量', '99.90%'],
        ['输入图表错误', '0', '点差', '当前 (6)'],
        ['总净盈利', '338.26', '总获利', '680.68', '总亏损', '-342.41'],
        ['盈利比', '1.99', '预期盈利', '2.40'],
        ['起始资金', '10000.00'],
        ['绝对亏损', '453.00', '最大亏损', '463.99 (4.63%)', '相对亏损', '4.63% (463.99)'],
        ['交易单总计', '141', '卖单 (%获利百分比)', '69 (68.12%)', '买单 (%获利百分比)', '72 (73.61%)'],
        ['——', '盈利交易 (%占总百分比)', '100 (70.92%)', '亏损交易 (%占总百分比)', '41 (29.08%)'],
        ['最大', '获利交易', '67.13', '亏损交易', '-25.23'],
        ['平均', '获利交易', '6.81', '亏损交易', '-8.35'],
        ['最大', '连续获利金额', '8 (30.17)', '连续亏损金额', '5 (-62.20)'],
        ['最多', '连续获利次数', '67.13 (1)', '连续亏损次数', '-52.20 (3)'],
        ['平均', '连续获利', '3', '连续亏损', '1'],
    ],
};

test('extractMT4Kpis correctly parses Chinese MT4 metrics with alternate names', () => {
    const kpis = extractMT4Kpis(userRealReport);
    assert.equal(kpis.totalNetProfit, '338.26');
    assert.equal(kpis.totalNetProfitNum, 338.26);
    assert.equal(kpis.profitFactor, '1.99');
    assert.equal(kpis.grossProfit, '680.68');
    assert.equal(kpis.grossLoss, '-342.41');
    assert.equal(kpis.maxDrawdown, '463.99 (4.63%)');
    assert.equal(kpis.totalTrades, '141');
    assert.equal(kpis.winRate, '70.92%');
    assert.equal(kpis.shortWon, '69 (68.12%)');
    assert.equal(kpis.longWon, '72 (73.61%)');
    assert.equal(kpis.modellingQuality, '99.90%');
});

test('groupMT4Metrics eliminates misalignments and categorizes all rows properly', () => {
    const groups = groupMT4Metrics(userRealReport);
    const capital = groups.find((g) => g.key === 'capital');
    const risk = groups.find((g) => g.key === 'risk');
    const trades = groups.find((g) => g.key === 'trades');
    const extremes = groups.find((g) => g.key === 'extremes');
    const quality = groups.find((g) => g.key === 'quality');
    const others = groups.find((g) => g.key === 'others');

    // 风险分类校验
    assert.ok(risk?.items.some((it) => it.label.includes('最大亏损') && it.value.includes('463.99')));
    assert.ok(risk?.items.some((it) => it.label.includes('绝对亏损') && it.value === '453.00'));

    // 资金分类中不应该包含买单/卖单
    assert.ok(capital?.items.some((it) => it.label === '总净盈利' && it.value === '338.26'));
    assert.ok(capital?.items.some((it) => it.label === '盈利比' && it.value === '1.99'));
    assert.ok(!capital?.items.some((it) => it.label.includes('买单')));
    assert.ok(!capital?.items.some((it) => it.label.includes('卖单')));

    // 交易分类中应该包含交易单总计、买单、卖单、盈利交易、亏损交易
    assert.ok(trades?.items.some((it) => it.label === '交易单总计' && it.value === '141'));
    assert.ok(trades?.items.some((it) => it.label.includes('盈利交易') && it.value.includes('100')));
    assert.ok(trades?.items.some((it) => it.label.includes('亏损交易') && it.value.includes('41')));
    assert.ok(trades?.items.some((it) => it.label.includes('买单') && it.value.includes('72')));

    // 极值中不应错位
    assert.ok(extremes?.items.some((it) => it.label === '最大 获利交易' && it.value === '67.13'));
    assert.ok(extremes?.items.some((it) => it.label === '最大 亏损交易' && it.value === '-25.23'));
    assert.ok(extremes?.items.some((it) => it.label === '平均 获利交易' && it.value === '6.81'));
    assert.ok(extremes?.items.some((it) => it.label === '平均 连续获利' && it.value === '3'));

    // 品质中应该包含经测试过的柱数、复盘模型的质量等
    assert.ok(quality?.items.some((it) => it.label.includes('柱数') && it.value === '74710'));
    assert.ok(quality?.items.some((it) => it.label.includes('质量') && it.value === '99.90%'));

    // 不应该存在混乱错位的“其他指标”
    assert.ok(!others || others.items.length === 0);
});

test('parsePeriodInfo and parseModelInfo correctly decompose long strings', () => {
    const rawPeriod = '5 分钟图 2023.01.01 22:00 - 2023.12.29 21:55 (2023.01.01 - 2024.01.01)';
    const parsedPeriod = parsePeriodInfo(rawPeriod);
    assert.equal(parsedPeriod.timeframe, '5 分钟图');
    assert.equal(parsedPeriod.displayRange, '2023.01.01 - 2024.01.01');
    assert.equal(parsedPeriod.dateRange, '2023.01.01 22:00 - 2023.12.29 21:55');
    assert.equal(parsedPeriod.baselineRange, '2023.01.01 - 2024.01.01');

    const rawModel = '每个即时价格(基于所有可利用的最小时段的每一个价格的分形插值)';
    const parsedModel = parseModelInfo(rawModel);
    assert.equal(parsedModel.name, '每个即时价格');
    assert.equal(parsedModel.detail, '基于所有可利用的最小时段的每一个价格的分形插值');
});

