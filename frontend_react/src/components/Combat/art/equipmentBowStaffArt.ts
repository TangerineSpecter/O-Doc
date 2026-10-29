import {EquipmentPixelPainter} from './equipmentPixelPainter';
import type {WeaponElement} from './equipmentArtProfile';

const INK = '#261513';

interface StaffBowTheme {
    mainShine: string;
    mainLit: string;
    mainBase: string;
    mainShade: string;
    coreShine: string;
    coreLit: string;
    coreBase: string;
    coreShade: string;
    goldLit: string;
    goldBase: string;
    goldShade: string;
    haftLit: string;
    haftBase: string;
    haftShade: string;
    accentLit: string;
    accentBase: string;
    accentShade: string;
    stringColor: string;
}

function getBowStaffTheme(element?: WeaponElement, refined = false): StaffBowTheme {
    if (element === 'water') {
        return {
            mainShine: '#ffffff', mainLit: '#90e0ef', mainBase: '#00b4d8', mainShade: '#0077b6',
            coreShine: '#fff8e7', coreLit: '#caf0f8', coreBase: '#0096c7', coreShade: '#023e8a',
            goldLit: '#ffe08a', goldBase: '#eab308', goldShade: '#a16207',
            haftLit: '#48cae4', haftBase: '#1d4e89', haftShade: '#0d254c',
            accentLit: '#ffc2d1', accentBase: '#ff758f', accentShade: '#c9184a',
            stringColor: '#90e0ef',
        };
    }
    if (element === 'earth') {
        return refined ? {
            mainShine: '#fff9db', mainLit: '#ffe066', mainBase: '#f59f00', mainShade: '#b45309',
            coreShine: '#ffffff', coreLit: '#fff3bf', coreBase: '#f76707', coreShade: '#9c36b5',
            goldLit: '#fde047', goldBase: '#d97706', goldShade: '#78350f',
            haftLit: '#78716c', haftBase: '#44403c', haftShade: '#1c1917',
            accentLit: '#d6d3d1', accentBase: '#57534e', accentShade: '#292524',
            stringColor: '#fcd34d',
        } : {
            mainShine: '#fff9db', mainLit: '#ffd43b', mainBase: '#f08c00', mainShade: '#a64d08',
            coreShine: '#ffffff', coreLit: '#ffe066', coreBase: '#d97706', coreShade: '#78350f',
            goldLit: '#e7c677', goldBase: '#9c6b30', goldShade: '#543816',
            haftLit: '#8d6e63', haftBase: '#5d4037', haftShade: '#3e2723',
            accentLit: '#a8998c', accentBase: '#6e5f53', accentShade: '#3d332c',
            stringColor: '#e7c677',
        };
    }
    if (element === 'wind') {
        return {
            mainShine: '#ffffff', mainLit: '#99f6e4', mainBase: '#14b8a6', mainShade: '#0f766e',
            coreShine: '#ffffff', coreLit: '#a7f3d0', coreBase: '#10b981', coreShade: '#047857',
            goldLit: '#fef08a', goldBase: '#eab308', goldShade: '#a16207',
            haftLit: '#34d399', haftBase: '#047857', haftShade: '#064e3b',
            accentLit: '#ffffff', accentBase: '#e2e8f0', accentShade: '#94a3b8',
            stringColor: '#a7f3d0',
        };
    }
    if (element === 'fire') {
        return {
            mainShine: '#ffffff', mainLit: '#fef08a', mainBase: '#f97316', mainShade: '#b91c1c',
            coreShine: '#ffffff', coreLit: '#fde047', coreBase: '#ea580c', coreShade: '#7f1d1d',
            goldLit: '#fde047', goldBase: '#d97706', goldShade: '#78350f',
            haftLit: '#57534e', haftBase: '#292524', haftShade: '#1c1917',
            accentLit: '#fca5a5', accentBase: '#dc2626', accentShade: '#7f1d1d',
            stringColor: '#fde047',
        };
    }
    return {
        mainShine: '#ffffff', mainLit: '#e2e8f0', mainBase: '#94a3b8', mainShade: '#475569',
        coreShine: '#e0f2fe', coreLit: '#38bdf8', coreBase: '#0284c7', coreShade: '#1e3a8a',
        goldLit: '#fef08a', goldBase: '#eab308', goldShade: '#a16207',
        haftLit: '#60a5fa', haftBase: '#1d4ed8', haftShade: '#1e3a8a',
        accentLit: '#c7d2fe', accentBase: '#6366f1', accentShade: '#312e81',
        stringColor: '#e2e8f0',
    };
}

