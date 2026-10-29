import {EquipmentPixelPainter} from './equipmentPixelPainter';
import type {WeaponElement} from './equipmentArtProfile';

const INK = '#261513';

interface ThemeColors {
    bladeShine: string;
    bladeLit: string;
    bladeBase: string;
    bladeShade: string;
    coreShine: string;
    coreLit: string;
    coreBase: string;
    coreShade: string;
    guardLit: string;
    guardBase: string;
    guardShade: string;
    handleLit: string;
    handleBase: string;
    handleShade: string;
    wrap: string;
    accentLit: string;
    accentBase: string;
    accentShade: string;
}

function getTheme(element?: WeaponElement, refined = false): ThemeColors {
    if (element === 'water') {
        return {
            bladeShine: '#ffffff', bladeLit: '#90e0ef', bladeBase: '#00b4d8', bladeShade: '#0077b6',
            coreShine: '#fff8e7', coreLit: '#caf0f8', coreBase: '#0096c7', coreShade: '#023e8a',
            guardLit: '#ffb3c6', guardBase: '#ff758f', guardShade: '#c9184a',
            handleLit: '#48cae4', handleBase: '#1d4e89', handleShade: '#0d254c', wrap: '#ffd166',
            accentLit: '#ffffff', accentBase: '#ffd166', accentShade: '#cc8b19',
        };
    }
    if (element === 'earth') {
        return refined ? {
            bladeShine: '#fff9db', bladeLit: '#ffe066', bladeBase: '#f59f00', bladeShade: '#b45309',
            coreShine: '#ffffff', coreLit: '#fff3bf', coreBase: '#f76707', coreShade: '#9c36b5',
            guardLit: '#ffd43b', guardBase: '#d97706', guardShade: '#78350f',
            handleLit: '#78716c', handleBase: '#44403c', handleShade: '#1c1917', wrap: '#fbbf24',
            accentLit: '#a8a29e', accentBase: '#57534e', accentShade: '#292524',
        } : {
            bladeShine: '#fff9db', bladeLit: '#ffd43b', bladeBase: '#f08c00', bladeShade: '#a64d08',
            coreShine: '#e7ddd3', coreLit: '#a8998c', coreBase: '#6e5f53', coreShade: '#3d332c',
            guardLit: '#d6a85a', guardBase: '#8c6239', guardShade: '#4a3219',
            handleLit: '#8d6e63', handleBase: '#5d4037', handleShade: '#3e2723', wrap: '#fbbf24',
            accentLit: '#fff3bf', accentBase: '#f59f00', accentShade: '#b45309',
        };
    }
    if (element === 'wind') {
        return {
            bladeShine: '#ffffff', bladeLit: '#99f6e4', bladeBase: '#14b8a6', bladeShade: '#0f766e',
            coreShine: '#ffffff', coreLit: '#d1fae5', coreBase: '#10b981', coreShade: '#065f46',
            guardLit: '#ffffff', guardBase: '#e2e8f0', guardShade: '#94a3b8',
            handleLit: '#34d399', handleBase: '#047857', handleShade: '#064e3b', wrap: '#fde047',
            accentLit: '#fef08a', accentBase: '#eab308', accentShade: '#a16207',
        };
    }
    if (element === 'fire') {
        return {
            bladeShine: '#ffffff', bladeLit: '#fef08a', bladeBase: '#f97316', bladeShade: '#b91c1c',
            coreShine: '#ffffff', coreLit: '#fde047', coreBase: '#ea580c', coreShade: '#7f1d1d',
            guardLit: '#fde047', guardBase: '#ea580c', guardShade: '#7c2d12',
            handleLit: '#57534e', handleBase: '#292524', handleShade: '#1c1917', wrap: '#fb923c',
            accentLit: '#fef08a', accentBase: '#dc2626', accentShade: '#450a0a',
        };
    }
    // Refined non-elemental (Lv.31 Royal Mithril & Gold + Sapphire)
    return {
        bladeShine: '#ffffff', bladeLit: '#e2e8f0', bladeBase: '#94a3b8', bladeShade: '#475569',
        coreShine: '#e0f2fe', coreLit: '#38bdf8', coreBase: '#0284c7', coreShade: '#1e3a8a',
        guardLit: '#fef08a', guardBase: '#eab308', guardShade: '#a16207',
        handleLit: '#3b82f6', handleBase: '#1d4ed8', handleShade: '#1e3a8a', wrap: '#fde047',
        accentLit: '#bae6fd', accentBase: '#0284c7', accentShade: '#172554',
    };
}

