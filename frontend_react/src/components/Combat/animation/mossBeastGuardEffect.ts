import type {Graphics} from 'pixi.js';

const edge = [[0, -264], [157, -219], [172, -91], [123, -4], [0, 24],
    [-123, -4], [-172, -91], [-157, -219]] as const;
const rightEdge = edge.slice(0, 5);

function shieldWidthAt(y: number) {
    for (let i = 1; i < rightEdge.length; i++) {
        const [x1, y1] = rightEdge[i - 1], [x2, y2] = rightEdge[i];
        if (y <= y2) return x1 + (x2 - x1) * (y - y1) / (y2 - y1);
    }
    return 0;
}

/** A translucent shell crosses in front of the creature; the ground seal stays behind it. */
export function drawMossBeastGuard(back: Graphics, front: Graphics, strength: number, time: number) {
    back.clear(); front.clear();
    if (strength < .01) return;
    const pulse = .94 + Math.sin(time * 3.5) * .06;
    back.ellipse(0, 8, 185, 27).fill({color: 0x91d4b5, alpha: strength * .14})
        .stroke({color: 0xbda76c, alpha: strength * .7, width: 2.5});
    back.ellipse(0, 8, 161, 20).stroke({color: 0xe8efbc, alpha: strength * .85, width: 2});
    front.poly(edge.flat())
        .stroke({color: 0x5bbda4, alpha: strength * .18, width: 13, join: 'bevel'});
    front.poly(edge.flat())
        .fill({color: 0x83d8bd, alpha: strength * .22 * pulse})
        .stroke({color: 0x489e88, alpha: strength * .9, width: 3.5, join: 'bevel'});
    front.poly(edge.flatMap(([x, y]) => [x * .966, -120 + (y + 120) * .966]))
        .stroke({color: 0xe9ffe0, alpha: strength * .65, width: 1.5, join: 'bevel'});
    front.poly([0, -264, -157, -219, -172, -91, -148, -109, -137, -202, 0, -241])
        .fill({color: 0xe7ffdc, alpha: strength * .12});
    front.poly([157, -219, 172, -91, 123, -4, 110, -20, 151, -98, 140, -205])
        .fill({color: 0x589e90, alpha: strength * .12});

    // Include polygon corners in the clipped sweep so it cannot leak beyond a sloped edge.
    const sweepY = -264 + ((Math.max(0, time - .12) % 1.6) / 1.6) * 288;
    const top = Math.max(-264, sweepY - 10), bottom = Math.min(24, sweepY + 10);
    const levels = [top, ...rightEdge.map(([, y]) => y).filter(y => y > top && y < bottom), bottom];
    front.poly([...levels.flatMap(y => [shieldWidthAt(y), y]),
        ...[...levels].reverse().flatMap(y => [-shieldWidthAt(y), y])])
        .fill({color: 0xe8ffe6, alpha: strength * .22});
    front.moveTo(-166, -111).lineTo(-153, -215).lineTo(-48, -246)
        .stroke({color: 0xf3ffe7, alpha: strength * .8, width: 4, cap: 'round', join: 'bevel'});
    front.moveTo(165, -120).lineTo(168, -93).lineTo(146, -53)
        .stroke({color: 0xd6ffe7, alpha: strength * .65, width: 3, cap: 'round', join: 'bevel'});
    for (const side of [-1, 1]) {
        const x = side * 153;
        front.poly([x, -103, x + 8, -98, x + 8, -88, x, -83, x - 8, -88, x - 8, -98])
            .fill({color: 0xddecb2, alpha: strength * .48})
            .stroke({color: 0x638e66, alpha: strength * .8, width: 1.5});
    }
}
