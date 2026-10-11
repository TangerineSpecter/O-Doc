import {ellipse} from '../pixelEffectDrawing';
import {auraArc, auraGlow, auraLeaf, auraLine, auraRune, auraSpark, tau} from './auraDrawingPrimitives';
import type {AuraContext, AuraPalette} from './auraDrawingPrimitives';

function fireWisp(c: AuraContext, x: number, y: number, phase: number, p: AuraPalette, alpha: number) {
    auraGlow(c, x, y - 20, 71, 96, p.color, p.light, alpha * .3);
    c.save(); c.translate(x, y); c.globalAlpha = alpha; c.fillStyle = p.color;
    const sway = Math.sin(phase) * 12;
    c.beginPath(); c.moveTo(0, 18);
    c.bezierCurveTo(-35, 7, -23, -26, sway, -72);
    c.bezierCurveTo(sway - 4, -27, 28, -20, 20, 1);
    c.quadraticCurveTo(14, 19, 0, 18); c.fill();
    c.fillStyle = p.light; c.beginPath(); c.moveTo(0, 9);
    c.quadraticCurveTo(-14, -4, sway * .4, -32); c.quadraticCurveTo(18, -1, 0, 9); c.fill(); c.restore();
}
/** Elemental energy floats behind the shoulders; it never burns up from the player's feet. */
export function drawArcaneAura(rear: AuraContext, floor: AuraContext, p: AuraPalette, time: number) {
    switch (p.id) {
        case 'mage':
            auraArc(rear, 0, -305, 257, 241, time * .35, 2.2, p);
            auraArc(rear, 0, -305, 257, 241, time * .35 + Math.PI, 1.3, p, .4);
            for (let i = 0; i < 3; i++) {const a = time * .35 + i * tau / 3; auraSpark(rear, Math.cos(a) * 257, -305 + Math.sin(a) * 241, 12, p);} break;
        case 'elementalist':
            auraArc(rear, 0, -305, 268, 235, time * .24, 2, p, .35);
            ['#f1a35c', '#79c6e9', '#9bbf72', '#b99ada'].forEach((color, i) => {
                const a = time * .32 + i * tau / 4, x = Math.cos(a) * 265, y = -305 + Math.sin(a) * 238;
                const q = {...p, color, light: '#fff6db'};
                auraGlow(rear, x, y, 54, 54, color, q.light, .35);
                if (i === 0) fireWisp(rear, x, y + 13, time, q, .68);
                else if (i === 1) {ellipse(rear, x, y, 14, 20, color, .8); ellipse(rear, x - 4, y - 6, 5, 8, q.light, .8);}
                else if (i === 2) auraLeaf(rear, x, y + 19, 42, Math.sin(time) * .4, q);
                else auraSpark(rear, x, y, 19, q);
            }); break;
        case 'occultist':
            auraRune(rear, 0, -305, 278, 248, 3, -Math.PI / 2 + time * .12, p, .42);
            auraRune(rear, 0, -305, 236, 213, 3, Math.PI / 2 - time * .17, p, .3);
            for (let i = 0; i < 3; i++) {const a = -Math.PI / 2 + time * .12 + i * tau / 3; auraSpark(rear, Math.cos(a) * 278, -305 + Math.sin(a) * 248, 15, p);} break;
        case 'flame':
            for (let i = 0; i < 4; i++) {
                const t = (time * .12 + i / 4) % 1, s = i % 2 ? 1 : -1;
                const x = s * (224 + Math.sin(t * Math.PI * 2 + i) * 28), y = -160 - t * 360;
                fireWisp(rear, x, y, time * 1.4 + i, p, Math.sin(t * Math.PI) * .7);
            }
            auraArc(rear, 0, -305, 278, 230, time * .28, 1.35, p, .48);
            auraArc(rear, 0, -305, 278, 230, time * .28 + Math.PI, 1.35, p, .48);
            auraGlow(floor, 0, 6, 251, 45, '#efac52', '#ffecc1', .25); break;
        case 'warlock': {
            const y = -598 + Math.sin(time * .8) * 14;
            auraGlow(rear, 0, y, 85, 50, p.color, p.light, .32);
            const opening = 16 + Math.sin(time * .7) * 5;
            auraLine(rear, [-37, y, 0, y - opening, 37, y, 0, y + opening, -37, y], p.light, 4, .7);
            ellipse(rear, Math.sin(time * .45) * 8, y, 7, 12, p.color, .8);
            auraArc(rear, 0, -295, 269, 238, -time * .27, 1.8, p, .45);
            for (const s of [-1, 1]) auraGlow(rear, s * (204 + Math.sin(time + s) * 12), -85, 90, 65, p.color, p.light, .2);
            break;
        }
        case 'summoner':
            for (let i = 0; i < 3; i++) {
                const a = time * .2 + i * tau / 3, x = Math.cos(a) * 252, y = -305 + Math.sin(a) * 247;
                auraGlow(rear, x, y, 62, 73, p.color, p.light, .4);
                ellipse(rear, x, y, 18, 24, p.color, .67); ellipse(rear, x - 3, y - 6, 9, 13, p.light, .72);
                auraLine(rear, [x, y + 17, x - Math.sin(time * 1.5 + i) * 15, y + 42, x + 12, y + 59], p.color, 8, .3);
            }
            auraRune(floor, 0, 6, 212, 39, 6, time * .17, p, .5); break;
        default: break;
    }
}