/** Paint a 48x48 region in diagonal coordinates (s = x - y + 35, d = x + y - 47) with a crisp dark outline. */
function paintDiagLayer(
    g: EquipmentPixelPainter,
    inside: (s: number, d: number, x: number, y: number) => boolean,
    colorOf: (s: number, d: number, x: number, y: number) => string,
) {
    const mask = new Set<number>();
    for (let y = 1; y <= 46; y++) {
        for (let x = 1; x <= 46; x++) {
            const s = x - y + 35;
            const d = x + y - 47;
            if (inside(s, d, x, y)) mask.add(y * 48 + x);
        }
    }
    for (const idx of [...mask]) {
        if (!mask.has(idx - 1) && !mask.has(idx + 1) && !mask.has(idx - 48) && !mask.has(idx + 48)) mask.delete(idx);
    }
    const groups = new Map<string, Set<string>>();
    const put = (x: number, y: number, c: string) => {
        if (!groups.has(c)) groups.set(c, new Set());
        groups.get(c)!.add(`${x},${y}`);
    };
    for (const idx of mask) {
        const x = idx % 48;
        const y = Math.floor(idx / 48);
        const s = x - y + 35;
        const d = x + y - 47;
        const isEdge =
            x === 1 || x === 46 || y === 1 || y === 46 ||
            !mask.has(y * 48 + (x - 1)) ||
            !mask.has(y * 48 + (x + 1)) ||
            !mask.has((y - 1) * 48 + x) ||
            !mask.has((y + 1) * 48 + x);
        put(x, y, isEdge ? INK : colorOf(s, d, x, y));
    }
    for (const [color, pixels] of groups) g.add(color, pixels);
}

