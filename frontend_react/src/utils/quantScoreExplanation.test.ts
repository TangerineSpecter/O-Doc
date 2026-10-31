import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreSections, scoreReasonLabels, scoreEvidenceLabels } from './quantScoreExplanation.ts';

test('separates labelled reasons and retains multiline source evidence verbatim', () => {
    assert.deepEqual(scoreSections('优点：计算明确。\n问题与影响：未发现实质问题。\n扣分说明：本维未扣分。', scoreReasonLabels),
        { 优点: '计算明确。', 问题与影响: '未发现实质问题。', 扣分说明: '本维未扣分。' });
    assert.deepEqual(scoreSections('**源码依据：** input(close)\n第2行：x[1]\n验证情况：未执行平台编译。', scoreEvidenceLabels),
        { 源码依据: 'input(close)\n第2行：x[1]', 验证情况: '未执行平台编译。' });
    assert.deepEqual(scoreSections('优点：清楚。问题与影响：无。扣分说明：未扣分。', scoreReasonLabels),
        { 优点: '清楚。', 问题与影响: '无。', 扣分说明: '未扣分。' });
});

test('legacy, incomplete, duplicate or prefixed prose falls back without discarding information', () => {
    for (const text of ['', '未执行编译，原始评价。', '优点：清楚', '额外说明\n优点：清楚\n问题与影响：无\n扣分说明：无',
        '优点：清楚\n优点：重复\n问题与影响：无\n扣分说明：无']) {
        assert.equal(scoreSections(text, scoreReasonLabels), null);
    }
});
