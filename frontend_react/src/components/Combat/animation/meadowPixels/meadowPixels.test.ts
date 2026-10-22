import assert from 'node:assert/strict';
import {test} from 'node:test';
import {meadowProfiles, shouldMirrorMeadow} from './meadowTypes';
import {meadowSpriteData} from './meadowSpriteData';
import {sampleMeadowPose} from './meadowMotion';

test('right-side enemies preserve left-facing originals and only mirror right-facing originals', () => {
    assert.equal(shouldMirrorMeadow('rabbit', -1), true);
    assert.equal(shouldMirrorMeadow('beetle', -1), false);
    assert.equal(shouldMirrorMeadow('glowbug', -1), false);
    for (const profile of Object.values(meadowProfiles)) {
        assert.notEqual(shouldMirrorMeadow(profile.key, 1), shouldMirrorMeadow(profile.key, -1));
        if (profile.key !== 'slime') assert.equal(profile.sourceFacing, meadowSpriteData[profile.key].sourceFacing);
    }
});

test('defeat fractures the full-size creature, hides at .26s and never revives or collapses', () => {
    for (const {key} of Object.values(meadowProfiles)) {
        for (const elapsed of [0, .1, .259, .26, .27, 1, 4, 60]) {
            const pose = sampleMeadowPose(key, 'defeat', elapsed, 20 + elapsed, -1);
            assert.equal(pose.sx, 1);
            assert.equal(pose.sy, 1);
            assert.equal(pose.fade, 0);
            assert.equal(pose.hidden, elapsed >= .26);
            assert.equal(pose.y, key === 'glowbug' ? -17 : 0);
        }
        assert.ok(sampleMeadowPose(key, 'defeat', .2, 20, -1).fracture);
    }
});
