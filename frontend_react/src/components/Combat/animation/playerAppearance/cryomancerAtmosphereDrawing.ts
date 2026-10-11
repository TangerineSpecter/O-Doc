type Context = CanvasRenderingContext2D;

/** Soft color behind the crisp pixel silhouettes; no blur is applied to the player. */
function glow(context: Context, x: number, y: number, rx: number, ry: number, opacity: number) {
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(192,250,255,${opacity})`);
    gradient.addColorStop(.24, `rgba(114,225,255,${opacity * .95})`);
    gradient.addColorStop(.52, `rgba(65,169,255,${opacity * .65})`);
    gradient.addColorStop(.78, `rgba(76,132,246,${opacity * .2})`);
    gradient.addColorStop(1, 'rgba(76,132,246,0)');
    context.fillStyle = gradient;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
}

export function drawSnowflakeGlow(context: Context, x: number, y: number, radius: number, opacity: number) {
    glow(context, x, y, radius * 6, radius * 6, opacity * .3);
}

/** Slow breathing halo and low mist share scene time, including pause and static portraits. */
export function drawCryomancerAtmosphere(rear: Context, floor: Context, time: number) {
    const breath = .94 + Math.sin(time * .85) * .06;
    glow(rear, 0, -276, 326, 326, .5 * breath);
    glow(rear, Math.sin(time * .3) * 12, -380, 224, 246, .32 * breath);
    // The player covers the center; side lobes keep the cold light visible around the silhouette.
    for (const side of [-1, 1]) {
        glow(rear, side * (158 + Math.sin(time * .4) * 8), -235, 154, 220, .42 * breath);
    }
    glow(floor, 0, 4, 298, 66, .53 * breath);
    glow(floor, 0, -8, 212, 28, .28 * breath);
    // Wide, staggered wisps drift out from the feet and fade below the shoulders.
    for (let i = 0; i < 8; i++) {
        const progress = ((time * .09 + i / 8) % 1 + 1) % 1;
        const side = i % 2 ? 1 : -1;
        const x = side * (92 + progress * 150) + Math.sin(time * .5 + i) * 14;
        const y = -22 - progress * 146;
        const opacity = Math.sin(progress * Math.PI) * .29;
        glow(rear, x, y, 68 + progress * 50, 18 + progress * 24, opacity);
        glow(floor, side * (72 + progress * 140), 10 + Math.sin(time * .4 + i) * 8,
            74 + progress * 34, 16 + progress * 9, opacity * .7);
    }
}