function paintXYLayer(
    g: EquipmentPixelPainter,
    inside: (x: number, y: number) => boolean,
    colorOf: (x: number, y: number) => string,
) {
    const mask = new Set<number>();
    for (let y = 1; y <= 46; y++) {
        for (let x = 1; x <= 46; x++) {
            if (inside(x, y)) mask.add(y * 48 + x);
        }
    }
    for (const idx of [...mask]) {
        if (!mask.has(idx - 1) && !mask.has(idx + 1) && !mask.has(idx - 48) && !mask.has(idx + 48)) mask.delete(idx);
    }
    const groups = new Map<string, Set<string>>();
    for (const idx of mask) {
        const x = idx % 48;
        const y = Math.floor(idx / 48);
        const isEdge =
            x === 1 || x === 46 || y === 1 || y === 46 ||
            !mask.has(y * 48 + (x - 1)) ||
            !mask.has(y * 48 + (x + 1)) ||
            !mask.has((y - 1) * 48 + x) ||
            !mask.has((y + 1) * 48 + x);
        const color = isEdge ? INK : colorOf(x, y);
        if (!groups.has(color)) groups.set(color, new Set());
        groups.get(color)!.add(`${x},${y}`);
    }
    for (const [color, pixels] of groups) g.add(color, pixels);
}

/** Draw all 7 redesigned bows (grip at (14,24); limb curves on left x=6..29, taut vertical string at x=28..29). */
export function drawRedesignedBow(g: EquipmentPixelPainter, element?: WeaponElement, refined = false) {
    const t = getBowStaffTheme(element, refined);

    // 1. Taut Vertical Bowstring from top recurve tip (26,4) to bottom recurve tip (26,44)
    g.line([26, 4], [26, 44], INK);
    g.line([25, 4], [25, 44], t.stringColor);

    // 2. Sweeping Upper & Lower Recurve Wing Limbs (y = 3..45)
    paintXYLayer(
        g,
        (x, y) => {
            if (y < 3 || y > 45) return false;
            const dy = Math.abs(y - 24);
            const center =
                dy <= 5 ? 14 :
                dy <= 14 ? Math.round(14 - Math.sin(((dy - 5) / 9) * Math.PI) * 3) :
                Math.round(14 + ((dy - 14) / 7) ** 1.75 * 14);
            let wLeft = dy <= 5 ? 2 : 3;
            const wRight = dy <= 5 ? 2 : 2;
            if (!element || element === 'none') {
                // 精制长弓: golden eagle-wing ridges on upper & lower limbs
                if (dy >= 6 && dy <= 16) wLeft += (dy === 11 ? 2 : 4);
            } else if (element === 'water') {
                // 潮汐长弓: curling ocean wave crests & coral fins
                if (dy === 8 || dy === 9 || dy === 13 || dy === 14) wLeft += 5;
                else if (dy >= 6 && dy <= 16) wLeft += 2;
            } else if (element === 'earth' && !refined) {
                // 琥岩长弓: jagged raw amber crystal spikes jutting from basalt limb
                if (dy >= 7 && dy <= 10) wLeft += 5;
                else if (dy >= 13 && dy <= 16) wLeft += 4;
            } else if (element === 'earth') {
                // 琥岩精制长弓: symmetrical dragon-horn amber blades along limbs
                if ((dy >= 6 && dy <= 10) || (dy >= 12 && dy <= 16)) wLeft += 5;
                else if (dy >= 5 && dy <= 18) wLeft += 2;
            } else if (element === 'wind') {
                // 岚羽 / 岚羽精制长弓: sweeping multi-layered snow-white feather wings!
                const feathers = refined ? 7 : 5;
                if (dy >= 6 && dy <= 18) wLeft += (dy === 10 || dy === 14 ? 2 : feathers);
            } else if (element === 'fire') {
                // 熔羽精制长弓: blazing phoenix flame-plumes flaring outward!
                if (dy >= 5 && dy <= 18) wLeft += (dy === 9 || dy === 14 ? 2 : 6);
            }
            return x >= center - wLeft && x <= center + wRight;
        },
        (x, y) => {
            const dy = Math.abs(y - 24);
            if (dy >= 18) return y < 24 ? t.goldLit : t.goldBase;
            if (element === 'wind' && x <= 11) return x <= 9 ? '#ffffff' : '#cbd5e1';
            if (element === 'fire') return x <= 9 ? t.mainLit : x <= 12 ? t.mainBase : t.mainShade;
            if (element === 'water' && x <= 10) return t.mainShine;
            if (element === 'earth' && x <= 11) return x <= 9 ? t.mainShine : t.mainLit;
            return x <= 11 ? t.mainShine : x <= 13 ? t.mainLit : x <= 15 ? t.mainBase : t.mainShade;
        },
    );

    // 3. Central Wrapped Riser Grip & Elemental Sight Gem at (14,24) (separately outlined!)
    paintXYLayer(
        g,
        (x, y) => {
            const dy = Math.abs(y - 24);
            if (dy <= 5 && x >= 11 && x <= 17) return true;
            // Forward elemental crest / gem projection at y = 21..27, x = 8..13
            return dy <= 3 && x >= 8 && x <= 13 && (13 - x) + dy <= 6;
        },
        (x, y) => {
            const dy = Math.abs(y - 24);
            if (x <= 12 && dy <= 2) return y <= 24 ? t.coreShine : t.coreBase;
            if (dy === 4) return t.goldLit;
            return x <= 14 ? t.haftLit : t.haftBase;
        },
    );
}

