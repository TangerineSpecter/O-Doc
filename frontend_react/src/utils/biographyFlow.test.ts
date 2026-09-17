import assert from 'node:assert/strict';
import test from 'node:test';
import {visibleFlowIndexes} from './biographyFlow.ts';

test('chapter flow preview retains the closing influence and decision steps', () => {
    assert.deepEqual(visibleFlowIndexes(12, false), [0, 1, 8, 9, 10, 11]);
    assert.deepEqual(visibleFlowIndexes(6, false), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(visibleFlowIndexes(12, true), Array.from({length: 12}, (_, index) => index));
});
