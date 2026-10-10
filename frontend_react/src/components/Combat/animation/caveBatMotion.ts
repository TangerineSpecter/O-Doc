export const caveBatActions = ['idle', 'move', 'attack', 'hit', 'defeat'] as const;
export type CaveBatAction = typeof caveBatActions[number] | 'dodge';
export type CaveBatFacing = -1 | 1;
export interface CaveBatPose {
    x: number; lift: number; scaleX: number; scaleY: number; rotation: number;
    wingSpread: number; wingLift: number; blink: number;
    expression: 'happy' | 'determined' | 'hurt' | 'dizzy'; flash: number; trail: number;
}
export const caveBatDurations: Record<CaveBatAction, number> = {
    idle: Infinity, move: Infinity, attack: 1.45, hit: .8, defeat: 1.4, dodge: 1.1,
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Animation only: dodge does not decide whether a combat attack misses. */
export function sampleCaveBatPose(action: CaveBatAction, time: number, facing: CaveBatFacing): CaveBatPose {
    const flap = Math.sin(time * 7.8);
    const blink = time % 4.9;
    const pose: CaveBatPose = {
        x: 0, lift: 35 + Math.sin(time * 2.6) * 6,
        scaleX: 1 + Math.sin(time * 2.6) * .012, scaleY: 1 - Math.sin(time * 2.6) * .012,
        rotation: Math.sin(time * 1.7) * .025,
        wingSpread: .9 + flap * .1, wingLift: flap * .16, blink: blink > 4.1 && blink < 4.27 ? .1 : 1,
        expression: 'happy', flash: 0, trail: 0,
    };
    if (action === 'move') {
        pose.x = Math.sin(time * 1.65) * 105;
        pose.lift = 48 + Math.sin(time * 3.3) * 18;
        pose.rotation = Math.cos(time * 1.65) * .12;
        pose.wingSpread = .86 + Math.sin(time * 11) * .12;
        pose.wingLift = Math.sin(time * 11) * .23;
    } else if (action === 'attack') {
        pose.expression = 'determined';
        if (time < .28) {
            const p = ease(time / .28);
            pose.x = -25 * p * facing;
            pose.lift = 35 + p * 25;
            pose.wingSpread = 1 - p * .18;
            pose.rotation = -.1 * p * facing;
        } else if (time < .8) {
            const p = ease((time - .28) / .52);
            pose.x = (-25 + 166 * p) * facing;
            pose.lift = 60 - 44 * p;
            pose.wingSpread = .82 - .28 * Math.sin(p * Math.PI);
            pose.rotation = .3 * Math.sin(p * Math.PI) * facing;
            pose.trail = Math.sin(p * Math.PI);
        } else {
            const p = ease((time - .8) / .65);
            pose.x = 141 * (1 - p) * facing;
            pose.lift = 16 + 19 * p + Math.sin(p * Math.PI) * 20;
            pose.rotation = -.12 * Math.sin(p * Math.PI) * facing;
            pose.expression = p > .6 ? 'happy' : 'determined';
        }
    } else if (action === 'hit') {
        const p = clamp(time / .8), wobble = Math.sin(p * Math.PI * 4) * (1 - p);
        pose.x = -facing * Math.sin(p * Math.PI) * 38;
        pose.lift = 35 - Math.sin(p * Math.PI) * 16;
        pose.rotation = -.18 * wobble * facing;
        pose.scaleX = 1 + wobble * .1;
        pose.scaleY = 1 - wobble * .1;
        pose.wingSpread = .72 + p * .18;
        pose.expression = 'hurt';
        pose.flash = p < .3 ? Math.sin(p / .3 * Math.PI) * .65 : 0;
    } else if (action === 'defeat') {
        const p = ease(time / 1.15);
        pose.x = 0;
        pose.lift = 35 * (1 - p) - 14 * p;
        pose.scaleX = 1 + p * .12;
        pose.scaleY = 1 - p * .45;
        pose.rotation = .13 * p * facing;
        pose.wingSpread = 1 - p * .7;
        pose.wingLift = .5 * p;
        pose.expression = 'dizzy';
        pose.blink = 1;
    } else if (action === 'dodge') {
        const p = clamp(time / 1.1), sweep = Math.sin(p * Math.PI);
        pose.x = -110 * sweep * facing;
        pose.lift = 35 + sweep * 35;
        pose.rotation = -.22 * sweep * facing;
        pose.wingSpread = .9 - .28 * sweep;
        pose.wingLift = Math.sin(time * 15) * .2;
        pose.trail = sweep;
        pose.expression = 'determined';
    }
    return pose;
}
