import assert from 'node:assert/strict';
import {test} from 'node:test';
import {quoteSpread} from './bookReaderLocation.ts';

test('TXT quotes locate the containing spread in single and double page modes', () => {
    const pages = ['第一页', '第二页', '第三页', '第四页', '最后一页'];
    pages.forEach((quote, index) => {
        assert.equal(quoteSpread(pages, quote, 1), index + 1);
        assert.equal(quoteSpread(pages, quote, 2), Math.floor(index / 2) + 1);
    });
});

test('missing quotes leave the existing offset restoration unchanged', () => {
    assert.equal(quoteSpread(['正文'], '不存在的摘录', 2), null);
    assert.equal(quoteSpread(['正文'], '', 2), null);
    assert.equal(quoteSpread([], '正文', 1), null);
});
