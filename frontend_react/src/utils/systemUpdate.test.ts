import assert from 'node:assert/strict';
import test from 'node:test';

import {
    compareVersions,
    isReleaseUpdateAvailable,
    selectLatestStableTag,
} from './systemUpdate.ts';

const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);

test('sorts stable semantic versions instead of trusting API order', () => {
    const latest = selectLatestStableTag([
        {name: 'v1.9.9', commit: {sha: commitA}},
        {name: 'v1.10.0', commit: {sha: commitB}},
        {name: 'v2.0.0-beta.1', commit: {sha: 'c'.repeat(40)}},
        {name: '1.99.0', commit: {sha: 'd'.repeat(40)}},
    ], 1234);

    assert.deepEqual(latest, {
        version: '1.10.0',
        tagName: 'v1.10.0',
        commit: commitB,
        checkedAt: 1234,
    });
    assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
});

test('detects a moved same-version tag by commit', () => {
    const release = {
        version: '0.9.5',
        tagName: 'v0.9.5',
        commit: commitB,
        checkedAt: 1234,
    };

    assert.equal(isReleaseUpdateAvailable('0.9.5', commitA, release), true);
    assert.equal(isReleaseUpdateAvailable('0.9.5', commitB, release), false);
    assert.equal(isReleaseUpdateAvailable('0.9.6', commitA, release), false);
});