/** Draw all 7 redesigned swords (grip at (12,35) => s=12, d=0). */
export function drawRedesignedSword(g: EquipmentPixelPainter, element?: WeaponElement, refined = false) {
    const t = getTheme(element, refined);

    // 1. Handle (s = 5..21, |d| <= 3) & Pommel (s = -2..6)
    paintDiagLayer(
        g,
        (s, d) => {
            if (s >= 5 && s <= 21 && Math.abs(d) <= 3) return true;
            // Pommel silhouette varies by theme
            if (element === 'water') return s >= -2 && s <= 6 && d >= -5 && d <= 4 && (s - 2) ** 2 + d ** 2 <= 22;
            if (element === 'wind') return s >= -3 && s <= 6 && Math.abs(d) <= Math.max(1, 6 - Math.abs(s - 2));
            if (element === 'fire') return s >= -3 && s <= 6 && Math.abs(d) <= (s < 1 ? 3 : 5);
            return s >= -2 && s <= 6 && Math.abs(s - 2) + Math.abs(d) <= 6;
        },
        (s, d) => {
            if (s <= 5) {
                if (Math.abs(s - 2) + Math.abs(d) <= 2) return d <= 0 ? t.coreShine : t.coreBase;
                return d < 0 ? t.guardLit : d === 0 ? t.guardBase : t.guardShade;
            }
            if ((s === 9 || s === 13 || s === 17) && Math.abs(d) <= 2) return t.wrap;
            return d < 0 ? t.handleLit : d === 0 ? t.handleBase : t.handleShade;
        },
    );

    // 2. Main Blade (s = 20..73) with distinct elemental silhouette & longitudinal bevels
    paintDiagLayer(
        g,
        (s, d) => {
            if (s < 20 || s > 73) return false;
            if (!element || element === 'none') {
                // 精制长剑: broad royal claymore with slight leaf swell at s=48..58 & sharp diamond point
                const w = s < 54 ? 6 : s < 62 ? 7 : Math.max(0, Math.floor((74 - s) * 0.6));
                return Math.abs(d) <= w;
            }
            if (element === 'water') {
                // 潮汐长剑: curving cutlass with 3 dramatic wave-fin serrations on upper-left spine
                const wave = (s >= 30 && s <= 37) || (s >= 43 && s <= 50) || (s >= 56 && s <= 62) ? 3 : 0;
                const wLeft = s > 64 ? Math.max(0, Math.floor((73 - s) * 0.6)) : 5 + wave - (s % 6 === 0 ? 1 : 0);
                const wRight = s > 62 ? Math.max(0, Math.floor((73 - s) * 0.65)) : s > 44 ? 6 : 5;
                return d >= -wLeft && d <= wRight;
            }
            if (element === 'earth' && !refined) {
                // 琥岩长剑: heavy basalt broadsword with 3 erupting raw amber crystal shards on upper-left
                const crystal = (s >= 28 && s <= 36) || (s >= 42 && s <= 50) || (s >= 54 && s <= 62) ? 3 : 0;
                const wLeft = s > 64 ? Math.max(0, 71 - s) : 5 + crystal;
                const wRight = s > 62 ? Math.max(0, 71 - s) : 6;
                return d >= -wLeft && d <= wRight;
            }
            if (element === 'earth') {
                // 琥岩精制长剑: colossal black-gold dragon greatsword with twin symmetrical crystal side-spurs
                const spur = (s >= 33 && s <= 40) || (s >= 49 && s <= 56) ? 3 : 0;
                const w = s > 64 ? Math.max(0, Math.floor((74 - s) * 0.75)) : 6 + spur;
                return Math.abs(d) <= w;
            }
            if (element === 'wind' && !refined) {
                // 岚羽长剑: sleek gale blade with swept-back feather barbs at s=28..38
                const barb = s >= 28 && s <= 37 ? Math.floor((38 - s) * 0.45) : 0;
                const w = s > 62 ? Math.max(0, Math.floor((74 - s) * 0.5)) : 5 + barb;
                return Math.abs(d) <= w;
            }
            if (element === 'wind') {
                // 岚羽精制长剑: valkyrie twin-winged tempest sword with double feather-fins at s=27..45
                const fin = (s >= 27 && s <= 35) || (s >= 38 && s <= 45) ? 4 : 0;
                const w = s > 64 ? Math.max(0, Math.floor((74 - s) * 0.6)) : 5 + fin;
                return Math.abs(d) <= w;
            }
            // 熔羽精制长剑 (fire): blazing phoenix flamberge with 3 pairs of flame-plume wings along the blade
            const flame = (s >= 28 && s <= 35) || (s >= 41 && s <= 48) || (s >= 54 && s <= 60) ? 3 : 0;
            const w = s > 64 ? Math.max(0, Math.floor((74 - s) * 0.65)) : 5 + flame;
            return Math.abs(d) <= w;
        },
        (s, d) => {
            // Central glowing fuller / elemental core (s = 24..56, |d| <= 2)
            if (s >= 24 && s <= 56 && Math.abs(d) <= 1) {
                return d <= 0 ? t.coreShine : t.coreLit;
            }
            if (s >= 24 && s <= 54 && Math.abs(d) === 2) {
                return element === 'fire' ? t.bladeBase : element === 'earth' && refined ? t.accentShade : t.coreBase;
            }
            if (element === 'water' && d <= -5) return t.bladeShine;
            if (element === 'earth' && !refined) {
                return d <= 0 ? (d <= -4 ? t.bladeShine : t.bladeLit) : d <= 3 ? t.coreLit : t.coreBase;
            }
            if (element === 'earth' && refined && Math.abs(d) >= 5) {
                return d < 0 ? t.bladeShine : t.bladeBase;
            }
            if (element === 'wind' && Math.abs(d) >= 5) {
                return d < 0 ? '#ffffff' : '#cbd5e1';
            }
            if (element === 'fire') {
                return Math.abs(d) <= 3 ? t.bladeLit : d < 0 ? t.bladeBase : t.bladeShade;
            }
            if (d < -2) return t.bladeShine;
            if (d < 0) return t.bladeLit;
            if (d === 0) return t.bladeShine;
            if (d <= 2) return t.bladeBase;
            return t.bladeShade;
        },
    );

    // 3. Crossguard / Elemental Wing Guard (painted over blade base for crisp internal outline!)
    paintDiagLayer(
        g,
        (s, d) => {
            const ad = Math.abs(d);
            if (!element || element === 'none') {
                // 精制长剑: sweeping golden eagle-wing crossguard curving forward
                const wingS = 21 + Math.floor(ad * 0.45);
                return ad <= 14 && s >= wingS - 3 && s <= wingS + 3;
            }
            if (element === 'water') {
                // 潮汐长剑: asymmetric coral & wave shell guard
                const shift = d < 0 ? Math.floor(-d * 0.5) : -Math.floor(d * 0.25);
                return ad <= 13 && s >= 19 + shift && s <= 25 + shift;
            }
            if (element === 'earth' && !refined) {
                // 琥岩长剑: chunky basalt & amber crag guard
                return ad <= 12 && s >= 19 && s <= 26 && ad + Math.abs(s - 22) <= 15;
            }
            if (element === 'earth') {
                // 琥岩精制长剑: forward-sweeping black-gold dragon-horn guard
                const horn = 20 + Math.floor(ad * 0.55);
                return ad <= 15 && s >= horn - 3 && s <= horn + 3;
            }
            if (element === 'wind') {
                // 岚羽 / 岚羽精制: sweeping multi-feathered snow-white angel wings!
                const maxD = refined ? 16 : 13;
                const wing = 20 + Math.floor(ad * 0.5);
                return ad <= maxD && s >= wing - 3 && s <= wing + (refined && ad % 4 !== 0 ? 4 : 3);
            }
            // 熔羽精制长剑: blazing outspread phoenix-plume guard
            const plume = 20 + Math.floor(ad * 0.55);
            return ad <= 16 && s >= plume - 3 && s <= plume + 4;
        },
        (s, d) => {
            const ad = Math.abs(d);
            if (ad <= 3 && Math.abs(s - 22) <= 2) {
                return d <= 0 ? t.coreShine : t.coreBase;
            }
            if (element === 'wind' && ad >= 5) {
                return d < 0 ? '#ffffff' : s % 2 === 0 ? '#e2e8f0' : t.accentLit;
            }
            if (element === 'fire' && ad >= 5) {
                return ad >= 11 ? t.bladeLit : d < 0 ? t.bladeBase : t.bladeShade;
            }
            return d < 0 ? t.guardLit : d <= 2 ? t.guardBase : t.guardShade;
        },
    );
}

