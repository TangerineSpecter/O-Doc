import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tagTextForDisplay, tagTextForStorage} from './quantTagLabels.ts';

const terms = [
    {id: 'mechanism:trend', label: '趋势', active: true},
    {id: 'platform:tradingview', label: 'TradingView', active: true},
    {id: 'data:price', label: '价格数据', active: true},
];

test('标签中文展示和编辑保持稳定身份、自由词与输入分隔符', () => {
    const stored = 'mechanism:trend， platform:tradingview,卡尔曼滤波，';
    const displayed = '趋势， TradingView,卡尔曼滤波，';
    assert.equal(tagTextForDisplay(stored, terms), displayed);
    assert.equal(tagTextForStorage(displayed, terms, []), stored);
    assert.equal(tagTextForStorage(displayed + '价格数据', terms, []), stored + 'data:price');
    assert.equal(tagTextForDisplay('custom:unknown', terms), 'custom:unknown');
});

test('重名词条不按标签名称错误合并，已有停用词仍可原样编辑', () => {
    const same = [...terms, {id: 'custom:trend', label: '趋势', active: false}];
    const stored = 'mechanism:trend，custom:trend';
    const displayed = tagTextForDisplay(stored, same);
    assert.equal(tagTextForStorage(displayed, same, stored.split('，')), stored);
    assert.equal(tagTextForStorage('趋势', same, []), '趋势');
});
