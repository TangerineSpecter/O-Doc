export const slimeActions = ['idle', 'move', 'attack', 'hit', 'defeat'] as const;
export type SlimeAction = typeof slimeActions[number];
export type SlimeFacing = -1 | 1;
export type SlimeExpression = 'happy' | 'determined' | 'hurt' | 'dizzy';

export interface SlimePose {
    x: number;
    lift: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    blink: number;
    flash: number;
    impact: number;
    expression: SlimeExpression;
}

export const slimeDurations: Record<SlimeAction, number> = {
    idle: Infinity, move: Infinity, attack: 1.3, hit: .85, defeat: 1.5,
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Local animation time is independent of combat clocks, damage and persistent facts. */
export function sampleSlimePose(action: SlimeAction, time: number, facing: SlimeFacing): SlimePose {
    const breathe = Math.sin(time * 3.2);
    const blinkTime = time % 4.6;
    const pose: SlimePose = {
        x: 0, lift: 0, scaleX: 1 + breathe * .025, scaleY: 1 - breathe * .025,
        rotation: Math.sin(time * 1.6) * .018, blink: blinkTime > 3.9 && blinkTime < 4.07 ? .12 : 1,
        flash: 0, impact: 0, expression: 'happy',
    };
    if (action === 'move') {
        const phase = (time % .9) / .9;
        const hop = Math.max(0, Math.sin(phase * Math.PI));
        pose.x = Math.sin(time * 1.45) * 115;
        pose.lift = hop * 60;
        pose.scaleX = 1.12 - hop * .2;
        pose.scaleY = .87 + hop * .27;
        pose.rotation = Math.cos(phase * Math.PI) * .09 * facing;
        pose.impact = phase < .15 ? (1 - phase / .15) * .5 : 0;
    } else if (action === 'attack') {
        pose.expression = 'determined';
        if (time < .25) {
            const charge = ease(time / .25);
            pose.scaleX = 1 + charge * .3;
            pose.scaleY = 1 - charge * .33;
            pose.x = -18 * charge * facing;
        } else if (time < .8) {
            const p = (time - .25) / .55;
            pose.x = (-18 + 165 * ease(p)) * facing;
            pose.lift = Math.sin(p * Math.PI) * 110;
            pose.scaleX = .9 + .28 * p;
            pose.scaleY = 1.12 - .4 * p;
            pose.rotation = .2 * Math.sin(p * Math.PI) * facing;
        } else {
            const p = clamp((time - .8) / .5);
            const rebound = Math.sin(p * Math.PI * 3) * (1 - p);
            pose.x = 147 * (1 - ease(p)) * facing;
            pose.scaleX = 1 + .32 * rebound;
            pose.scaleY = 1 - .29 * rebound;
            pose.impact = Math.max(0, 1 - p * 3);
            pose.expression = p > .6 ? 'happy' : 'determined';
        }
    } else if (action === 'hit') {
        const p = clamp(time / .85);
        const recoil = Math.sin(p * Math.PI * 5) * (1 - p);
        pose.x = -facing * Math.sin(p * Math.PI) * 42;
        pose.scaleX = 1 + recoil * .22;
        pose.scaleY = 1 - recoil * .19;
        pose.rotation = recoil * -.14 * facing;
        pose.expression = 'hurt';
        pose.flash = p < .42 ? Math.max(0, Math.sin(p * Math.PI * 10)) * .7 : 0;
        pose.impact = Math.max(0, 1 - p * 4);
    } else if (action === 'defeat') {
        const melt = ease(time / 1.1);
        pose.scaleX = 1 + .5 * melt;
        pose.scaleY = 1 - .8 * melt;
        pose.rotation = 0;
        pose.expression = 'dizzy';
        pose.blink = 1;
    }
    return pose;
}
