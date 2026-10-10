import {Graphics} from 'pixi.js';
import type {MossKingFacing, MossKingPose} from './mossKingMotion';

const shieldEdge = [[-22, -317], [161, -258], [222, -153], [205, -41],
    [109, 25], [-20, 46], [-162, 7], [-224, -84], [-211, -209], [-133, -280]] as const;

/** A faceted crystal shell around the head and body; branch tips project beyond its roof. */
export function drawMossKingGuard(back: Graphics, front: Graphics, strength: number, time: number) {
    back.clear(); front.clear();
    if (strength < .01) return;
    const pulse = .94 + Math.sin(time * 3.5) * .06;
    const rear = shieldEdge.map(([x, y]) => [x + 13, y + 4] as const);
    back.poly(rear.flat()).fill({color: 0x74b6a4, alpha: strength * .07})
        .stroke({color: 0x7ac7af, alpha: strength * .3, width: 1.5, join: 'bevel'});
    back.ellipse(-3, 12, 218, 26).fill({color: 0x91d4b5, alpha: strength * .1})
        .stroke({color: 0xc9b373, alpha: strength * .45, width: 2});
    front.poly(shieldEdge.flat()).stroke({color: 0x7bd8bc, alpha: strength * .13, width: 10, join: 'bevel'});
    front.poly(shieldEdge.flat()).fill({color: 0x8cdbc0, alpha: strength * .17 * pulse})
        .stroke({color: 0x53ab91, alpha: strength * .8, width: 2.5, join: 'bevel'});
    // Broad, non-uniform planes make the barrier read as a volume instead of a panel border.
    front.poly([-22, -317, -133, -280, -211, -209, -224, -84, -170, -117, -148, -213, -22, -267])
        .fill({color: 0xeaffdb, alpha: strength * .14});
    front.poly([161, -258, 222, -153, 205, -41, 157, -68, 172, -151, 131, -237])
        .fill({color: 0x55a994, alpha: strength * .14});
    front.poly([-224, -84, -162, 7, -20, 46, 109, 25, 205, -41, 157, -68, 71, -5, -19, 11, -136, -22, -170, -117])
        .fill({color: 0xb6eccb, alpha: strength * .1});
    front.moveTo(-22, -317).lineTo(-22, -267).lineTo(-148, -213).lineTo(-170, -117)
        .stroke({color: 0xe6ffda, alpha: strength * .3, width: 1.2, join: 'bevel'});
    front.moveTo(161, -258).lineTo(131, -237).lineTo(172, -151).lineTo(157, -68).lineTo(109, 25)
        .stroke({color: 0xcaffdc, alpha: strength * .28, width: 1.2, join: 'bevel'});
    front.moveTo(-125, -278).lineTo(-204, -206).lineTo(-215, -132)
        .stroke({color: 0xf1ffe3, alpha: strength * .85, width: 3, cap: 'round', join: 'bevel'});
    front.moveTo(218, -137).lineTo(202, -43).lineTo(153, -10)
        .stroke({color: 0xe0ffdb, alpha: strength * .65, width: 2.5, cap: 'round', join: 'bevel'});
    // Light travels along the actual edges, rather than sweeping a horizontal UI-like bar.
    const travel = ((time * .42) % 1) * shieldEdge.length;
    const segment = Math.floor(travel), progress = travel - segment;
    const [x1, y1] = shieldEdge[segment], [x2, y2] = shieldEdge[(segment + 1) % shieldEdge.length];
    front.circle(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress, 3.5)
        .fill({color: 0xf1ffe0, alpha: strength * .85});
}

/** Fixed trajectories keep replay and pause stable; shards originate at the two forehooves. */
function drawStrikeDebris(graphics: Graphics, progress: number, facing: MossKingFacing) {
    const opacity = Math.min(1, (1 - progress) / .3);
    for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI * 2 / 12;
        const origin = facing * (i % 2 ? 4 : 60);
        const spread = 18 + progress * (125 + i % 3 * 18);
        const x = origin + Math.cos(angle) * spread;
        const groundY = 8 + Math.sin(angle) * (12 + progress * 22);
        const height = 4 * progress * (1 - progress) * (64 + i % 4 * 19);
        const y = groundY - height, size = 5 + i % 4 * 2;
        const rotation = i * .4 + progress * (i % 2 ? 2.3 : -2.3);
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        const points = [[-1, -.3], [-.3, -1], [.7, -.65], [1, .35], [.1, .9]]
            .map(([px, py]) => [x + (px * cos - py * sin) * size, y + (px * sin + py * cos) * size]);
        graphics.ellipse(x, groundY, size * .9, size * .28)
            .fill({color: 0x527568, alpha: opacity * .12});
        graphics.poly(points.flat()).fill({color: i % 2 ? 0x849d87 : 0xa4b59c, alpha: opacity})
            .stroke({color: 0x587467, alpha: opacity * .85, width: 1.3, join: 'bevel'});
        graphics.poly([...points.slice(0, 3).flat(), x, y])
            .fill({color: 0xd4dfbf, alpha: opacity * .9});
    }
    // A low dust skirt marks contact without covering the face or airborne stone silhouettes.
    for (let i = 0; i < 5; i++) {
        graphics.ellipse(facing * 32 + (i - 2) * (19 + progress * 21), 12 - i % 2 * 5,
            13 + progress * 23, 5 + progress * 5)
            .fill({color: 0xb3b99a, alpha: (1 - progress) * .2});
    }
}

/** A single contact burst, not a simulation of area damage or repeated hits. */
export function drawMossKingImpact(graphics: Graphics, pose: MossKingPose, facing: MossKingFacing) {
    graphics.clear();
    const p = pose.impact;
    if (p > 0 && p < 1) {
        const x = pose.heavy ? facing * 32 : facing * 145;
        const radius = pose.heavy ? 55 + p * 165 : 25 + p * 85;
        graphics.ellipse(x, 9, radius, radius * .13)
            .stroke({color: pose.heavy ? 0xb9a56e : 0x8d9f79, alpha: (1 - p) * .8, width: pose.heavy ? 4 : 2.5});
        if (pose.heavy) {
            graphics.ellipse(x, 9, radius * .76, radius * .1)
                .stroke({color: 0xc4d7a2, alpha: (1 - p) * .5, width: 2});
            drawStrikeDebris(graphics, p, facing);
        }
    }
    if (pose.dust < .01) return;
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        graphics.ellipse(side * (160 + i * 16), 5 - i * 6, 10 + i * 4, 5 + i * 2)
            .fill({color: 0xb6bc97, alpha: pose.dust * (.3 - i * .06)});
    }
}
