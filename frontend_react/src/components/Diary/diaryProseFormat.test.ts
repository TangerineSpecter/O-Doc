import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {formatDiaryProse} from './diaryProseFormat';

describe('formatDiaryProse', () => {
    it('为普通段落自动缩进两个全角空格', () => {
        const input = '今天天气晴朗。\n走出家门去公园散步。';
        const expected = '\u3000\u3000今天天气晴朗。\n\u3000\u3000走出家门去公园散步。';
        assert.equal(formatDiaryProse(input), expected);
    });

    it('规整已有的不规范缩进', () => {
        const input = '   已有半角空格的段落。\n\u3000已有一个全角空格。';
        const expected = '\u3000\u3000已有半角空格的段落。\n\u3000\u3000已有一个全角空格。';
        assert.equal(formatDiaryProse(input), expected);
    });

    it('不为列表和引用添加首行缩进', () => {
        const input = '普通段落。\n> 这是一个引用块。\n- 列表项一\n1. 列表项二';
        const expected = '\u3000\u3000普通段落。\n> 这是一个引用块。\n- 列表项一\n1. 列表项二';
        assert.equal(formatDiaryProse(input), expected);
    });

    it('压缩连续多余的空行', () => {
        const input = '第一段。\n\n\n\n\n第二段。';
        const expected = '\u3000\u3000第一段。\n\n\u3000\u3000第二段。';
        assert.equal(formatDiaryProse(input), expected);
    });

    it('自动处理中英文混排空格与标点规范化', () => {
        const input = '今天学了React开发,花了30元买咖啡!';
        const expected = '\u3000\u3000今天学了 React 开发，花了 30 元买咖啡！';
        assert.equal(formatDiaryProse(input), expected);
    });

    it('保留含中文路径和查询参数的链接及行内代码', () => {
        const input = '参考:https://example.com/照片?size=large&名称=小猫\n访问https://例子.com/照片2?中文=1\n代码 `中文123?` 保持原样!';
        const expected = '\u3000\u3000参考：https://example.com/照片?size=large&名称=小猫\n\u3000\u3000访问 https://例子.com/照片2?中文=1\n\u3000\u3000代码 `中文123?` 保持原样！';
        assert.equal(formatDiaryProse(input), expected);
        assert.equal(formatDiaryProse(expected), expected);
    });
});
