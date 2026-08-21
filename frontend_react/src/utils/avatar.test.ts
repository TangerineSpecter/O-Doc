import assert from 'node:assert/strict';
import test from 'node:test';

import {isImageAvatarValue} from './avatar.ts';

test('recognizes supported image avatar sources', () => {
    assert.equal(isImageAvatarValue('https://example.com/avatar.png'), true);
    assert.equal(isImageAvatarValue('HTTP://example.com/avatar.png'), true);
    assert.equal(isImageAvatarValue('/api/resource/view/avatar-id'), true);
    assert.equal(isImageAvatarValue('blob:https://o-doc.example/avatar-id'), true);
    assert.equal(isImageAvatarValue('data:image/png;base64,AAAA'), true);
});

test('keeps emoji and text avatars out of image src', () => {
    assert.equal(isImageAvatarValue('🐱'), false);
    assert.equal(isImageAvatarValue('猫'), false);
    assert.equal(isImageAvatarValue('A'), false);
    assert.equal(isImageAvatarValue(''), false);
    assert.equal(isImageAvatarValue(undefined), false);
});
