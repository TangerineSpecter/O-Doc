/** Draw in world units into a low-resolution canvas; Pixi enlarges with nearest sampling. */
export type EffectContext = CanvasRenderingContext2D;
export const clampEffect = (n: number) => Math.max(0, Math.min(1, n));
export const easeEffect = (n: number) => 1 - (1 - clampEffect(n)) ** 3;

export function ellipse(c: EffectContext, x: number, y: number, rx: number, ry: number,
    color: string, alpha = 1, lineWidth = 0) {
    if (rx <= 0 || ry <= 0 || alpha <= 0) return;
    c.save(); c.globalAlpha = alpha; c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (lineWidth) { c.strokeStyle = color; c.lineWidth = lineWidth; c.stroke(); }
    else { c.fillStyle = color; c.fill(); }
    c.restore();
}

export function polygon(c: EffectContext, points: readonly number[], color: string, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.fillStyle = color; c.beginPath();
    for (let i = 0; i < points.length; i += 2) {
        if (i) c.lineTo(points[i], points[i + 1]); else c.moveTo(points[i], points[i + 1]);
    }
    c.closePath(); c.fill(); c.restore();
}

export function star(c: EffectContext, x: number, y: number, radius: number, color: string, alpha = 1) {
    polygon(c, [x, y - radius, x + radius * .23, y - radius * .23, x + radius, y,
        x + radius * .23, y + radius * .23, x, y + radius, x - radius * .23, y + radius * .23,
        x - radius, y, x - radius * .23, y - radius * .23], color, alpha);
}

export function energyRing(c: EffectContext, x: number, y: number, rx: number, ry: number,
    time: number, color: string, alpha: number, runes = false) {
    ellipse(c, x, y, rx, ry, color, alpha * .22, 10);
    ellipse(c, x, y, rx, ry, color, alpha, 2);
    if (!runes) return;
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + time * .45;
        const px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry;
        polygon(c, [px, py - 5, px + 3, py, px, py + 5, px - 3, py], color, alpha);
    }
}

/** Continuous curling tongue, with five broad color bands and no fine surface texture. */
export function flameTongue(c: EffectContext, x: number, floorY: number, width: number,
    height: number, time: number, seed: number, alpha = 1) {
    const colors = ['#bc4841', '#ec6834', '#ff9b3f', '#ffd96c', '#fff4c5'];
    const bands = [1, .84, .62, .39, .18];
    colors.forEach((color, band) => {
        const points: number[] = [];
        const h = height * (1 - band * .09);
        for (const side of [1, -1]) {
            for (let j = 0; j <= 18; j++) {
                const u = side === 1 ? j / 18 : 1 - j / 18;
                const sway = Math.sin(u * 7 - time * 6 + seed) * width * .48 * u
                    + Math.sin(time * 3 + seed) * width * .18 * u * u;
                const radius = width * bands[band] * (1 - u) ** .68
                    * (1 + Math.sin(u * 12 + seed - time * 5) * .17);
                points.push(x + sway + side * radius, floorY - u * h);
            }
        }
        polygon(c, points, color, alpha);
    });
}

export function floatingEmbers(c: EffectContext, x: number, time: number, height: number,
    spread: number, alpha: number, count = 12) {
    for (let i = 0; i < count; i++) {
        const p = (time * (.35 + i % 3 * .05) + i * .618) % 1;
        const px = x + Math.sin(i * 2.4 + p * 2) * spread + Math.sin(time * 4 + i) * 5;
        const py = -8 - p * height;
        const size = i % 3 === 0 ? 4 : 2;
        c.save(); c.globalAlpha = alpha * (1 - p);
        c.fillStyle = i % 3 ? '#ffc86a' : '#fff4c5';
        c.fillRect(px, py, size, size * (i % 2 ? 1 : 2)); c.restore();
    }
}