/** Draw all 7 redesigned battleaxes (grip at (13,34) => s=14, d=0). */
export function drawRedesignedAxe(g: EquipmentPixelPainter, element?: WeaponElement, refined = false) {
    const t = getTheme(element, refined);

    // 1. Long diagonal haft (s = 0..64, |d| <= 3) + top spear spike for refined/30 axes
    paintDiagLayer(
        g,
        (s, d) => {
            if (s >= -2 && s <= 5 && Math.abs(s - 2) + Math.abs(d) <= 6) return true;
            const maxS = refined || element === 'fire' ? 71 : 60;
            if (s < 4 || s > maxS) return false;
            const w = s > 58 ? Math.max(0, Math.floor((72 - s) * 0.45)) : 3;
            return Math.abs(d) <= w;
        },
        (s, d) => {
            if (s <= 5) return d < 0 ? t.guardLit : t.guardShade;
            if (s >= 58) return d < 0 ? t.bladeShine : d === 0 ? t.bladeLit : t.bladeBase;
            if (s === 12 || s === 18 || s === 24) return t.wrap;
            return d < 0 ? t.handleLit : d === 0 ? t.handleBase : t.handleShade;
        },
    );

    // 2. Massive Axe Head Body (s = 20..62, d spanning -16..+19) — solid, meaty flaring crescent/wing silhouettes
    paintDiagLayer(
        g,
        (s, d) => {
            const ds = s - 42;
            const flare = Math.min(8, Math.floor((Math.abs(ds) * 0.55)));
            if (!element || element === 'none') {
                // 精制战斧: broad double-bit royal crescent halberd
                if (d >= 2 && d <= 19 && s >= 24 && s <= 58) {
                    const outer = 19 - Math.floor((ds / 4.2) ** 2);
                    return d <= outer && d >= 2 + (Math.abs(ds) > 9 ? flare : 0);
                }
                if (d <= -2 && d >= -15 && s >= 28 && s <= 56) {
                    const outer = 15 - Math.floor((ds / 3.8) ** 2);
                    return -d <= outer && -d >= 2 + (Math.abs(ds) > 8 ? flare : 0);
                }
                return false;
            }
            if (element === 'water') {
                // 潮汐战斧: wide scalloped tsunami-wave fin blade (d>0) + twin coral hooks (d<0)
                if (d >= 2 && d <= 20 && s >= 22 && s <= 60) {
                    const wave = (s >= 26 && s <= 33) || (s >= 38 && s <= 46) || (s >= 50 && s <= 57) ? 2 : 0;
                    const outer = 18 + wave - Math.floor((ds / 4.4) ** 2);
                    return d <= outer && d >= 2 + (Math.abs(ds) > 10 ? flare : 0);
                }
                if (d <= -2 && d >= -15 && s >= 28 && s <= 56) {
                    const hook = (s >= 31 && s <= 39) || (s >= 45 && s <= 53) ? 4 : 0;
                    return -d <= 10 + hook - Math.floor((ds / 4.2) ** 2);
                }
                return false;
            }
            if (element === 'earth' && !refined) {
                // 琥岩战斧: heavy basalt cleaver with 3 huge amber crystal teeth (d>0) & wide rock-breaker hammer poll (d<0)
                if (d >= 2 && d <= 20 && s >= 23 && s <= 59) {
                    const tooth = (s >= 26 && s <= 34) || (s >= 38 && s <= 46) || (s >= 50 && s <= 57) ? 3 : 0;
                    const outer = 17 + tooth - Math.floor((ds / 4.5) ** 2);
                    return d <= outer && d >= 2 + (Math.abs(ds) > 11 ? flare - 2 : 0);
                }
                return d <= -2 && d >= -14 && s >= 31 && s <= 53 && -d + Math.floor(Math.abs(ds) * 0.4) <= 15;
            }
            if (element === 'earth') {
                // 琥岩精制战斧: colossal symmetrical double-headed dragon-amber battleaxe
                const ad = Math.abs(d);
                if (ad < 2 || ad > 19 || s < 22 || s > 60) return false;
                const horn = (s >= 25 && s <= 33) || (s >= 50 && s <= 58) ? 2 : 0;
                const outer = 18 + horn - Math.floor((ds / 4.3) ** 2);
                return ad <= outer && ad >= 2 + (Math.abs(ds) > 10 ? flare : 0);
            }
            if (element === 'wind' && !refined) {
                // 岚羽战斧: sweeping falcon-wing blade (d>0) + layered white feather tail-wing (d<0)
                if (d >= 2 && d <= 20 && s >= 22 && s <= 62) {
                    const plume = (s >= 26 && s <= 34) || (s >= 38 && s <= 47) || (s >= 51 && s <= 59) ? 2 : 0;
                    const outer = 18 + plume - Math.floor((ds / 4.6) ** 2);
                    return d <= outer && d >= 2 + (Math.abs(ds) > 10 ? flare : 0);
                }
                return d <= -2 && d >= -15 && s >= 28 && s <= 58 && -d <= 15 - Math.floor(Math.abs(ds) * 0.5);
            }
            if (element === 'wind') {
                // 岚羽精制战斧: grand twin-winged valkyrie tempest great-axe
                const ad = Math.abs(d);
                if (ad < 2 || ad > 20 || s < 20 || s > 63) return false;
                const feather = (s >= 23 && s <= 31) || (s >= 36 && s <= 46) || (s >= 51 && s <= 60) ? 2 : 0;
                const outer = 18 + feather - Math.floor((ds / 4.6) ** 2);
                return ad <= outer && ad >= 2 + (Math.abs(ds) > 10 ? flare : 0);
            }
            // 熔羽精制战斧 (fire): blazing twin phoenix-wing great-axe
            const ad = Math.abs(d);
            if (ad < 2 || ad > 20 || s < 20 || s > 63) return false;
            const flame = (s >= 22 && s <= 31) || (s >= 35 && s <= 46) || (s >= 50 && s <= 60) ? 3 : 0;
            const outer = 17 + flame - Math.floor((ds / 4.6) ** 2);
            return ad <= outer && ad >= 2 + (Math.abs(ds) > 10 ? flare : 0);
        },
        (s, d) => {
            const ad = Math.abs(d);
            if (element === 'water' && d < 0) return s < 42 ? t.guardLit : t.guardBase;
            if (element === 'earth' && !refined && d < 0) return ad >= 9 ? t.bladeLit : d < -6 ? t.coreLit : t.coreBase;
            if (element === 'wind' && d < 0) return ad >= 9 ? '#ffffff' : '#cbd5e1';
            if (element === 'wind' && refined && ad >= 8 && ad <= 12) return '#ffffff';
            if (element === 'fire') {
                return ad >= 14 ? t.bladeShine : ad >= 10 ? t.bladeLit : ad >= 6 ? t.bladeBase : t.bladeShade;
            }
            if (ad >= 13) return d < 0 || s > 40 ? t.bladeShine : t.bladeLit;
            if (ad >= 9) return t.bladeLit;
            if (ad >= 6) return t.bladeBase;
            return t.bladeShade;
        },
    );

    // 3. Central Armored Axe Collar & Elemental Core Gem (s = 33..51, |d| <= 6)
    paintDiagLayer(
        g,
        (s, d) => s >= 34 && s <= 50 && Math.abs(d) <= 6 && Math.abs(s - 42) + Math.abs(d) <= 10,
        (s, d) => {
            if (Math.abs(s - 42) + Math.abs(d) <= 4) {
                return d <= 0 ? t.coreShine : t.coreBase;
            }
            return d < 0 ? t.guardLit : d <= 1 ? t.guardBase : t.guardShade;
        },
    );
}

