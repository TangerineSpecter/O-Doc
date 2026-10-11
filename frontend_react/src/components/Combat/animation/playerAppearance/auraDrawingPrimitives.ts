import {polygon, star} from '../pixelEffectDrawing';
import type {ProfessionAuraProfile} from '../../art/professionAuras';
export type AuraContext = CanvasRenderingContext2D;
export type AuraPalette = {id: ProfessionAuraProfile['id']; color: string; light: string; tier: number};
export const tau = Math.PI * 2;
export function tint(hex: string, opacity: number) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${opacity})`;
}
export function auraGlow(c: AuraContext, x: number, y: number, rx: number, ry: number,
    color: string, light: string, opacity: number) {
    c.save(); c.translate(x, y); c.scale(rx, ry);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, tint(light, opacity)); g.addColorStop(.3, tint(color, opacity * .85));
    g.addColorStop(.65, tint(color, opacity * .32)); g.addColorStop(1, tint(color, 0));
    c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
}
export function auraLine(c: AuraContext, points: number[], color: string, width = 4, opacity = .6) {
    c.save(); c.strokeStyle = color; c.lineWidth = width; c.globalAlpha = opacity;
    c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < points.length; i += 2) {
        if (i) c.lineTo(points[i], points[i + 1]); else c.moveTo(points[i], points[i + 1]);
    }
    c.stroke(); c.restore();
}
/** A travelling head with a fading tail, not a closed static border. */
export function auraArc(c: AuraContext, x: number, y: number, rx: number, ry: number,
    angle: number, sweep: number, p: AuraPalette, opacity = .65) {
    for (let i = 0; i < 18; i++) {
        const a = angle + sweep * i / 18, b = angle + sweep * (i + 1) / 18;
        const points = [x + Math.cos(a) * rx, y + Math.sin(a) * ry, x + Math.cos(b) * rx, y + Math.sin(b) * ry];
        const fade = (i + 1) / 18 * opacity;
        auraLine(c, points, p.color, 14, fade * .12);
        auraLine(c, points, p.color, 8, fade * .65);
        auraLine(c, points, p.light, 4, fade);
    }
    const head = angle + sweep;
    auraGlow(c, x + Math.cos(head) * rx, y + Math.sin(head) * ry, 36, 36, p.color, p.light, opacity * .3);
}
export function auraSpark(c: AuraContext, x: number, y: number, size: number, p: AuraPalette, opacity = .8) {
    auraGlow(c, x, y, size * 4, size * 4, p.color, p.light, opacity * .25);
    star(c, x, y, size + 4, p.color, opacity * .32);
    star(c, x, y, size, p.light, opacity);
}
export function auraRune(c: AuraContext, x: number, y: number, rx: number, ry: number,
    sides: number, angle: number, p: AuraPalette, opacity = .4) {
    const points: number[] = [];
    for (let i = 0; i <= sides; i++) {const a = angle + i / sides * tau; points.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry);}
    auraLine(c, points, p.color, 4, opacity);
}
export function auraLeaf(c: AuraContext, x: number, y: number, size: number, angle: number, p: AuraPalette, opacity = .75) {
    c.save(); c.translate(x, y); c.rotate(angle); c.globalAlpha = opacity;
    c.fillStyle = p.color; c.beginPath(); c.moveTo(0, -size);
    c.quadraticCurveTo(size * .65, -size * .6, 0, 0);
    c.quadraticCurveTo(-size * .55, -size * .3, 0, -size); c.fill();
    auraLine(c, [0, -size * .8, 0, -size * .15], p.light, 4, opacity); c.restore();
}
export function auraFeather(c: AuraContext, x: number, y: number, size: number, angle: number, p: AuraPalette, opacity = .7) {
    c.save(); c.translate(x, y); c.rotate(angle);
    polygon(c, [0, -size, 13, -size * .8, 17, -size * .46, 9, -size * .14, 0, 10, -12, -size * .16, -17, -size * .5, -8, -size * .83], p.color, opacity);
    auraLine(c, [0, 16, 0, -size * .88], p.light, 4, opacity);
    for (let i = 1; i < 4; i++) {
        const y0 = -size * i / 5;
        auraLine(c, [-11, y0 - 10, 0, y0, 11, y0 - 13], p.light, 4, opacity * .65);
    }
    c.restore();
}
export function auraMotes(c: AuraContext, p: AuraPalette, time: number, direction = -1) {
    for (let i = 0; i < 4 + p.tier; i++) {
        const t = (time * .07 + i * .147) % 1;
        const x = Math.sin(i * 2.39) * 270 + Math.sin(time * .6 + i) * 16;
        const y = direction < 0 ? -35 - t * 510 : -610 + t * 555;
        const opacity = Math.sin(t * Math.PI) * .55;
        c.save(); c.globalAlpha = opacity; c.fillStyle = p.light;
        c.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, 4 + i % 2 * 4, 4); c.restore();
    }
}
export function drawAuraAtmosphere(rear: AuraContext, floor: AuraContext, p: AuraPalette, time: number) {
    const breath = .92 + Math.sin(time * .9) * .08;
    auraGlow(rear, Math.sin(time * .3) * 12, -280, 260 + p.tier * 13, 265 + p.tier * 10,
        p.color, p.light, (.24 + p.tier * .04) * breath);
    auraGlow(rear, 0, -335, 217, 253, p.color, p.light, (.12 + p.tier * .025) * breath);
    auraGlow(floor, 0, 5, 180 + p.tier * 28, 34 + p.tier * 5, p.color, p.light, .26 * breath);
    auraMotes(rear, p, time);
}
