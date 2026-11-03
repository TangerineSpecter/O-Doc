import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildInlinePhotoSchedule, parseDiaryContent} from './diaryReaderContent.ts';

test('少量正文也展示封面后的全部图片，顺序和灯箱下标保持一致', () => {
    const images = ['cover', 'two', 'three', 'four', 'five'];
    const groups = buildInlinePhotoSchedule(images, [0], true).get(0)!;
    assert.deepEqual(groups.flatMap(group => group.items), images.slice(1).map((assetId, index) => ({assetId, globalIndex: index + 1})));
});

test('没有普通段落时仍保留全部随文图片', () => {
    const images = ['cover', 'two', 'three', 'four'];
    const blocks = parseDiaryContent('> 只有一段引用\n---');
    assert.ok(blocks.every(block => block.type !== 'paragraph'));
    const schedule = buildInlinePhotoSchedule(images, [], true);
    assert.deepEqual(schedule.get(-1)?.flatMap(group => group.items.map(item => item.assetId)), images.slice(1));
});

test('多个段落间分配图片时不丢失或重复', () => {
    const images = Array.from({length: 15}, (_, index) => `image-${index}`);
    const schedule = buildInlinePhotoSchedule(images, [0, 2, 4], true);
    assert.deepEqual([...schedule.values()].flatMap(groups => groups.flatMap(group => group.items.map(item => item.globalIndex))),
        Array.from({length: 14}, (_, index) => index + 1));
});
