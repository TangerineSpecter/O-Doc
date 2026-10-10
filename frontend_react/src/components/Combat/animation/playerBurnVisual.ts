import type {PlayerSkillAnchors} from './playerRouteEffects';
import {clampEffect, ellipse, energyRing, flameTongue, floatingEmbers} from './pixelEffectDrawing';
import type {EffectContext} from './pixelEffectDrawing';

export function drawPlayerBurn(ground: EffectContext, rear: EffectContext, front: EffectContext,
    time: number, a: PlayerSkillAnchors) {
    const ignition = clampEffect((time - .35) / .45);
    const fade = 1 - clampEffect((time - 3.15) / .6);
    const x = a.targetX;
    if (time < .8) {
        const p = clampEffect(time / .8);
        energyRing(ground, x, 0, 73 * p, 15 * p, time, '#f7b868', p);
        // A travelling ignition thread curls down from the crystal into the target seal.
        front.save(); front.strokeStyle = '#ffd683'; front.lineWidth = 2.5;
        front.globalAlpha = Math.sin(p * Math.PI);
        front.beginPath(); front.moveTo(a.emitterX, a.emitterY);
        front.bezierCurveTo(a.emitterX + a.facing * 38, a.emitterY - 30,
            x - a.facing * 38, -110, x - a.facing * 45, -5); front.stroke(); front.restore();
        flameTongue(front, a.emitterX, a.emitterY + 7, 6, 25, time, 2, 1 - p);
    }
    if (ignition <= 0) return;
    const pulse = .9 + Math.sin((time - .8) * 8) * .1;
    const alpha = fade * ignition;
    ellipse(ground, x, 1, 76, 16, '#e97840', alpha * .16);
    energyRing(ground, x, 1, 69, 13, time, '#ffc878', alpha * .8);
    // Taller fire rises behind the body; a lower moving skirt crosses the front.
    for (let i = 0; i < 4; i++) {
        const offset = [-53, -18, 23, 55][i];
        flameTongue(rear, x + offset, -2, 14 + i % 2 * 3,
            (105 + i % 3 * 24) * ignition * pulse, time + i * .1, i * 2.7, alpha * .9);
    }
    flameTongue(front, x - 63, -1, 13, 85 * ignition * pulse, time, .8, alpha * .88);
    flameTongue(front, x + 62, -1, 12, 94 * ignition * pulse, time, 4.4, alpha * .88);
    for (let i = 0; i < 5; i++) flameTongue(front, x - 45 + i * 22, 2,
        10, (29 + Math.sin(time * 7 + i * 1.8) * 9) * ignition,
        time + i * .2, i * 1.3, alpha * .88);
    floatingEmbers(front, x, time, 152, 67, alpha, 11);
}
