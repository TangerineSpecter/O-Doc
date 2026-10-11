import {polygon} from '../pixelEffectDrawing';
import {auraArc, auraFeather, auraGlow, auraLeaf, auraLine, auraRune, auraSpark, tau} from './auraDrawingPrimitives';
import type {AuraContext, AuraPalette} from './auraDrawingPrimitives';

function prayer(c: AuraContext, p: AuraPalette, time: number, higher: boolean) {
    auraArc(c, 0, -315, 258, 251, time * .18, 2.1, p, .55);
    auraArc(c, 0, -315, higher ? 285 : 258, higher ? 273 : 251, -time * .15 + Math.PI, 1.6, p, .4);
    for (let i = 0; i < 6; i++) {
        const a = i * tau / 6 + time * .09, alpha = .25 + (Math.sin(time * 1.2 + i) + 1) * .15;
        auraLine(c, [Math.cos(a) * 246, -315 + Math.sin(a) * 239, Math.cos(a) * 282, -315 + Math.sin(a) * 275], p.light, 8, alpha);
    }
}
function leafOrbit(c: AuraContext, p: AuraPalette, time: number, count: number, canopy = false) {
    for (let i = 0; i < count; i++) {
        const a = canopy ? Math.PI + i / (count - 1) * Math.PI + Math.sin(time * .6) * .06 : time * .23 + i * tau / count;
        const x = Math.cos(a) * 258, y = -302 + Math.sin(a) * 251;
        auraGlow(c, x, y, 45, 45, p.color, p.light, .18);
        auraLeaf(c, x, y + 20, 47, a + Math.PI / 2 + Math.sin(time * .8 + i) * .25, p);
    }
}
export function drawHolyNatureAura(rear: AuraContext, floor: AuraContext, p: AuraPalette, time: number) {
    switch (p.id) {
        case 'holy':
            prayer(rear, p, time, false);
            auraSpark(rear, Math.sin(time * .5) * 12, -588 + Math.sin(time * .8) * 9, 21, p); break;
        case 'cross': {
            auraArc(floor, 0, 6, 259, 56, time * .32, 2.3, p, .8);
            auraArc(floor, 0, 6, 259, 56, time * .32 + Math.PI, 2.3, p, .8);
            const alpha = .57 + Math.sin(time * .9) * .1;
            polygon(floor, [-18, -46, 18, -46, 18, -8, 121, -8, 121, 17, 18, 17, 18, 57, -18, 57, -18, 17, -121, 17, -121, -8, -18, -8], p.color, alpha * .62);
            polygon(floor, [-14, -42, 14, -42, 14, -4, 117, -4, 117, 13, 14, 13, 14, 53, -14, 53, -14, 13, -117, 13, -117, -4, -14, -4], p.light, alpha);
            for (let i = 0; i < 4; i++) {const a = time * .32 + i * tau / 4; auraSpark(floor, Math.cos(a) * 259, 6 + Math.sin(a) * 56, 12, p);}
            for (const s of [-1, 1]) auraSpark(rear, s * 225, -120 + Math.sin(time * .8 + s) * 40, 11, p, .5); break;
        }
        case 'cleric':
            prayer(rear, p, time, true);
            for (const s of [-1, 1]) auraSpark(rear, s * 240, -300 + Math.sin(time * .75 + s) * 105, 15, p);
            auraArc(floor, 0, 5, 209, 36, time * .25, 1.9, p); break;
        case 'naturalist':
            leafOrbit(rear, p, time, 4);
            auraArc(rear, 0, -302, 262, 244, time * .23, 1.7, p, .3);
            auraArc(floor, 0, 6, 209, 35, -time * .24, 2.1, p, .45); break;
        case 'highpriest':
            for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
                const x = s * (211 + i * 24), y = -230 - i * 56 + Math.sin(time * .9) * 14;
                auraFeather(rear, x, y, 75 - i * 7, s * (.7 + i * .13 + Math.sin(time * .65) * .09), p, .48 + i * .1);
            }
            auraArc(rear, 0, -588 + Math.sin(time * .75) * 9, 63, 19, time * .3, 4.6, p, .85);
            auraGlow(rear, 0, -554, 105, 84, p.color, p.light, .25); break;
        case 'inquisitor': {
            const y = -589 + Math.sin(time * .7) * 10, lean = Math.sin(time * .6) * 8;
            auraSpark(rear, 0, y - 14, 18, p);
            auraLine(rear, [-53, y + lean, 0, y, 53, y - lean], p.light, 4, .75);
            for (const s of [-1, 1]) {
                const x = s * 47, top = y - s * lean;
                auraLine(rear, [x, top, x, top + 29], p.light, 4, .65);
                polygon(rear, [x - 17, top + 29, x + 17, top + 29, x + 9, top + 42, x - 9, top + 42], p.color, .7);
            }
            prayer(rear, p, time, false); auraRune(floor, 0, 6, 212, 36, 4, time * .15, p); break;
        }
        case 'druid':
            leafOrbit(rear, p, time, 5, true);
            auraArc(rear, 0, -302, 263, 255, Math.PI + Math.sin(time * .6) * .06, Math.PI, p, .34);
            for (const s of [-1, 1]) {
                const x = s * (222 + Math.sin(time * .7 + s) * 10);
                auraLine(rear, [x, -58, x - s * 20, -135, x + s * 6, -220], p.color, 4, .5);
                auraLeaf(rear, x - s * 16, -134, 37, s * .6 + Math.sin(time) * .1, p);
            } break;
        case 'warden':
            auraRune(rear, 0, -303, 280, 258, 6, -Math.PI / 2 + time * .07, p, .27);
            leafOrbit(rear, p, time * .7, 6);
            auraRune(floor, 0, 6, 235, 41, 6, -time * .1, p, .48);
            auraArc(rear, 0, -303, 279, 257, -time * .2, 1.7, p, .48); break;
        default: break;
    }
}
