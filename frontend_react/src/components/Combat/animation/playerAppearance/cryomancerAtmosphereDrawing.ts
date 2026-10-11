type Context = CanvasRenderingContext2D;

/** Soft color behind the crisp pixel silhouettes; no blur is applied to the player. */
function glow(context: Context, x: number, y: number, rx: number, ry: number, opacity: number) {
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(154,239,255,${opacity})`);
    gradient.addColorStop(.3, `rgba(102,207,255,${opacity * .9})`);
    gradient.addColorStop(.65, `rgba(85,158,243,${opacity * .4})`);
    gradient.addColorStop(1, 'rgba(85,158,243,0)');
    context.fillStyle = gradient;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
}

export function drawSnowflakeGlow(context: Context, x: number, y: number, radius: number, opacity: number) {
    glow(context, x, y, radius * 6, radius * 6, opacity * .22);
}

/** Slow breathing halo and low mist share scene time, including pause and static portraits. */
export function drawCryomancerAtmosphere(rear: Context, floor: Context, time: number) {
    const breath = .94 + Math.sin(time * .85) * .06;
    glow(rear, 0, -265, 310, 300, .34 * breath);
    glow(rear, Math.sin(time * .3) * 12, -335, 224, 274, .22 * breath);
    glow(floor, 0, 4, 278, 54, .38 * breath);
    // Puffs lift from the feet and spread sideways, disappearing before the face.
    for (let i = 0; i < 6; i++) {
        const progress = ((time * .11 + i / 6) % 1 + 1) % 1;
        const side = i % 2 ? 1 : -1;
        const x = side * (96 + progress * 134) + Math.sin(time * .5 + i) * 12;
        const y = -18 - progress * 132;
        const opacity = Math.sin(progress * Math.PI) * .19;
        glow(rear, x, y, 62 + progress * 60, 24 + progress * 16, opacity);
    }
}
