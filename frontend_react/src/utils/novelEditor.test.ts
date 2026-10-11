import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codePointSelection, candidateCanReplace} from './novelEditor.ts';
test('Unicode selection preserves surrounding text for emoji and Chinese', () => {
    assert.deepEqual(codePointSelection('前文😀选中后文', 4, 6), {start: 3, end: 5});
});
test('a stale candidate never overwrites changed saved or unsaved prose', () => {
    assert.equal(candidateCanReplace('a', 'b', 'same', 'same'), false);
    assert.equal(candidateCanReplace('a', 'a', 'old', 'new'), false);
    assert.equal(candidateCanReplace('a', 'a', 'same', 'same'), true);
});
