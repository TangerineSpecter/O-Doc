import {ellipse, polygon} from '../pixelEffectDrawing';
import {auraArc, auraFeather, auraGlow, auraLeaf, auraLine, auraSpark, tau} from './auraDrawingPrimitives';
import type {AuraContext, AuraPalette} from './auraDrawingPrimitives';

function moon(c: AuraContext, x: number, y: number, r: number, angle: number, p: AuraPalette, alpha: number) {
    auraGlow(c, x, y, r * 2.4, r * 2.4, p.color, p.light, alpha * .26);
    c.save(); c.translate(x, y); c.rotate(angle); c.globalAlpha = alpha; c.fillStyle = p.light;
    c.beginPath(); c.arc(0, 0, r, -.9, .9);
    c.quadraticCurveTo(-r * .1, 0, Math.cos(-.9) * r, Math.sin(-.9) * r); c.fill(); c.restore();
}
export function drawRangerAura(rear: AuraContext, floor: AuraContext, p: AuraPalette, time: number) {
    switch (p.id) {
        case 'ranger':
            for (let i = 0; i < 4; i++) {
                const t = (time * .07 + i / 4) % 1, s = i % 2 ? 1 : -1;
                const x = s * (221 + Math.sin(t * tau + i) * 24), y = -540 + t * 450;
                auraFeather(rear, x, y, 66, s * .5 + Math.sin(time * .7 + i) * .35, p, Math.sin(t * Math.PI) * .65);
            }
            auraArc(rear, 0, -275, 264, 167, -time * .32, 1.6, p, .35); break;
        case 'archer':
            for (let i = 0; i < 3; i++) {
                const a = time * .28 + i * tau / 3, x = Math.cos(a) * 259, y = -305 + Math.sin(a) * 229;
                auraFeather(rear, x, y, 79, a + Math.PI / 2, p, .64);
                auraArc(rear, 0, -305, 259, 229, a - .8, .7, p, .48);
            } break;
        case 'assassin':
            for (let i = 0; i < 2; i++) {
                const a = -time * .35 + i * Math.PI;
                moon(rear, Math.cos(a) * 243, -300 + Math.sin(a) * 212, 40, a + Math.PI, p, .7);
                auraArc(rear, 0, -300, 243, 212, a, -.8, p, .35);
            }
            auraArc(floor, 0, 5, 204, 36, time * .25, 1.9, p, .4); break;
        case 'sharpshooter':
            for (const s of [-1, 1]) {
                const y = -280 + Math.sin(time * .9 + s) * 70;
                auraFeather(rear, s * 247, y, 103, s * (.58 + Math.sin(time * .6) * .2), p, .76);
            }
            auraArc(rear, 0, -305, 281, 236, time * .33, 1.3, p, .55);
            for (let i = 0; i < 4; i++) {const a = time * .2 + i * Math.PI / 2; auraLine(floor, [Math.cos(a) * 214, 6 + Math.sin(a) * 38, Math.cos(a) * 237, 6 + Math.sin(a) * 45], p.light, 4, .65);} break;
        case 'hunter': {
            const y = -585 + Math.sin(time * .8) * 10;
            ellipse(rear, 0, y, 21, 15, p.color, .65);
            for (const s of [-1, 0, 1]) ellipse(rear, s * 22, y - 25 - (s ? 0 : 6), 7, 9, p.light, .85);
            for (let i = 0; i < 4; i++) {
                const t = (time * .11 + i / 4) % 1, s = i % 2 ? 1 : -1;
                auraLeaf(rear, s * (222 + Math.sin(t * tau) * 25), -470 + t * 390, 46, s + Math.sin(time + i) * .4, p, Math.sin(t * Math.PI) * .65);
            }
            auraArc(floor, 0, 5, 219, 38, time * .3, 2.1, p, .6); break;
        }
        case 'shadowdancer':
            for (let i = 0; i < 3; i++) {
                const a = time * .4 + i * tau / 3, x = Math.cos(a) * 256, y = -305 + Math.sin(a) * 236;
                moon(rear, x, y, 26 + i * 6, a + time * .15, p, .58 + Math.sin(time + i) * .12);
                auraArc(rear, 0, -305, 256, 236, a - 1.2, 1, p, .32);
            } break;
        case 'trickster':
            for (let i = 0; i < 3; i++) {
                const a = time * .23 + i * tau / 3, x = Math.cos(a) * 258, y = -305 + Math.sin(a) * 239;
                auraGlow(rear, x, y, 62, 64, p.color, p.light, .22);
                rear.save(); rear.translate(x, y); rear.rotate(Math.sin(time * .85 + i) * .3);
                polygon(rear, [-18, -27, 18, -27, 18, 27, -18, 27], p.color, .64);
                auraLine(rear, [-13, -18, -13, -22, 13, -22, 13, -18], p.light, 4, .8);
                auraSpark(rear, 0, 0, 10, p, .8); rear.restore();
            }
            auraArc(floor, 0, 5, 210, 37, -time * .4, 1.6, p); break;
        default: break;
    }
}
