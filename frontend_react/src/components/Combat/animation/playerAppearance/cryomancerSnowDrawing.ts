import {drawCryomancerAtmosphere, drawSnowflakeGlow} from './cryomancerAtmosphereDrawing';

type Context = CanvasRenderingContext2D;

// Thin branches need a 4-unit grid; six equal spokes remain crisp, without rotation.
const flakes = [
    {x: -248, phase: .18, radius: 9}, {x: 224, phase: .37, radius: 8},
    {x: -196, phase: .61, radius: 6}, {x: 266, phase: .79, radius: 6},
    {x: -108, phase: .04, radius: 7}, {x: 140, phase: .93, radius: 6},
    {x: -270, phase: .86, radius: 6}, {x: 258, phase: .12, radius: 9},
];

function pixelLine(context: Context, x0: number, y0: number, x1: number, y1: number) {
    let x = Math.round(x0), y = Math.round(y0);
    const endX = Math.round(x1), endY = Math.round(y1);
    const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
    const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
        context.fillRect(x * 4, y * 4, 4, 4);
        if (x === endX && y === endY) break;
        const twice = 2 * error;
        if (twice >= dy) {error += dy; x += sx;}
        if (twice <= dx) {error += dx; y += sy;}
    }
}

function drawFlake(context: Context, x: number, y: number, radius: number,
    color: string, light: string, opacity: number) {
    context.save();
    context.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4);
    context.globalAlpha = opacity;
    context.fillStyle = color;
    for (let branch = 0; branch < 6; branch++) {
        const angle = -Math.PI / 2 + branch * Math.PI / 3;
        pixelLine(context, 0, 0, Math.cos(angle) * radius, Math.sin(angle) * radius);
        const junctionX = Math.cos(angle) * radius * .64;
        const junctionY = Math.sin(angle) * radius * .64;
        for (const side of [-1, 1]) {
            const fork = angle + side * Math.PI / 3;
            pixelLine(context, junctionX, junctionY,
                junctionX + Math.cos(fork) * radius * .26,
                junctionY + Math.sin(fork) * radius * .26);
        }
    }
    context.fillStyle = light;
    context.fillRect(0, 0, 4, 4);
    context.restore();
}

/** Cosmetic snowfall behind the player: staggered, repeatable and pauseable. */
export function drawCryomancerSnow(rear: Context, floor: Context, time: number,
    color: string, light: string) {
    drawCryomancerAtmosphere(rear, floor, time);
    flakes.forEach((flake, i) => {
        const progress = ((time * .063 + flake.phase) % 1 + 1) % 1;
        const wind = Math.sin(time * .26) * 10;
        const x = flake.x + wind + Math.sin(time * .45 + i * 1.7) * 12;
        const y = -648 + progress * 640;
        const fade = Math.min(1, progress / .1, (1 - progress) / .14);
        drawSnowflakeGlow(rear, x, y, flake.radius, fade);
        drawFlake(rear, x, y, flake.radius, color, light, fade * .8);
    });
    // Fine, distant snow supplies depth around the larger six-branch flakes.
    rear.save();
    for (let i = 0; i < 12; i++) {
        const progress = (time * (.035 + i % 4 * .008) + i * .173) % 1;
        const x = Math.sin(i * 2.39) * 285 + Math.sin(time * .35 + i) * 18;
        const y = -632 + progress * 616;
        rear.globalAlpha = Math.min(1, progress * 8, (1 - progress) * 6) * .28;
        rear.fillStyle = i % 3 ? color : light;
        rear.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, 4, 4);
    }
    rear.restore();
}