/** Draw all 7 redesigned hunting daggers (grip at (14,33) => s=16, d=0). */
export function drawRedesignedDagger(g: EquipmentPixelPainter, element?: WeaponElement, refined = false) {
    const t = getTheme(element, refined);

    // 1. Ring Pommel (s = 2..10) & Compact Grip (s = 10..24)
    paintDiagLayer(
        g,
        (s, d) => {
            if (s >= 10 && s <= 24 && Math.abs(d) <= 3) return true;
            return s >= 1 && s <= 10 && Math.abs(s - 5) + Math.abs(d) <= 6;
        },
        (s, d) => {
            if (s <= 9) {
                if (Math.abs(s - 5) + Math.abs(d) <= 2) return t.coreShine;
                return d < 0 ? t.guardLit : t.guardBase;
            }
            if (s === 14 || s === 19) return t.wrap;
            return d < 0 ? t.handleLit : d === 0 ? t.handleBase : t.handleShade;
        },
    );

    // 2. Curved / Fang / Winged Dagger Blade (s = 24..64)
    paintDiagLayer(
        g,
        (s, d) => {
            if (s < 24 || s > 64) return false;
            const curve = Math.floor(Math.sin(((s - 24) / 40) * Math.PI) * 3);
            if (!element || element === 'none') {
                // 精制猎手短刃: broad S-curved Kukri hunting blade with saw-back notches
                const notch = s >= 30 && s <= 44 && s % 5 === 0 ? -1 : 0;
                const wLeft = s > 54 ? Math.max(0, 64 - s) : 6 + notch;
                const wRight = s > 52 ? Math.max(0, 64 - s) : 5 + curve;
                return d >= -wLeft && d <= wRight;
            }
            if (element === 'water') {
                // 潮汐猎手短刃: shark-fin dorsal spike (d < 0) + wave-curved cutting belly (d > 0)
                const fin = s >= 34 && s <= 46 ? 4 : 0;
                const wLeft = s > 54 ? Math.max(0, 64 - s) : 5 + fin;
                const wRight = s > 52 ? Math.max(0, 64 - s) : 5 + curve;
                return d >= -wLeft && d <= wRight;
            }
            if (element === 'earth' && !refined) {
                // 琥岩猎手短刃: jagged amber crystal fang with stepped crag back
                const step = s < 42 ? 7 : s < 52 ? 5 : Math.max(0, 63 - s);
                return d >= -step && d <= step;
            }
            if (element === 'earth') {
                // 琥岩精制猎手短刃: twin-pronged dragon-fang amber katar/kris
                if (s >= 54 && Math.abs(d) <= 1) return false; // Forked twin-tip notch!
                const w = s > 54 ? Math.max(0, 65 - s) : 7 + (s >= 34 && s <= 44 ? 2 : 0);
                return Math.abs(d) <= w;
            }
            if (element === 'wind') {
                // 岚羽 / 岚羽精制猎手短刃: sweeping falcon-talon curve with white feather plume on spine
                const plume = (s >= 28 && s <= 38) || (refined && s >= 42 && s <= 50) ? 4 : 0;
                const wLeft = s > 54 ? Math.max(0, 64 - s) : 5 + plume;
                const wRight = s > 52 ? Math.max(0, 64 - s) : 5 + curve;
                return d >= -wLeft && d <= wRight;
            }
            // 熔羽精制猎手短刃 (fire): wavy phoenix-claw flame kris
            const wave = Math.round(Math.sin((s - 24) * 0.35) * 2);
            const w = s > 54 ? Math.max(0, 64 - s) : 6 + (s >= 34 && s <= 46 ? 2 : 0);
            return d >= -w + wave && d <= w + wave;
        },
        (s, d) => {
            if (s >= 27 && s <= 48 && Math.abs(d) <= 1) return d <= 0 ? t.coreShine : t.coreLit;
            if (element === 'wind' && d <= -5) return '#ffffff';
            if (element === 'fire') return Math.abs(d) <= 2 ? t.bladeShine : d < 0 ? t.bladeLit : t.bladeBase;
            if (d < -2) return t.bladeShine;
            if (d <= 0) return t.bladeLit;
            if (d <= 3) return t.bladeBase;
            return t.bladeShade;
        },
    );

    // 3. Swept Knuckle / Wing / Coral Guard (s = 21..28)
    paintDiagLayer(
        g,
        (s, d) => {
            const ad = Math.abs(d);
            const maxD = refined || element === 'wind' || element === 'fire' ? 12 : 10;
            const shift = d > 0 ? Math.floor(d * 0.35) : -Math.floor(-d * 0.25);
            return ad <= maxD && s >= 22 + shift && s <= 27 + shift;
        },
        (_s, d) => {
            if (Math.abs(d) <= 2) return t.coreShine;
            if (element === 'wind' && Math.abs(d) >= 5) return '#ffffff';
            return d < 0 ? t.guardLit : d <= 2 ? t.guardBase : t.guardShade;
        },
    );
}
