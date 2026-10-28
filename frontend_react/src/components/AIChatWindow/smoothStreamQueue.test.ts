import assert from 'node:assert/strict';
import test from 'node:test';
import {SmoothStreamQueue} from './smoothStreamQueue.ts';
import type {StreamChar} from './types.ts';

function previousTake(queue: StreamChar[]) {
    const length = queue.length;
    if (!length) return {conversationKey: '', text: ''};
    const count = length > 180 ? 16 : length > 90 ? 10 : length > 36 ? 6 : length > 8 ? 4 : 2;
    const conversationKey = queue[0].conversationKey;
    const chars: string[] = [];
    while (chars.length < count && queue[0]?.conversationKey === conversationKey) {
        chars.push(queue.shift()?.value || '');
    }
    return {conversationKey, text: chars.join('')};
}

test('keeps the previous adaptive rate, unicode order and conversation boundaries', () => {
    for (const length of [0, 1, 2, 8, 9, 36, 37, 90, 91, 180, 181, 10000]) {
        const next = new SmoothStreamQueue();
        const previous: StreamChar[] = [];
        const append = (key: string, content: string) => {
            next.append(key, content);
            for (const value of content) previous.push({conversationKey: key, value});
        };
        append('one', '字😀'.repeat(length));
        append('two', '结尾');
        let appended = false;
        while (previous.length) {
            assert.equal(next.length, previous.length);
            assert.deepEqual(next.take(), previousTake(previous));
            if (!appended && previous.length < 10) {
                append('three', '稍后加入');
                appended = true;
            }
        }
        assert.deepEqual(next.take(), {conversationKey: '', text: ''});
        assert.equal(next.length, 0);
    }
});

test('keeps only unconsumed text for a failed turn and resets cleanly', () => {
    const queue = new SmoothStreamQueue();
    queue.append('chat', '甲乙😀丁戊己庚辛壬癸');
    assert.deepEqual(queue.take(), {conversationKey: 'chat', text: '甲乙😀丁'});
    assert.equal(queue.remainingText(), '戊己庚辛壬癸');
    queue.clear();
    assert.equal(queue.remainingText(), '');
    assert.equal(queue.length, 0);
    queue.append('next', '新消息');
    assert.deepEqual(queue.take(), {conversationKey: 'next', text: '新消'});
    assert.equal(queue.remainingText(), '息');
});
