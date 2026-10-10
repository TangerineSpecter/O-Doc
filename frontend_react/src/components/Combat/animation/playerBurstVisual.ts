import type {PlayerSkillAnchors} from './playerRouteEffects';
import {clampEffect, ellipse, energyRing, polygon, star} from './pixelEffectDrawing';
import type {EffectContext} from './pixelEffectDrawing';

function drawFireCore(c: EffectContext, x: number, y: number, radius: number, time: number) {
    ellipse(c, x, y, radius * 1.7, radius * 1.7, '#f08742', .1);
    for (let i = 0; i < 3; i++) {
        const angle = time * 3 + i * Math.PI * 2 / 3;
        const px = x + Math.cos(angle) * radius * .55, py = y + Math.sin(angle) * radius * .55;
        ellipse(c, px, py, radius * .8, radius * .8, '#e15b38', .8);
    }
    ellipse(c, x, y, radius, radius, '#ffb447');
    ellipse(c, x - radius * .15, y - radius * .12, radius * .64, radius * .68, '#ffe283');
    ellipse(c, x - radius * .18, y - radius * .18, radius * .3, radius * .4, '#fff7d4');
}

function impactRays(c: EffectContext, x: number, y: number, t: number, alpha: number) {
    for (let i = 0; i < 11; i++) {
        const angle = i / 11 * Math.PI * 2 + .17;
        const distance = 50 + t * (160 + i % 3 * 18);
        const near = 17 + t * 80;
        const nx = Math.cos(angle), ny = Math.sin(angle);
        const thickness = (8 + i % 3 * 3) * (1 - t);
        const tx = x + nx * distance, ty = y + ny * distance * .7;
        polygon(c, [x + nx * near - ny * thickness, y + ny * near + nx * thickness,
            tx, ty, x + nx * near + ny * thickness, y + ny * near - nx * thickness],
        i % 3 ? '#ffd571' : '#fff4c5', alpha);
    }
}

/** A radial detonation silhouette, deliberately unlike the upright burning tongues. */
function blastCloud(c: EffectContext, x: number, y: number, radius: number, t: number, alpha: number) {
    const colors = ['#bd513b', '#ec7639', '#ffb54c', '#ffe08b', '#fff6cd'];
    const bands = [1, .87, .69, .48, .26];
    colors.forEach((color, band) => {
        const points: number[] = [];
        for (let i = 0; i < 64; i++) {
            const angle = i / 64 * Math.PI * 2;
            const edge = 1 + Math.sin(angle * 3 + .7 + t * 4) * .13 + Math.sin(angle * 5 - t * 3) * .09 + Math.cos(angle * 9 + 1.8) * .045;
            const r = radius * bands[band] * edge;
            points.push(x + Math.cos(angle) * r, y + Math.sin(angle) * r * .84);
        }
        polygon(c, points, color, alpha);
    });
}

function outwardJets(c: EffectContext, x: number, y: number, t: number, alpha: number) {
    for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2 + .23;
        const distance = 37 + t * (107 + i % 3 * 15);
        const length = (54 + i % 3 * 16) * (1 - t * .8);
        const width = 12 * (1 - t * .65);
        c.save(); c.translate(x, y); c.rotate(angle);
        for (const [band, color] of [[1, '#e96539'], [.7, '#ffba51'], [.32, '#fff0b0']] as const) {
            polygon(c, [distance - length, -width * band, distance - length * .35, -width * band * 1.1,
                distance + length * .24, 0, distance - length * .27, width * band * .65,
                distance - length, width * band], color, alpha);
        }
        c.restore();
    }
}

export function drawPlayerBurst(ground: EffectContext, rear: EffectContext, front: EffectContext,
    time: number, a: PlayerSkillAnchors) {
    const x = a.targetX, impact = 1.35;
    if (time < 1.05) {
        const charge = clampEffect(time / 1.05);
        energyRing(ground, a.sourceX, 2, 50 * charge, 13 * charge, time, '#f5bb6f', charge * .8, true);
        energyRing(ground, x, 1, 83 * charge, 18 * charge, -time, '#dc9a50', charge * .65, true);
        for (let i = 0; i < 7; i++) {
            const angle = i / 7 * Math.PI * 2 + time * 1.7;
            const radius = 48 * (1 - charge) + 18;
            star(front, a.emitterX + Math.cos(angle) * radius,
                a.emitterY + Math.sin(angle) * radius, 3, '#ffe3a1', charge);
        }
        drawFireCore(front, a.emitterX, a.emitterY, 5 + charge * 13, time);
        return;
    }
    if (time < impact) {
        const p = clampEffect((time - 1.05) / .3);
        const px = a.emitterX + (x - a.emitterX) * p;
        const py = a.emitterY + (-60 - a.emitterY) * p;
        polygon(front, [px, py - 13, px + a.facing * 12, py,
            px, py + 13, px - a.facing * 65, py + 5, px - a.facing * 95, py,
            px - a.facing * 65, py - 5], '#fbb752', .9);
        drawFireCore(front, px, py, 17, time);
        return;
    }
    const t = time - impact;
    if (t < .75) {
        const expansion = 1 - (1 - clampEffect(t / .32)) ** 3;
        const radius = 18 + expansion * 83;
        const fade = 1 - clampEffect((t - .26) / .49);
        ellipse(ground, x, 1, 115, 26, '#fbaa57', fade * .3);
        energyRing(ground, x, 2, 40 + t * 180, 9 + t * 39, time, '#ffe9a8', fade);
        // Detonation expands across the target's body, then breaks apart radially.
        blastCloud(rear, x, -65, radius * 1.1, t, fade * .8);
        outwardJets(front, x, -63, t, fade);
        blastCloud(front, x, -63, radius * .82 * (1 - t * .25), t, fade);
        impactRays(front, x, -63, clampEffect(t / .75), fade * .65);
        if (t < .14) star(front, x, -63, 62 * (1 - t / .14), '#fff9de');
        // A bright leading edge carries the blast outward as the solid core vanishes.
        ellipse(front, x, -63, 34 + t * 140, (34 + t * 140) * .82, '#ffe4a0', fade * .7, 4);
    }
    if (t < 1.35) for (let i = 0; i < 18; i++) {
        const angle = i / 18 * Math.PI * 2 + .21;
        const speed = 88 + i % 4 * 24;
        const px = x + Math.cos(angle) * speed * t;
        const py = -63 + Math.sin(angle) * speed * t * .65 + t * t * 55;
        const alpha = 1 - clampEffect((t - .45) / .9);
        polygon(front, [px, py - 3, px + 4, py, px, py + 5, px - 3, py],
            i % 3 ? '#fdb957' : '#fff0b0', alpha);
    }
    if (t > .35 && t < 1.4) {
        const fade = Math.sin(clampEffect((t - .35) / 1.05) * Math.PI) * .22;
        for (let i = 0; i < 5; i++) {
            const angle = i / 5 * Math.PI * 2 - .8;
            const distance = 47 + t * 30;
            const px = x + Math.cos(angle) * distance;
            const py = -70 + Math.sin(angle) * distance * .55 - t * 35;
            ellipse(rear, px, py, 16 + t * 11, 11 + t * 10,
                i % 2 ? '#9b7984' : '#705d74', fade);
        }
    }
}