/** Draw all 7 redesigned one-handed mage staves (vertical axis x=24, grip at (24,36)). */
export function drawRedesignedMageStaff(g: EquipmentPixelPainter, element?: WeaponElement, refined = false) {
    const t = getBowStaffTheme(element, refined);

    // 1. Slender Vertical Staff Shaft (x = 22..26, y = 17..45; grip at (24,36))
    paintXYLayer(
        g,
        (x, y) => {
            if (y >= 41 && y <= 45) return Math.abs(x - 24) + Math.abs(y - 43) <= 4;
            return y >= 17 && y <= 42 && Math.abs(x - 24) <= 2;
        },
        (x, y) => {
            if (y >= 42) return x <= 24 ? t.coreShine : t.coreBase;
            if (y === 23 || y === 30 || y === 35 || y === 39) return x <= 24 ? t.goldLit : t.goldBase;
            return x < 24 ? t.haftLit : x === 24 ? t.haftBase : t.haftShade;
        },
    );

    // 2. Ornate Magical Staff Head Cradle / Wings / Halo (y = 3..19)
    paintXYLayer(
        g,
        (x, y) => {
            const dx = Math.abs(x - 24);
            if (!element || element === 'none') {
                // 精制法杖: hollow golden astrolabe ring around (24,11) + silver outer winglets
                const dist = Math.hypot(x - 24, y - 11);
                const ring = dist >= 5.2 && dist <= 8.5;
                const wings = y >= 7 && y <= 15 && dx >= 8 && dx <= 15 && Math.abs(y - 11 - (dx - 11) * 0.5) <= 2.2;
                return ring || wings;
            }
            if (element === 'water') {
                // 潮汐法杖: curling tsunami wave crescent on left + pink coral branch on right
                const dist = Math.hypot(x - 24, y - 11);
                const leftWave = x <= 25 && dist >= 4.5 && dist <= 9.2 && y >= 3 && y <= 18;
                const rightCoral = x >= 24 && y >= 6 && y <= 18 && dist >= 4.5 && dist <= 8.8;
                return leftWave || rightCoral;
            }
            if (element === 'earth' && !refined) {
                // 琥岩法杖: 3 tall jagged amber crystal spires (y=3..17)
                const centerSpire = y >= 3 && y <= 17 && dx <= Math.min(4, Math.floor((y - 1) * 0.45));
                const sideSpires = y >= 6 && y <= 17 && dx >= 4 && dx <= 11 && Math.abs(dx - 8) <= Math.floor((18 - y) * 0.35);
                return centerSpire || sideSpires;
            }
            if (element === 'earth') {
                // 琥岩精制法杖: octagonal black-gold geomagnetic halo with 4 outer amber crystal horns
                const dist = Math.abs(x - 24) + Math.abs(y - 11);
                const halo = dist >= 6 && dist <= 10 && y >= 2 && y <= 19;
                const horns = y >= 7 && y <= 15 && dx >= 9 && dx <= 14 && Math.abs(y - 11) <= 2;
                return halo || horns;
            }
            if (element === 'wind') {
                // 岚羽 / 岚羽精制法杖: sweeping snow-white angel wings cradling the wind orb
                const maxDx = refined ? 15 : 12;
                const wingY = 14 - Math.floor(dx * 0.55);
                const upperWing = dx >= 3 && dx <= maxDx && y >= wingY - 4 && y <= wingY + 3;
                const lowerWing = refined && dx >= 4 && dx <= 13 && y >= wingY + 2 && y <= wingY + 6;
                return upperWing || lowerWing;
            }
            // 熔羽精制法杖 (fire): roaring twin phoenix flame wings
            const wingY = 14 - Math.floor(dx * 0.6);
            const flameWings = dx >= 3 && dx <= 15 && y >= wingY - 4 && y <= wingY + 4;
            const topFlame = y >= 2 && y <= 15 && dx <= Math.min(4, Math.floor((y - 1) * 0.5));
            return flameWings || topFlame;
        },
        (x, y) => {
            const dx = Math.abs(x - 24);
            if (!element || element === 'none') return dx >= 9 ? (y < 11 ? t.mainShine : t.mainLit) : (x <= 24 ? t.goldLit : t.goldBase);
            if (element === 'water') return x > 25 ? (y < 12 ? t.accentLit : t.accentBase) : (y <= 6 || x <= 17 ? t.mainShine : t.mainLit);
            if (element === 'earth' && !refined) return x <= 24 ? t.mainShine : t.mainBase;
            if (element === 'earth') return dx >= 10 ? t.mainLit : (x <= 24 ? t.goldLit : t.goldShade);
            if (element === 'wind') return y <= 11 ? '#ffffff' : '#cbd5e1';
            return dx <= 4 && y <= 11 ? t.mainShine : y <= 10 ? t.mainLit : y <= 14 ? t.mainBase : t.mainShade;
        },
    );

    // 3. Crown Calyx / Collar at Top of Shaft (y = 15..20, x = 19..29, separately outlined!)
    paintXYLayer(
        g,
        (x, y) => y >= 15 && y <= 20 && Math.abs(x - 24) <= (y <= 17 ? 5 : 4),
        (x) => (x < 24 ? t.goldLit : x === 24 ? t.goldBase : t.goldShade),
    );

    // 4. Central Floating Elemental Core Gem at (24,11) (separately outlined!)
    paintXYLayer(
        g,
        (x, y) => Math.abs(x - 24) + Math.abs(y - 11) <= 5,
        (x, y) => {
            if (x <= 24 && y <= 11) return t.coreShine;
            if (x <= 25 && y <= 12) return t.coreLit;
            return t.coreBase;
        },
    );
}

