import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFishingSettlement, formatFishingReason} from './fishingSettlement.ts';

test('正确解析多鱼种重复平铺的旧文本（截图1场景）', () => {
    const input = '乌鳢、鲫鱼、鲫鱼、乌鳢 · 抛竿7次 · 系统说明: 本次垂钓结束，为后续日程保留体力';
    const result = parseFishingSettlement(input, 'success');
    assert.equal(result.casts, 7);
    assert.equal(result.totalCatches, 4);
    assert.equal(result.reason, '本次垂钓结束，为后续日程保留体力');
    assert.equal(result.isPaused, false);
    assert.deepEqual(result.catches, [
        {name: '乌鳢', quantity: 2, artId: 'snakehead'},
        {name: '鲫鱼', quantity: 2, artId: 'crucian'},
    ]);
    assert.equal(formatFishingReason(result.reason, result.isPaused, result.totalCatches), '本次垂钓结束，为后续日程保留体力');
});

test('正确聚合单鱼种大量重复平铺的旧文本（截图2场景：乌鳢连钓10条）', () => {
    const input = '乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢 · 抛竿20次 · 系统说明: 本次垂钓结束，为后续日程保留体力';
    const result = parseFishingSettlement(input, 'success');
    assert.equal(result.casts, 20);
    assert.equal(result.totalCatches, 10);
    assert.deepEqual(result.catches, [
        {name: '乌鳢', quantity: 10, artId: 'snakehead'},
    ]);
});

test('正确解析鱼饵用尽并结束的场景（截图4场景）', () => {
    const input = '鲫鱼、鲫鱼、鲫鱼、鲫鱼、鲫鱼、彩鳑鲏 · 抛竿12次 · 鱼饵用尽或当前时间没有适用鱼种';
    const result = parseFishingSettlement(input, 'success');
    assert.equal(result.casts, 12);
    assert.equal(result.totalCatches, 6);
    assert.equal(result.reason, '鱼饵用尽或当前时间没有适用鱼种');
    assert.deepEqual(result.catches, [
        {name: '鲫鱼', quantity: 5, artId: 'crucian'},
        {name: '彩鳑鲏', quantity: 1, artId: 'bitterling'},
    ]);
});

test('正确解析新格式文本（带乘号数量）', () => {
    const input = '乌鳢 ×10、鲫鱼 ×2 · 抛竿20次 · 本次垂钓结束，为后续日程保留体力';
    const result = parseFishingSettlement(input, 'success');
    assert.equal(result.casts, 20);
    assert.equal(result.totalCatches, 12);
    assert.deepEqual(result.catches, [
        {name: '乌鳢', quantity: 10, artId: 'snakehead'},
        {name: '鲫鱼', quantity: 2, artId: 'crucian'},
    ]);
});

test('正确处理空手而归场景', () => {
    const input = '尚无收获 · 抛竿5次 · 系统说明: 本次垂钓结束，为后续日程保留体力';
    const result = parseFishingSettlement(input, 'success');
    assert.equal(result.casts, 5);
    assert.equal(result.totalCatches, 0);
    assert.equal(result.catches.length, 0);
    assert.equal(result.reason, '本次垂钓结束，为后续日程保留体力');
});

test('正确处理出钓已暂停场景', () => {
    const input = '尚无收获 · 抛竿0次 · 请到钓鱼面板检查本机运行开关，并继续出钓';
    const result = parseFishingSettlement(input, 'paused');
    assert.equal(result.isPaused, true);
    assert.equal(result.casts, 0);
    assert.equal(result.totalCatches, 0);
});
