import {createMeadowSpriteRenderer} from '../animation/meadowPixels/meadowSprites';
import {drawMeadowBody} from '../animation/meadowPixels/meadowBodyDrawing';
import {sampleMeadowPose} from '../animation/meadowPixels/meadowMotion';
import {meadowProfiles} from '../animation/meadowPixels/meadowTypes';
import type {MeadowMonsterId} from '../animation/meadowPixels/meadowTypes';

const portraits = new Map<MeadowMonsterId, string>();

/** Atlas cards cache one bitmap per monster, without allocating a ticker or WebGL context. */
export function getMeadowStill(id: MeadowMonsterId): string {
    const cached = portraits.get(id);
    if (cached) return cached;
    const {key} = meadowProfiles[id], pose = sampleMeadowPose(key, 'idle', 0, 0, -1);
    const renderer = createMeadowSpriteRenderer();
    const canvas = Object.assign(document.createElement('canvas'), {width: 160, height: 160});
    const context = canvas.getContext('2d')!;
    drawMeadowBody(context, renderer.drawSprite(key, pose, 0, {dither: false}), key, pose, 80, 140);
    const url = canvas.toDataURL('image/png');
    canvas.width = 0;
    portraits.set(id, url);
    return url;
}
