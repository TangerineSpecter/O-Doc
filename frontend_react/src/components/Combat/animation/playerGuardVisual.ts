import type {PlayerSkillAnchors} from './playerRouteEffects';
import {clampEffect, easeEffect, ellipse, energyRing, polygon, star} from './pixelEffectDrawing';
import type {EffectContext} from './pixelEffectDrawing';

export function drawPlayerGuard(ground: EffectContext, rear: EffectContext, front: EffectContext,
    time: number, a: PlayerSkillAnchors) {
    const grow = easeEffect((time - .15) / .65);
    const fade = 1 - clampEffect((time - 2.35) / .65);
    const x = a.sourceX, y = -105, rx = 85 * grow, ry = 116 * grow;
    const pulse = .94 + Math.sin(time * 4) * .06;
    energyRing(ground, x, 3, 80 * grow, 17 * grow, time, '#a5eff3', fade * .85, true);
    energyRing(ground, x, 3, 64 * grow, 13 * grow, -time, '#71b8dd', fade * .5);
    if (grow <= 0) return;
    // The rear energy surface surrounds the silhouette; the front retains face contrast.
    ellipse(rear, x, y, rx + 6, ry + 5, '#679bd1', fade * .1 * grow);
    ellipse(rear, x, y, rx, ry, '#5f9bc7', fade * .18 * grow);
    ellipse(front, x, y, rx, ry, '#9edee8', fade * .07);
    ellipse(front, x, y, rx, ry, '#456fab', fade * .42, 7);
    ellipse(front, x, y, rx - 1, ry - 1, '#9fe9ed', fade * pulse, 3);
    // An arc, not a solid stripe over the face, conveys the shield's curved volume.
    front.save(); front.globalAlpha = fade * .85; front.strokeStyle = '#f0fff7';
    front.lineWidth = 4; front.beginPath();
    front.ellipse(x, y, rx - 4, ry - 4, 0, Math.PI * 1.06, Math.PI * 1.62); front.stroke();
    front.restore();
    front.save(); front.beginPath(); front.ellipse(x, y, rx - 4, ry - 4, 0, 0, Math.PI * 2); front.clip();
    const sweep = ((time * 100) % 310) - 170;
    polygon(front, [x - 94, y + sweep, x + 94, y + sweep - 70,
        x + 94, y + sweep - 58, x - 94, y + sweep + 12], '#e5fff9', fade * .14);
    // Fine curved seams move across the energy material instead of outlining a UI box.
    front.globalAlpha = fade * .18; front.strokeStyle = '#d3ffff'; front.lineWidth = 1.5;
    for (const side of [-1, 1]) {
        front.beginPath(); front.moveTo(x, y - ry);
        front.bezierCurveTo(x + side * rx * .6, y - ry * .35,
            x + side * rx * .6, y + ry * .5, x, y + ry); front.stroke();
    }
    front.restore();
    for (let i = 0; i < 5; i++) {
        const angle = i / 5 * Math.PI * 2 + time * .45;
        const sx = x + Math.cos(angle) * rx, sy = y + Math.sin(angle) * ry;
        star(front, sx, sy, i % 2 ? 4 : 6, '#e8fff7', fade * pulse);
    }
    // A short ribbon carries energy from the equipped item's emitting point to the shell.
    if (time < .65) {
        front.save(); front.globalAlpha = (1 - time / .65) * .8;
        front.strokeStyle = '#d4ffff'; front.lineWidth = 3; front.beginPath();
        front.moveTo(a.emitterX, a.emitterY);
        front.quadraticCurveTo(x + a.facing * 105, -170, x + rx * a.facing, y);
        front.stroke(); front.restore();
        star(front, a.emitterX, a.emitterY, 8, '#c4f5f0');
    }
}