/** Draw all 3 two-handed arcane staves (`equip.staff.element.*`) & 3 holy scepters (`equip.holy_staff.element.*`).
 * Diagonal axis from bottom-left (6,41) to top-right (41,6); grip at (13,34), emitter at (33,14). */
export function drawRedesignedGrandStaff(g: EquipmentPixelPainter, kind: 'staff' | 'holy_staff', element: WeaponElement) {
    const t = getBowStaffTheme(element, true);
    const isHoly = kind === 'holy_staff';

    const paintDiag = (
        inside: (s: number, d: number) => boolean,
        colorOf: (s: number, d: number) => string,
    ) => {
        paintXYLayer(
            g,
            (x, y) => inside(x - y + 35, x + y - 47),
            (x, y) => colorOf(x - y + 35, x + y - 47),
        );
    };

    // 1. Long Diagonal Rod (s = 3..46, |d| <= 2..3) & Tail Fin (s = -3..5)
    paintDiag(
        (s, d) => {
            if (s >= -3 && s <= 5 && Math.abs(s - 1) + Math.abs(d) <= 6) return true;
            return s >= 4 && s <= 46 && Math.abs(d) <= (isHoly ? 2 : 3);
        },
        (s, d) => {
            if (s <= 4) return d <= 0 ? t.coreShine : t.goldBase;
            if (s === 12 || s === 20 || s === 28 || s === 36) return t.goldLit;
            if (isHoly) return d < 0 ? '#fffbeb' : d === 0 ? '#fde68a' : '#d97706';
            return d < 0 ? t.haftLit : d === 0 ? t.haftBase : t.haftShade;
        },
    );

    if (!isHoly) {
        // 秘法杖 Layer 2A: Outer Elemental Wings / Dragon Claws (s = 39..64)
        paintDiag(
            (s, d) => {
                const ad = Math.abs(d);
                if (element === 'earth') {
                    return s >= 39 && s <= 59 && ad >= 3 && ad <= 13 && Math.abs(s - 48 - (ad - 7)) <= 5;
                }
                if (element === 'wind') {
                    const wingS = 43 + Math.floor(ad * 0.55);
                    return ad >= 3 && ad <= 16 && s >= wingS - 5 && s <= wingS + 5;
                }
                const wingS = 42 + Math.floor(ad * 0.6);
                return ad >= 3 && ad <= 16 && s >= wingS - 5 && s <= wingS + 5;
            },
            (_s, d) => {
                const ad = Math.abs(d);
                if (element === 'earth') return d < 0 ? t.goldLit : t.goldShade;
                if (element === 'wind') return d < 0 ? '#ffffff' : ad >= 10 ? t.goldLit : t.mainLit;
                return ad >= 11 ? t.mainLit : d < 0 ? t.mainBase : t.mainShade;
            },
        );
        // 秘法杖 Layer 2B: Colossal Central Elemental Crystal Spire (s = 45..72, separately outlined!)
        paintDiag(
            (s, d) => s >= 45 && s <= 72 && Math.abs(d) <= (s > 60 ? Math.max(0, Math.floor((73 - s) * 0.5)) : 6),
            (_s, d) => (d < -1 ? t.coreShine : d <= 1 ? t.mainLit : t.mainBase),
        );
        // 秘法杖 Layer 2C: Golden Neck Collar (s = 40..47, |d| <= 5)
        paintDiag(
            (s, d) => s >= 40 && s <= 47 && Math.abs(d) <= 5,
            (_s, d) => (d < 0 ? t.goldLit : d <= 1 ? t.goldBase : t.goldShade),
        );
    } else {
        // 晨祷权杖 Layer 2A: 4-Pointed Diamond Cross-Arms & Elemental Wings/Rays
        paintDiag(
            (s, d) => {
                const ds = Math.abs(s - 54);
                const ad = Math.abs(d);
                const axialArm = ds <= 18 && ad <= Math.max(1, 4 - Math.floor(ds * 0.2));
                const perpArm = ad <= 15 && ds <= Math.max(1, 4 - Math.floor(ad * 0.22));
                const rays = element === 'wind'
                    ? (ad >= 5 && ad <= 14 && s >= 42 + Math.floor(ad * 0.5) && s <= 50 + Math.floor(ad * 0.5))
                    : element === 'earth'
                    ? (ds >= 4 && ds <= 9 && ad >= 4 && ad <= 9 && ds + ad <= 14)
                    : (ds >= 4 && ds <= 13 && ad >= 4 && ad <= 13 && Math.abs(ds - ad) <= 2);
                return axialArm || perpArm || rays;
            },
            (s, d) => {
                const ds = Math.abs(s - 54);
                const ad = Math.abs(d);
                if (element === 'wind' && ad >= 6 && s < 54) return '#ffffff';
                if (element === 'fire' && ds >= 5 && ad >= 5) return t.mainBase;
                if (element === 'earth' && (ds >= 11 || ad >= 10)) return t.mainShine;
                return d < 0 ? t.goldLit : d <= 2 ? t.goldBase : t.goldShade;
            },
        );
        // 晨祷权杖 Layer 2B: Sacred Golden Halo Ring around (s=54, d=0) (separately outlined!)
        paintDiag(
            (s, d) => {
                const dist = Math.hypot((s - 54) * 0.78, d);
                return dist >= 4.2 && dist <= 8.8;
            },
            (_s, d) => (d < 0 ? t.goldLit : d <= 2 ? t.goldBase : t.goldShade),
        );
        // 晨祷权杖 Layer 2C: Central Sacred Elemental Gem at (s=54, d=0) (separately outlined!)
        paintDiag(
            (s, d) => Math.abs(s - 54) + Math.abs(d) <= 5,
            (_s, d) => (d <= 0 ? t.coreShine : t.coreBase),
        );
    }
}
