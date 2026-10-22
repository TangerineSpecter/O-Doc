export type MeadowKey = 'slime' | 'rabbit' | 'beetle' | 'glowbug';
export type MeadowMonsterId = 'monster.slime' | 'monster.fuzzy_ear_rabbit' | 'monster.leafshell_beetle' | 'monster.dawnfire_glowbug';
export type MeadowMotion = 'idle' | 'move' | 'attack' | 'hit' | 'defeat';
export type Facing = -1 | 1;

export interface MeadowPose {
    x: number; y: number; sx: number; sy: number; sway: number; walk: number;
    wobble: number; blink: boolean; hurt: boolean; flash: boolean; tilt: number;
    fade: number; hidden: boolean; facing: Facing; action: MeadowMotion; elapsed: number;
    fracture?: number;
}
export interface PixelOptions { layers?: boolean; dither?: boolean }
export interface IndexedSprite {
    source: string; sourceFacing: Facing; width: number; height: number;
    palette: string[]; pixels: string;
}
export interface MeadowProfile {
    key: MeadowKey; sourceFacing: Facing; ranged: boolean; airborne: boolean;
    colors: readonly string[];
}
export const meadowProfiles: Readonly<Record<string, MeadowProfile>> = {
    'monster.slime': {key: 'slime', sourceFacing: 1, ranged: false, airborne: false, colors: ['#d3fdff', '#80d5e9', '#459cc5']},
    'monster.fuzzy_ear_rabbit': {key: 'rabbit', sourceFacing: 1, ranged: false, airborne: false, colors: ['#fff3d6', '#efce9d', '#ce9e73']},
    'monster.leafshell_beetle': {key: 'beetle', sourceFacing: -1, ranged: false, airborne: false, colors: ['#e0ed9c', '#a6c766', '#668f4c']},
    'monster.dawnfire_glowbug': {key: 'glowbug', sourceFacing: -1, ranged: true, airborne: true, colors: ['#fff7c2', '#ffe47d', '#eebc44']},
};

/** A left-facing original stays unmirrored when the enemy stands on the right. */
export const shouldMirrorMeadow = (key: MeadowKey, facing: Facing) =>
    facing !== Object.values(meadowProfiles).find(profile => profile.key === key)!.sourceFacing;

export const isMeadowMonsterId = (id: string): id is MeadowMonsterId => Object.prototype.hasOwnProperty.call(meadowProfiles, id);
