import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DIARY_TAG_ERROR, mergeDiaryTags} from './diaryTags.ts';

test('待输入标签可在保存时按分隔符合并、去重并保留顺序', () => {
    assert.deepEqual(mergeDiaryTags(['旅行'], ' #夜读，旅行、  灵感 '), {tags: ['旅行', '夜读', '灵感'], error: ''});
    assert.deepEqual(mergeDiaryTags(['旅行'], '  #  '), {tags: ['旅行'], error: ''});
});

test('超出标签数量或长度时保留原标签并返回错误', () => {
    const tags = Array.from({length: 10}, (_, index) => `标签${index}`);
    assert.deepEqual(mergeDiaryTags(tags, '新增'), {tags, error: DIARY_TAG_ERROR});
    assert.deepEqual(mergeDiaryTags([], '很'.repeat(31)), {tags: [], error: DIARY_TAG_ERROR});
});
