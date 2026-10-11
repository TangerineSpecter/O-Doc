import {polygon} from '../pixelEffectDrawing';
import {auraArc, auraGlow, auraLine, auraRune, auraSpark, tau} from './auraDrawingPrimitives';
import type {AuraContext, AuraPalette} from './auraDrawingPrimitives';

/** Martial intent is expressed with motion and light, never substitute equipped weapons. */
export function drawWarriorAura(rear: AuraContext, floor: AuraContext, p: AuraPalette, time: number) {
    switch (p.id) {
        case 'warrior':
            for (let i = 0; i < 4; i++) {
                const t = (time * .23 + i / 4) % 1, s = i % 2 ? 1 : -1;
                const x = s * (194 + t * 54), y = -60 - t * 380, alpha = Math.sin(t * Math.PI);
                auraGlow(rear, x, y, 55, 100, p.color, p.light, alpha * .18);
                auraLine(rear, [x - s * 22, y + 75, x, y, x + s * 8, y - 35], p.color, 8, alpha * .65);
                auraLine(rear, [x - s * 10, y + 30, x, y - 22], p.light, 4, alpha * .8);
            }
            auraArc(floor, 0, 7, 196, 34, time * .6, 1.3, p, .55); break;
        case 'swordsman':
            for (let i = 0; i < 2; i++) auraArc(rear, 0, -295, 262, 205 + i * 32, time * .5 + i * Math.PI, 1.6, p);
            break;
        case 'guardian':
            for (const s of [-1, 1]) {
                const x = s * (227 + Math.sin(time * .9) * 8), y = -225 + Math.sin(time * .7 + s) * 12;
                auraGlow(rear, x, y, 90, 180, p.color, p.light, .24);
                polygon(rear, [x, y - 100, x + 37, y - 75, x + 34, y + 59, x, y + 100, x - 34, y + 59, x - 37, y - 75], p.color, .15);
                auraLine(rear, [x - 29, y - 70, x, y - 91, x + 29, y - 70], p.light, 4, .75);
                const t = (time * .17 + (s + 1) * .25) % 1;
                auraSpark(rear, x, y + 75 - t * 148, 9, p, Math.sin(t * Math.PI));
            }
            auraArc(floor, 0, 6, 235, 40, -time * .3, 2.3, p); break;
        case 'swordmaster':
            for (let i = 0; i < 3; i++) {
                const a = time * .46 + i * tau / 3;
                auraArc(rear, 0, -305, 256 + i * 12, 238, a, 1.1, p, .72);
                auraSpark(rear, Math.cos(a + 1.1) * (256 + i * 12), -305 + Math.sin(a + 1.1) * 238, 13, p);
            } break;
        case 'spellblade':
            auraRune(rear, 0, -300, 270, 247, 6, time * .12, p, .3);
            for (let i = 0; i < 2; i++) auraArc(rear, 0, -300, 277, 228, -time * .55 + i * Math.PI, 1.4, p);
            for (const s of [-1, 1]) auraSpark(rear, s * 236, -230 + Math.sin(time * 1.1 + s) * 66, 14, p); break;
        case 'berserker':
            for (let i = 0; i < 6; i++) {
                const t = (time * .19 + i / 6) % 1, s = i % 2 ? 1 : -1;
                const x = s * (190 + t * 76), y = -35 - t * 430, alpha = Math.sin(t * Math.PI);
                auraLine(rear, [x - s * 34, y + 95, x - s * 19, y + 46, x + s * 6, y + 31, x, y - 9], p.color, 12, alpha * .54);
                auraLine(rear, [x - s * 24, y + 72, x - s * 8, y + 31, x, y], p.light, 4, alpha * .72);
            }
            auraArc(floor, 0, 6, 239, 40, time * .7, 2, p); break;
        default: break;
    }
}
