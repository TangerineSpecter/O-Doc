import assert from 'node:assert/strict';
import {test} from 'node:test';
import {linkBookCitations, nextAnswerRevealIndex} from './readingAnswer.ts';

test('only citations backed by returned sources become links', () => {
    assert.equal(linkBookCitations('依据 [S3][S6]，另见 [S9]。', ['S3', 'S6']),
        '依据 [S3](#source-S3)[S6](#source-S6)，另见 [S9]。');
});

test('code and existing Markdown links stay unchanged', () => {
    const answer = '原文 `示例 [S3]` 和 [已有链接](https://example.com/S3)\n\n```md\n[S3]\n```\n\n实际证据 [S3]';
    assert.equal(linkBookCitations(answer, ['S3']),
        '原文 `示例 [S3]` 和 [已有链接](https://example.com/S3)\n\n```md\n[S3]\n```\n\n实际证据 [S3](#source-S3)');
});

test('paced reveal advances small output smoothly and bounds large bursts', () => {
    assert.equal(nextAnswerRevealIndex('一二三四五六', 0), 2);
    assert.equal(nextAnswerRevealIndex('一'.repeat(5000), 0), 24);
    assert.equal(nextAnswerRevealIndex('一二三', 2), 3);
});

test('paced reveal does not split an emoji surrogate pair', () => {
    assert.equal(nextAnswerRevealIndex('你好😀世界', 1), 4);
});
